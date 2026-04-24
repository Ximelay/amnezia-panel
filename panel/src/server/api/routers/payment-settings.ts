import { upsertPaymentSettingsSchema } from '@/lib/schemas/payment-settings';
import { createTRPCRouter, protectedProcedureWithRole } from '../trpc';
import { logsService } from '@/server/services/logs';

export const paymentSettingsRouter = createTRPCRouter({
    getPaymentSettings: protectedProcedureWithRole('ADMIN').query(async ({ ctx }) => {
        return await ctx.db.paymentSettings.findFirst({
            where: { id: 1 },
        });
    }),

    upsertPaymentSettings: protectedProcedureWithRole('ADMIN')
        .input(upsertPaymentSettingsSchema)
        .mutation(async ({ input, ctx }) => {
            const {
                defaultPrice,
                additionalPrice,
                defaultConfigsCount,
                paymentLink,
                adminTelegramIds,
            } = input;

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
                    adminTelegramIds: parsedAdminIds as any,
                },
                update: {
                    defaultPrice: Number(defaultPrice),
                    additionalPrice: Number(additionalPrice),
                    defaultConfigsCount: Number(defaultConfigsCount),
                    paymentLink,
                    adminTelegramIds: parsedAdminIds as any,
                },
            });

            await logsService.createLog(
                'TELEGRAM',
                'INFO',
                'Payment settings were saved successfully',
                ctx.session.user.id
            );
        }),
});
