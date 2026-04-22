import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { createTRPCRouter, protectedProcedure, protectedProcedureWithRole } from '../trpc';
import { TRPCError } from '@trpc/server';
import type { RolesFilter } from '@/server/enums';
import type { Prisma } from 'prisma/generated/client';
import { upsertAdminSchema } from '@/lib/schemas/admins';
import { logsService } from '@/server/services/logs';

export const adminsRouter = createTRPCRouter({
    upsertAdmin: protectedProcedureWithRole('ROOT')
        .input(upsertAdminSchema)
        .mutation(async ({ ctx, input }) => {
            const { id, login, password } = input;

            if (login === 'root_reseted') {
                await logsService.createLog('ADMIN', 'ERROR', `Dont use login ${login} for admin`);

                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Change login',
                });
            }

            if (id) {
                if (id === ctx.session.user.id) {
                    await logsService.createLog('ADMIN', 'ERROR', `Root cant update yourself`);

                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: 'You cant update yourself',
                    });
                }

                const hashedPassword = await bcrypt.hash(password, 12);

                await ctx.db.admins.update({
                    where: { id },
                    data: { password: hashedPassword },
                });
            } else {
                const existingAdmin = await ctx.db.admins.findUnique({
                    where: { login },
                });

                if (existingAdmin) {
                    await logsService.createLog(
                        'ADMIN',
                        'ERROR',
                        `Admin ${login} is already existing`
                    );

                    throw new TRPCError({
                        code: 'CONFLICT',
                        message: 'User is existing',
                    });
                }

                const hashedPassword = await bcrypt.hash(password, 12);

                await ctx.db.admins.create({
                    data: {
                        login,
                        password: hashedPassword,
                        role: 'ADMIN',
                    },
                });

                await logsService.createLog(
                    'ADMIN',
                    'INFO',
                    `Admin ${login} was created successfully`
                );
            }
        }),
    deleteAdmin: protectedProcedureWithRole('ROOT')
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const { id } = input;

            const foundUser = await ctx.db.admins.findUnique({
                where: { id },
                select: { login: true },
            });

            if (!foundUser) {
                await logsService.createLog('ADMIN', 'ERROR', `User with id ${id} not found`);
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }

            const deletedAdmin = await ctx.db.admins.delete({
                where: { id },
                select: { login: true },
            });

            await logsService.createLog(
                'ADMIN',
                'INFO',
                `Admin ${deletedAdmin.login} was deleted successfully`
            );
        }),
    changePassword: protectedProcedure
        .input(
            z.object({
                login: z.string().optional(),
                currentPassword: z.string().min(1),
                newPassword: z.string().min(8).max(40),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const { login, currentPassword, newPassword } = input;

            const userId = ctx.session.user.id;

            const user = await ctx.db.admins.findUnique({
                where: { id: userId },
            });

            if (!user) {
                await logsService.createLog(
                    'ADMIN',
                    'ERROR',
                    `User not found for changing password`
                );
                throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
            }

            if ((login || login !== '') && ctx.session.user.role !== 'ROOT') {
                await logsService.createLog('ADMIN', 'WARNING', `Admin ${login} cant update login`);
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown error' });
            }

            if (login && ctx.session.user.role === 'ROOT') {
                if (login === 'root_reseted') {
                    await logsService.createLog('ADMIN', 'ERROR', `Root cant update yourself`);
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: 'Change login',
                    });
                }

                const foundLogin = await ctx.db.admins.findUnique({
                    where: { login },
                });

                if (foundLogin) {
                    await logsService.createLog('ADMIN', 'ERROR', `Login is existing`);
                    throw new TRPCError({ code: 'CONFLICT', message: 'User is existing' });
                }
            }

            const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);

            if (!isCurrentPasswordValid) {
                await logsService.createLog(
                    'ADMIN',
                    'WARNING',
                    `Current password invalid when changing password`
                );
                throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Password invalid' });
            }

            if (currentPassword === newPassword) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Current and new passwords match',
                });
            }

            const hashedNewPassword = await bcrypt.hash(newPassword, 12);

            await ctx.db.admins.update({
                where: { id: userId },
                data: {
                    login: !login || login === '' ? undefined : login,
                    password: hashedNewPassword,
                    isFirstLogin: false,
                },
            });
        }),
    getCurrentUser: protectedProcedure.query(async ({ ctx }) => {
        return await ctx.db.admins.findUnique({
            where: {
                id: ctx.session.user.id,
            },
            select: {
                login: true,
                role: true,
            },
        });
    }),
    getAdmins: protectedProcedureWithRole('ROOT')
        .input(
            z.object({
                search: z.string().optional(),
                roleFilter: z.string() as z.ZodType<RolesFilter>,
            })
        )
        .query(async ({ ctx, input }) => {
            const { search, roleFilter } = input;

            const whereUsers: Prisma.AdminsWhereInput = {
                login: {
                    contains: search,
                    mode: 'insensitive',
                },
            };

            if (roleFilter && roleFilter !== 'All') {
                whereUsers.role = roleFilter;
            }

            return await ctx.db.admins.findMany({
                where: whereUsers,
                orderBy: {
                    createdAt: 'desc',
                },
            });
        }),
});
