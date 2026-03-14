import { Sandbox } from '@e2b/code-interpreter';
import {
	createAgent,
	createAgenticModelFromAiAdapter,
	createNetwork,
	createState,
	createTool,
	openai,
	type Message,
	type Tool,
} from '@inngest/agent-kit';
import { NonRetriableError } from 'inngest';
import { z } from 'zod';

import { FRAGMENT_TITLE_PROMPT, PROMPT, RESPONSE_PROMPT } from '@/config';
import { SANDBOX_TEMPLATE_NAME, SANDBOX_TIMEOUT } from '@/constants';
import { AIProvider, MessageRole, MessageType } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { generateTextFromMessage } from '@/lib/utils';

import { inngest } from './client';
import { getLastAssistantTextMessageContent, getSandbox } from './utils';

const DEFAULT_MODELS: Record<AIProvider, { mainModel: string; miniModel: string }> = {
	OPENAI: {
		mainModel: 'gpt-4.1',
		miniModel: 'gpt-4o-mini',
	},
	OPENROUTER: {
		mainModel: 'openai/gpt-4.1',
		miniModel: 'openai/gpt-4o-mini',
	},
	AZURE_OPENAI: {
		mainModel: 'gpt-4o',
		miniModel: 'gpt-4o-mini',
	},
};

interface ProviderSettings {
	apiKey: string;
	azureApiVersion?: string | null;
	azureEndpoint?: string | null;
	model?: string | null;
	provider: AIProvider;
}

/**
 * Build an Azure OpenAI adapter manually since @inngest/agent-kit
 * doesn't re-export azureOpenai() from @inngest/ai in this version.
 */
function createAzureOpenaiAdapter(opts: {
	apiKey: string;
	apiVersion: string;
	deployment: string;
	endpoint: string;
	model: string;
}) {
	const baseEndpoint = opts.endpoint.replace(/\/+$/, '');
	const url = `${baseEndpoint}/openai/deployments/${opts.deployment}/chat/completions?api-version=${opts.apiVersion}`;

	return createAgenticModelFromAiAdapter({
		authKey: opts.apiKey,
		format: 'azure-openai' as 'openai-chat',
		headers: {
			'Content-Type': 'application/json',
			'api-key': opts.apiKey,
		},
		onCall: (_model: unknown, body: Record<string, unknown>) => {
			body.model = opts.model;
			body.temperature = 0.1;
		},
		options: {
			apiKey: opts.apiKey,
			model: opts.model,
		},
		url,
	});
}

function getModelConfig(settings: ProviderSettings, variant: 'main' | 'mini') {
	const { apiKey, azureApiVersion, azureEndpoint, model, provider } = settings;
	const defaults = DEFAULT_MODELS[provider];
	const selectedModel = variant === 'main'
		? (model || defaults.mainModel)
		: defaults.miniModel;

	if (provider === 'AZURE_OPENAI') {
		return createAzureOpenaiAdapter({
			apiKey,
			apiVersion: azureApiVersion || '2024-02-01',
			deployment: selectedModel,
			endpoint: azureEndpoint || '',
			model: selectedModel,
		});
	}

	if (provider === 'OPENROUTER') {
		return openai({
			apiKey,
			baseUrl: 'https://openrouter.ai/api/v1',
			defaultParameters: { temperature: 0.1 },
			model: selectedModel,
		});
	}

	return openai({
		apiKey,
		defaultParameters: { temperature: 0.1 },
		model: selectedModel,
	});
}

interface AgentState {
	summary: string;
	files: { [path: string]: string };
}

export const codeAgentFunction = inngest.createFunction(
	{ id: 'code-agent' },
	{ event: 'code-agent/run' },
	async ({ event, step }) => {
		const projectId = event.data.projectId as string;

		const settings = await step.run('get-api-key', async () => {
			const project = await db.project.findUnique({
				select: {
					userId: true,
				},
				where: {
					id: projectId,
				},
			});

			if (!project) throw new NonRetriableError('Project not found');

			const userSettings = await db.userSettings.findUnique({
				where: {
					userId: project.userId,
				},
			});

			if (!userSettings) throw new NonRetriableError('AI settings not found');

			return {
				apiKey: decrypt(userSettings.apiKey),
				azureApiVersion: userSettings.azureApiVersion,
				azureEndpoint: userSettings.azureEndpoint,
				model: userSettings.model,
				provider: userSettings.provider,
			};
		});

		const sandboxInfo = await step.run('create-sandbox', async () => {
			const sandbox = await Sandbox.create(SANDBOX_TEMPLATE_NAME);

			await sandbox.setTimeout(SANDBOX_TIMEOUT);
			const host = sandbox.getHost(3000);
			return { sandboxId: sandbox.sandboxId, sandboxUrl: `https://${host}` };
		});

		const sandboxId = sandboxInfo.sandboxId;
		const sandboxUrl = sandboxInfo.sandboxUrl;

		// Create an early "in-progress" message with the sandbox preview so
		// the right-hand panel shows the live sandbox while the agent works.
		const earlyMessageId = await step.run('create-preview-message', async () => {
			const message = await db.message.create({
				data: {
					content: 'Building your app...',
					fragment: {
						create: {
							files: {},
							sandboxUrl,
							title: 'Working...',
						},
					},
					projectId: projectId,
					role: MessageRole.ASSISTANT,
					type: MessageType.RESULT,
				},
			});
			return message.id;
		});

		const previousMessages = await step.run('get-previous-messages', async () => {
			const formattedMessages: Message[] = [];

			const messages = await db.message.findMany({
				orderBy: {
					createdAt: 'desc',
				},
				take: 5,
				where: {
					id: { not: earlyMessageId },
					projectId: projectId,
				},
			});

			for (const message of messages) {
				formattedMessages.push({
					content: message.content,
					role: message.role === MessageRole.ASSISTANT ? 'assistant' : 'user',
					type: 'text',
				});
			}

			return formattedMessages.reverse();
		});

		const state = createState<AgentState>(
			{
				files: {},
				summary: '',
			},
			{
				messages: previousMessages,
			}
		);

		const codeAgent = createAgent<AgentState>({
			description: 'An expert coding agent',
			lifecycle: {
				onResponse: async ({ network, result }) => {
					const lastAssistantTextMessage = getLastAssistantTextMessageContent(result);

					if (lastAssistantTextMessage && lastAssistantTextMessage.includes('<task_summary>') && network)
						network.state.data.summary = lastAssistantTextMessage;

					return result;
				},
			},
			model: getModelConfig(settings, 'main'),
			name: 'code-agent',
			system: PROMPT,
			tools: [
				createTool({
					description: 'Use the terminal to run commands',
					handler: async ({ command }, { step }) => {
						return await step?.run('terminal', async () => {
							const buffers = { stderr: '', stdout: '' };

							try {
								const sandbox = await getSandbox(sandboxId);
								const result = await sandbox.commands.run(command, {
									onStderr: (data: string) => {
										buffers.stderr += data;
									},
									onStdout: (data: string) => {
										buffers.stdout += data;
									},
								});

								return result.stdout;
							} catch (err) {
								console.error(`Command failed: ${err} \nstdout: ${buffers.stdout} \nstderror: ${buffers.stderr}`);

								return `Command failed: ${err} \nstdout: ${buffers.stdout} \nstderror: ${buffers.stderr}`;
							}
						});
					},
					name: 'terminal',
					parameters: z.object({
						command: z.string(),
					}),
				}),
				createTool({
					description: 'Create or update files in the sandbox',
					handler: async ({ files }, { network, step }: Tool.Options<AgentState>) => {
						const newFiles = await step?.run('create-or-update-files', async () => {
							try {
								const updatedFiles = network.state.data.files || {};
								const sandbox = await getSandbox(sandboxId);

								for (const file of files) {
									// Auto-fix common code issues before writing
									let content = file.content;
									if (file.path.endsWith('.tsx') || file.path.endsWith('.ts') || file.path.endsWith('.jsx') || file.path.endsWith('.js')) {
										// Fix "use client" / "use server" directives without quotes
										content = content.replace(/^use client\s*$/m, '"use client"');
										content = content.replace(/^use server\s*$/m, '"use server"');
									}
									await sandbox.files.write(file.path, content);
									updatedFiles[file.path] = content;
								}

								return updatedFiles;
							} catch (err) {
								console.error('Error creating or updating files: ' + err);

								return 'Error: ' + err;
							}
						});

						if (typeof newFiles === 'object') network.state.data.files = newFiles;
					},
					name: 'createOrUpdateFiles',
					parameters: z.object({
						files: z.array(
							z.object({
								content: z.string(),
								path: z.string(),
							})
						),
					}),
				}),
				createTool({
					description: 'Read files from the sandbox',
					handler: async ({ files }, { step }) => {
						return await step?.run('read-files', async () => {
							try {
								const sandbox = await getSandbox(sandboxId);
								const contents: { content: string; path: string }[] = [];

								for (const file of files) {
									const content = await sandbox.files.read(file);

									contents.push({ content, path: file });
								}

								return JSON.stringify(contents);
							} catch (err) {
								console.error('Error reading files: ' + err);

								return 'Error: ' + err;
							}
						});
					},
					name: 'readFiles',
					parameters: z.object({
						files: z.array(z.string()),
					}),
				}),
			],
		});

		const network = createNetwork<AgentState>({
			agents: [codeAgent],
			defaultState: state,
			maxIter: 25,
			name: 'code-agent-network',
			router: async ({ network }) => {
				const summary = network.state.data.summary;

				if (summary) return;

				return codeAgent;
			},
		});

		const result = await network.run(event.data.value, { state });

		const hasFiles = Object.keys(result.state.data.files || {}).length > 0;
		const isError = !hasFiles;

		// Use the agent summary if available, otherwise build a fallback from
		// the user prompt so that the title / response generators still work.
		const summaryText = result.state.data.summary
			|| (hasFiles
				? `<task_summary>Completed the requested task: ${event.data.value}</task_summary>`
				: '');

		const fragmentTitleGenerator = createAgent({
			description: 'A fragment title generator',
			model: getModelConfig(settings, 'mini'),
			name: 'fragment-title-generator',
			system: FRAGMENT_TITLE_PROMPT,
		});

		const responseGenerator = createAgent({
			description: 'A response title generator',
			model: getModelConfig(settings, 'mini'),
			name: 'response-title-generator',
			system: RESPONSE_PROMPT,
		});

		const { output: fragmentTitleOutput } = await fragmentTitleGenerator.run(summaryText);
		const { output: responseOutput } = await responseGenerator.run(summaryText);

		await step.run('save-result', async () => {
			if (isError) {
				// Delete the preview fragment and update the message to show error
				await db.fragment.deleteMany({ where: { message: { id: earlyMessageId } } });
				return await db.message.update({
					where: { id: earlyMessageId },
					data: {
						content: 'Something went wrong. Please try again.',
						type: MessageType.ERROR,
					},
				});
			}

			// Update the early message + fragment with the final result
			await db.message.update({
				where: { id: earlyMessageId },
				data: {
					content: generateTextFromMessage({ defaultText: 'Here you go', message: responseOutput[0] }),
				},
			});

			return await db.fragment.update({
				where: { messageId: earlyMessageId },
				data: {
					files: result.state.data.files,
					title: generateTextFromMessage({ defaultText: 'Fragment', message: fragmentTitleOutput[0] }),
				},
			});
		});

		return {
			files: result.state.data.files,
			summary: result.state.data.summary,
			title: 'Fragment',
			url: sandboxUrl,
		};
	}
);
