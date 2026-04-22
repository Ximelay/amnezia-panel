import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
    function proxy(req) {
        const token = req.nextauth.token;
        const isAuth = !!token;
        const isAuthPage = req.nextUrl.pathname.startsWith('/auth');
        const isApiRoute = req.nextUrl.pathname.startsWith('/api');

        if (isApiRoute) {
            if (req.nextUrl.pathname.startsWith('/api/trpc') && !token) {
                return NextResponse.redirect(new URL('/auth/login', req.url));
            }
            return NextResponse.next();
        }

        if (isAuthPage) {
            if (isAuth) {
                if (req.nextUrl.pathname === '/auth/change-password') return NextResponse.next();
                return NextResponse.redirect(new URL('/clients', req.url));
            }
            return NextResponse.next();
        }

        if (!isAuth) return NextResponse.redirect(new URL('/auth/login', req.url));

        if (
            token?.isFirstLogin &&
            req.nextUrl.pathname !== '/auth/change-password' &&
            !isApiRoute
        ) {
            return NextResponse.redirect(new URL('/auth/change-password', req.url));
        }

        return NextResponse.next();
    },
    {
        callbacks: {
            authorized: ({ req, token }) => {
                if (req.nextUrl.pathname.startsWith('/api')) return true;
                if (req.nextUrl.pathname === '/auth/login') return true;

                return !!token;
            },
        },
    }
);

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
