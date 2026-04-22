import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import type { NextAuthOptions } from 'next-auth';
import { db } from '../db';
import { CustomPrismaAdapter } from './adapter';
import type { Roles } from 'prisma/generated/enums';

export const authOptions: NextAuthOptions = {
    adapter: CustomPrismaAdapter(),
    secret: process.env.AUTH_SECRET,
    session: {
        strategy: 'jwt',
        maxAge: 2 * 60 * 60, // 2 hours
    },
    jwt: {
        maxAge: 2 * 60 * 60, // 2 hours
    },
    providers: [
        CredentialsProvider({
            name: 'credentials',
            credentials: {
                login: { label: 'Login', type: 'text' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.login || !credentials?.password) return null;

                const user = await db.admins.findUnique({
                    where: { login: credentials.login },
                });

                if (!user?.password) return null;

                const isPasswordValid = await bcrypt.compare(credentials.password, user.password);

                if (!isPasswordValid) return null;

                return {
                    id: user.id,
                    role: user.role,
                    login: user.login,
                    isFirstLogin: user.isFirstLogin,
                };
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.role = user.role;
                token.login = user.login;
                token.isFirstLogin = user.isFirstLogin;
            }
            return token;
        },
        async session({ session, token }) {
            if (token && session.user) {
                session.user.id = token.id;
                session.user.role = token.role as Roles;
                session.user.login = token.login;
                session.user.isFirstLogin = token.isFirstLogin;
            }
            return session;
        },
    },
    pages: {
        signIn: '/auth/login',
    },
};
