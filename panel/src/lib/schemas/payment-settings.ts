import z from 'zod';

export const upsertPaymentSettingsSchema = z.object({
    defaultPrice: z.string().min(1),
    additionalPrice: z.string().min(1),
    defaultConfigsCount: z.string().min(1),
    paymentLink: z.url(),
    adminTelegramIds: z.string().optional(), // comma-separated IDs
});

export type upsertPaymentSettingsFormData = z.infer<typeof upsertPaymentSettingsSchema>;
