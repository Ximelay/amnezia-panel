import { upsertPaymentSettingsSchema } from '@/lib/schemas/payment-settings';
import { createTRPCRouter, publicProcedure } from '../trpc';

export const paymentSettingsRouter = createTRPCRouter({
    getPaymentSettings: publicProcedure.query(async ({ ctx }) => {
        return await ctx.db.paymentSettings.findFirst({
            where: { id: 1 },
        });
    }),

    upsertPaymentSettings: publicProcedure
        .input(upsertPaymentSettingsSchema)
        .mutation(async ({ input, ctx }) => {
            const {
                defaultPrice,
                additionalPrice,
                defaultConfigsCount,
                paymentLink,
                adminTelegramIds,
            } = input;

            // Parse adminTelegramIds: split by commas, trim, filter out empty strings
            let parsedAdminIds: string[] | null = null;
            if (adminTelegramIds && adminTelegramIds.trim() !== '') {
                parsedAdminIds = adminTelegramIds
                    .split(',')
                    .map((id) => id.trim())
                    .filter((id) => id.length > 0);
                if (parsedAdminIds.length === 0) parsedAdminIds = null;
            }

            await ctx.db.paymentSettings.upsert({
                where: { id: 1 || -1 },
                create: {
                    defaultPrice: Number(defaultPrice),
                    additionalPrice: Number(additionalPrice),
                    defaultConfigsCount: Number(defaultConfigsCount),
                    paymentLink,
                    adminTelegramIds: parsedAdminIds as any, // store as JSON array
                },
                update: {
                    defaultPrice: Number(defaultPrice),
                    additionalPrice: Number(additionalPrice),
                    defaultConfigsCount: Number(defaultConfigsCount),
                    paymentLink,
                    adminTelegramIds: parsedAdminIds as any,
                },
            });
        }),
});
