import type { DefaultSession, DefaultUser } from 'next-auth';
import type { DefaultJWT } from 'next-auth/jwt';
import type { Roles } from 'prisma/generated/enums';

declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            login: string;
            role: Roles;
            isFirstLogin: boolean;
        } & DefaultSession['user'];
    }

    interface User extends DefaultUser {
        id: string;
        login: string; 
        role: string;
        isFirstLogin: boolean;
    }
}

declare module 'next-auth/jwt' {
    interface JWT extends DefaultJWT {
        id: string;
        login: string;
        role: string;
        isFirstLogin: boolean;
    }
}
