import type { Adapter } from 'next-auth/adapters';
import { db } from '../db';

export function CustomPrismaAdapter(): Adapter {
    return {
        async createUser() {
            throw new Error('Unknown error');
        },

        async getUser(id) {
            const user = await db.admins.findUnique({
                where: { id },
            });

            if (!user) return null;

            return {
                id: user.id,
                email: 'null',
                emailVerified: null,
                login: user.login,
                role: user.role,
                isFirstLogin: user.isFirstLogin,
            };
        },

        async getUserByEmail() {
            return null;
        },

        async getUserByAccount() {
            return null;
        },

        async linkAccount() {
            return;
        },

        async createSession(session) {
            return {
                ...session,
                userId: session.userId,
            };
        },

        async getSessionAndUser() {
            return null;
        },

        async updateSession(session) {
            if (!session.userId || !session.expires) return null;

            return {
                ...session,
                userId: session.userId,
                expires: session.expires,
            };
        },

        async deleteSession() {
            return;
        },

        async unlinkAccount() {
            return;
        },
    };
}
