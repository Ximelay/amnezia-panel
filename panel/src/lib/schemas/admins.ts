import z from 'zod';

export const upsertAdminSchema = z.object({
    id: z.string().optional(),
    login: z.string().min(1, 'Enter the login'),
    password: z.string().min(1, 'Enter the password'),
});

export type upsertAdminFormData = z.infer<typeof upsertAdminSchema>;
