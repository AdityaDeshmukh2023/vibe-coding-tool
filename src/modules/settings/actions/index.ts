'use server';

import { OpenAI, AzureOpenAI } from 'openai';

import type { AIProviderType } from '@/modules/settings/schemas/ai-settings-schema';

import { getAISettingsErrorMessage } from '@/lib/utils';

interface VerifyOptions {
	apiKey: string;
	azureApiVersion?: string;
	azureEndpoint?: string;
	model?: string;
	provider: AIProviderType;
}

export const verifyAISettings = async (options: VerifyOptions) => {
	try {
		const { apiKey, azureApiVersion, azureEndpoint, model, provider } = options;

		let client: OpenAI;
		let testModel: string;

		switch (provider) {
			case 'AZURE_OPENAI': {
				if (!azureEndpoint || !azureApiVersion) throw new Error('Azure endpoint and API version are required');
				client = new AzureOpenAI({
					apiKey,
					apiVersion: azureApiVersion,
					endpoint: azureEndpoint,
				});
				testModel = model || 'gpt-4o-mini';
				break;
			}
			case 'OPENROUTER': {
				client = new OpenAI({
					apiKey,
					baseURL: 'https://openrouter.ai/api/v1',
				});
				testModel = model || 'openai/gpt-4o-mini';
				break;
			}
			default: {
				client = new OpenAI({ apiKey });
				testModel = model || 'gpt-4o-mini';
				break;
			}
		}

		const completion = await client.chat.completions.create({
			max_completion_tokens: 5, // eslint-disable-line camelcase -- OpenAI API parameter
			messages: [{ content: 'hi', role: 'user' }],
			model: testModel,
		});

		if (!completion.choices[0]?.message?.content) throw new Error('No response from API');

		return { error: null, success: true };
	} catch (error) {
		return { error: getAISettingsErrorMessage(error), success: false };
	}
};
