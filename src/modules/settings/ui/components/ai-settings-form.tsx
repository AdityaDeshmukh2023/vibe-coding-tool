'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeIcon, EyeOffIcon, Loader2Icon, Trash2Icon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';

import { AI_PROVIDERS, AISettingsSchema, type AIProviderType } from '@/modules/settings/schemas/ai-settings-schema';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/hooks/use-confirm';
import { useTRPC } from '@/trpc/client';

const DEFAULT_MODELS: Record<AIProviderType, string> = {
	AZURE_OPENAI: 'gpt-4o-mini',
	OPENAI: 'gpt-4.1',
	OPENROUTER: 'openai/gpt-4.1',
};

const PROVIDER_INFO: Record<
	AIProviderType,
	{ creditsUrl: string; keysUrl: string; label: string; modelPlaceholder: string; placeholder: string; providerName: string }
> = {
	AZURE_OPENAI: {
		creditsUrl: 'https://portal.azure.com/',
		keysUrl: 'https://portal.azure.com/',
		label: 'Azure OpenAI API Key',
		modelPlaceholder: 'e.g. gpt-4o-mini',
		placeholder: '•••••••••••••••••••••••••••••••',
		providerName: 'Azure OpenAI',
	},
	OPENAI: {
		creditsUrl: 'https://platform.openai.com/settings/organization/billing/credit-grants',
		keysUrl: 'https://platform.openai.com/account/api-keys',
		label: 'OpenAI API Key',
		modelPlaceholder: 'e.g. gpt-4.1',
		placeholder: 'sk-proj-•••••••••••••••••••••••••••••••',
		providerName: 'OpenAI',
	},
	OPENROUTER: {
		creditsUrl: 'https://openrouter.ai/credits',
		keysUrl: 'https://openrouter.ai/keys',
		label: 'OpenRouter API Key',
		modelPlaceholder: 'e.g. openai/gpt-4.1',
		placeholder: 'sk-or-•••••••••••••••••••••••••••••••',
		providerName: 'OpenRouter',
	},
};

export const AISettingsForm = () => {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [apiKeyVisible, setApiKeyVisible] = useState(false);

	const [ConfirmDialog, confirm] = useConfirm({
		message: 'Are you sure you want to remove the API Key? This action cannot be undone.',
		title: 'Remove API Key',
	});

	const { data: aiSettings, isLoading } = useQuery(trpc.settings.getAISettings.queryOptions());

	const form = useForm<z.infer<typeof AISettingsSchema>>({
		defaultValues: {
			apiKey: aiSettings?.apiKey || '',
			azureApiVersion: (aiSettings?.azureApiVersion as string) || '',
			azureEndpoint: (aiSettings?.azureEndpoint as string) || '',
			model: (aiSettings?.model as string) || DEFAULT_MODELS[(aiSettings?.provider as AIProviderType) || 'OPENAI'],
			provider: (aiSettings?.provider as AIProviderType) || 'OPENAI',
		},
		resolver: zodResolver(AISettingsSchema),
	});

	const selectedProvider = form.watch('provider') || 'OPENAI';
	const providerInfo = PROVIDER_INFO[selectedProvider];
	const isAzure = selectedProvider === 'AZURE_OPENAI';

	const saveAISettings = useMutation(
		trpc.settings.saveAISettings.mutationOptions({
			onError: (error) => {
				toast.error(error.message || 'Failed to save settings');
			},
			onSuccess: async () => {
				await queryClient.invalidateQueries(trpc.settings.getAISettings.queryOptions());

				toast.success('AI settings saved successfully');
			},
		})
	);

	const removeAISettings = useMutation(
		trpc.settings.removeAISettings.mutationOptions({
			onError: (error) => {
				toast.error(error.message || 'Failed to remove settings');
			},
			onSuccess: async () => {
				await queryClient.invalidateQueries(trpc.settings.getAISettings.queryOptions());

				form.reset({
					apiKey: '',
					azureApiVersion: '',
					azureEndpoint: '',
					model: DEFAULT_MODELS['OPENAI'],
					provider: 'OPENAI',
				});

				toast.success('AI settings removed successfully');
			},
		})
	);

	const handleSubmit = (values: z.infer<typeof AISettingsSchema>) => {
		saveAISettings.mutate(values);
	};

	const handleRemove = async () => {
		const ok = await confirm();
		if (!ok) return;

		removeAISettings.mutate();
	};

	const isPending = saveAISettings.isPending || removeAISettings.isPending;

	useEffect(() => {
		if (aiSettings) {
			form.setValue('apiKey', aiSettings.apiKey);
			form.setValue('provider', (aiSettings.provider as AIProviderType) || 'OPENAI');
			form.setValue('model', (aiSettings.model as string) || DEFAULT_MODELS[(aiSettings.provider as AIProviderType) || 'OPENAI']);
			form.setValue('azureEndpoint', (aiSettings.azureEndpoint as string) || '');
			form.setValue('azureApiVersion', (aiSettings.azureApiVersion as string) || '');
		}
	}, [aiSettings, form]);

	if (isLoading) {
		return (
			<div className='flex items-center justify-center py-8'>
				<Loader2Icon className='size-5 animate-spin' />
				<span className='sr-only'>Loading...</span>
			</div>
		);
	}

	return (
		<>
			<ConfirmDialog />

			<Form {...form}>
				<form onSubmit={form.handleSubmit(handleSubmit)} className='space-y-6' autoComplete='off' autoCapitalize='off'>
					{/* Provider Selector */}
					<FormField
						control={form.control}
						name='provider'
						render={({ field }) => (
							<FormItem>
								<FormLabel>AI Provider</FormLabel>
								<div className='flex flex-wrap gap-2'>
									{AI_PROVIDERS.map((provider) => (
										<Button
											key={provider}
											type='button'
											variant={field.value === provider ? 'default' : 'outline'}
											size='sm'
											disabled={isPending}
											onClick={() => {
												field.onChange(provider);
												form.setValue('apiKey', '');
												form.setValue('model', '');
												form.setValue('azureEndpoint', '');
												form.setValue('azureApiVersion', '');
												form.clearErrors();
											}}
										>
											{PROVIDER_INFO[provider].providerName}
										</Button>
									))}
								</div>
								<FormMessage />
							</FormItem>
						)}
					/>

					{/* API Key Input */}
					<FormField
						disabled={isPending}
						control={form.control}
						name='apiKey'
						render={({ field }) => (
							<FormItem>
								<FormLabel>{providerInfo.label}</FormLabel>
								<div className='relative'>
									<FormControl className='pr-12'>
										<Input
											type={apiKeyVisible ? 'text' : 'password'}
											placeholder={providerInfo.placeholder}
											{...field}
										/>
									</FormControl>

									<button
										disabled={isPending}
										type='button'
										className='text-muted-foreground ring-primary absolute inset-y-0 right-1 flex cursor-pointer items-center rounded-full p-3 outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50'
										onClick={() => {
											setApiKeyVisible((prevApiKeyVisible) => !prevApiKeyVisible);
											form.setFocus('apiKey');
										}}
									>
										{apiKeyVisible ? <EyeOffIcon className='size-5' /> : <EyeIcon className='size-5' />}
									</button>
								</div>

								<FormDescription>
									Get your API Key from{' '}
									<Link
										href={providerInfo.keysUrl}
										target='_blank'
										rel='noopener noreferrer'
										className='text-primary font-medium underline underline-offset-2 opacity-100 hover:opacity-75'
									>
										{providerInfo.providerName}
									</Link>
									. Make sure your account has sufficient{' '}
									<Link
										href={providerInfo.creditsUrl}
										target='_blank'
										rel='noopener noreferrer'
										className='text-primary font-medium underline underline-offset-2 opacity-100 hover:opacity-75'
									>
										credits
									</Link>
									.
								</FormDescription>

								<FormMessage />
							</FormItem>
						)}
					/>

					{/* Azure-specific fields */}
					{isAzure && (
						<>
							<FormField
								disabled={isPending}
								control={form.control}
								name='azureEndpoint'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Azure Endpoint</FormLabel>
										<FormControl>
											<Input
												placeholder='https://your-resource.openai.azure.com/'
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Your Azure OpenAI resource endpoint URL.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								disabled={isPending}
								control={form.control}
								name='azureApiVersion'
								render={({ field }) => (
									<FormItem>
										<FormLabel>API Version</FormLabel>
										<FormControl>
											<Input
												placeholder='2024-02-01'
												{...field}
											/>
										</FormControl>
										<FormDescription>
											Azure OpenAI API version (e.g., 2024-02-01).
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</>
					)}

					{/* Model Input */}
					<FormField
						disabled={isPending}
						control={form.control}
						name='model'
						render={({ field }) => (
							<FormItem>
								<FormLabel>{isAzure ? 'Deployment Name' : 'Model'}</FormLabel>
								<FormControl>
									<Input
										placeholder={providerInfo.modelPlaceholder}
										{...field}
									/>
								</FormControl>
								<FormDescription>
									{isAzure
										? 'The name of your Azure OpenAI deployment.'
										: 'The model to use for code generation.'}
								</FormDescription>
								<FormMessage />
							</FormItem>
						)}
					/>

					<div className='flex justify-end gap-2'>
						{!!aiSettings?.apiKey.trim() && (
							<Button
								variant='destructive'
								type='button'
								disabled={isPending}
								isLoading={removeAISettings.isPending}
								onClick={handleRemove}
							>
								<Trash2Icon className='size-4' />
								Remove Settings
							</Button>
						)}

						<Button type='submit' disabled={isPending} isLoading={saveAISettings.isPending}>
							Save
						</Button>
					</div>
				</form>
			</Form>
		</>
	);
};
