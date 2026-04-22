import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    serverExternalPackages: ['pg', 'pg-connection-string', 'pgpass', '@prisma/adapter-pg'],
};

export default nextConfig;
