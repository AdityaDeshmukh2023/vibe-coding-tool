import { TRPCError } from '@trpc/server';

import { verifyAISettings } from '@/modules/settings/actions';
import { AISettingsSchema } from '@/modules/settings/schemas/ai-settings-schema';

import { db } from '@/lib/db';
import { decrypt, encrypt } from '@/lib/encryption';
import { createTRPCRouter, protectedProcedure } from '@/trpc/init';

export const settingsRouter = createTRPCRouter({
	getAISettings: protectedProcedure.query(async ({ ctx }) => {
		const { userId } = ctx.auth;

		const settings = await db.userSettings.findUnique({
			where: {
				userId,
			},
		});

		if (!settings) return { apiKey: '', azureApiVersion: '', azureEndpoint: '', model: '', provider: 'OPENAI' as const };

		return {
			apiKey: decrypt(settings.apiKey),
			azureApiVersion: settings.azureApiVersion || '',
			azureEndpoint: settings.azureEndpoint || '',
			model: settings.model || '',
			provider: settings.provider,
		};
	}),
	removeAISettings: protectedProcedure.mutation(async ({ ctx }) => {
		const { userId } = ctx.auth;

		const settings = await db.userSettings.delete({
			where: {
				userId,
			},
		});

		if (!settings) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to remove AI Settings' });

		return settings;
	}),
	saveAISettings: protectedProcedure.input(AISettingsSchema).mutation(async ({ ctx, input }) => {
		const { userId } = ctx.auth;
		const { apiKey, azureApiVersion, azureEndpoint, model, provider } = input;

		const { error, success } = await verifyAISettings({ apiKey, azureApiVersion, azureEndpoint, model, provider });

		if (!success) throw new TRPCError({ code: 'BAD_REQUEST', message: error || 'Failed to verify API key' });

		const encryptedApiKey = encrypt(apiKey);

		const settings = await db.userSettings.upsert({
			create: {
				apiKey: encryptedApiKey,
				azureApiVersion: provider === 'AZURE_OPENAI' ? azureApiVersion : null,
				azureEndpoint: provider === 'AZURE_OPENAI' ? azureEndpoint : null,
				model: model || null,
				provider,
				userId,
			},
			update: {
				apiKey: encryptedApiKey,
				azureApiVersion: provider === 'AZURE_OPENAI' ? azureApiVersion : null,
				azureEndpoint: provider === 'AZURE_OPENAI' ? azureEndpoint : null,
				model: model || null,
				provider,
			},
			where: {
				userId,
			},
		});

		if (!settings) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to save AI Settings' });

		return settings;
	}),
});
