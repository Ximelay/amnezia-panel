import z from 'zod';

export const upsertServerSchema = z.object({
    id: z.number().optional(),
    name: z.string().min(1),
    ip: z.string(),
    port: z.string(),
    apiKey: z.string().min(5),
});

export type upsertServerFormData = z.infer<typeof upsertServerSchema>;
