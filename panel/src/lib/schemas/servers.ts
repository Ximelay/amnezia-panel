import z from 'zod';

export const upsertServerSchema = z
    .object({
        id: z.number().optional(),
        name: z.string().min(1),
        ip: z.string(),
        port: z.string(),
        // Optional, because the panel never sends a stored key back to the browser and the edit
        // form therefore has nothing to prefill. An empty field on edit means "keep the key we
        // already have"; on create there is nothing to keep, so it stays required there.
        apiKey: z.string().optional(),
    })
    .superRefine((data, ctx) => {
        const apiKey = data.apiKey?.trim() ?? '';

        if (data.id === undefined && apiKey.length === 0) {
            ctx.addIssue({
                code: 'custom',
                path: ['apiKey'],
                message: 'API key is required',
            });
            return;
        }

        if (apiKey.length > 0 && apiKey.length < 5) {
            ctx.addIssue({
                code: 'custom',
                path: ['apiKey'],
                message: 'API key must be at least 5 characters',
            });
        }
    });

export type upsertServerFormData = z.infer<typeof upsertServerSchema>;