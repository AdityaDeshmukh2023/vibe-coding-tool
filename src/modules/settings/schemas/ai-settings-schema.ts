import { z } from 'zod';

export const AI_PROVIDERS = ['OPENAI', 'OPENROUTER', 'AZURE_OPENAI'] as const;
export type AIProviderType = (typeof AI_PROVIDERS)[number];

export const AISettingsSchema = z
	.object({
		apiKey: z.string().trim().min(8, 'Invalid API key'),
		azureApiVersion: z.string().trim().optional(),
		azureEndpoint: z.string().trim().optional(),
		model: z.string().trim().min(1, 'Model is required'),
		provider: z.enum(AI_PROVIDERS),
	})
	.superRefine((data, ctx) => {
		if (data.provider === 'AZURE_OPENAI') {
			if (!data.azureEndpoint) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Azure endpoint is required', path: ['azureEndpoint'] });
			} else if (!/^https?:\/\/.+/.test(data.azureEndpoint)) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid endpoint URL', path: ['azureEndpoint'] });
			}
			if (!data.azureApiVersion) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'API version is required', path: ['azureApiVersion'] });
			}
		}
	});
