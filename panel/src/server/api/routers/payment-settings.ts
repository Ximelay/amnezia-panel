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
            const { defaultPrice, additionalPrice, defaultConfigsCount, paymentLink } = input;

            await ctx.db.paymentSettings.upsert({
                where: { id: 1 || -1 },
                create: {
                    defaultPrice: Number(defaultPrice),
                    additionalPrice: Number(additionalPrice),
                    defaultConfigsCount: Number(defaultConfigsCount),
                    paymentLink,
                },
                update: {
                    defaultPrice: Number(defaultPrice),
                    additionalPrice: Number(additionalPrice),
                    defaultConfigsCount: Number(defaultConfigsCount),
                    paymentLink,
                },
            });
        }),
});
