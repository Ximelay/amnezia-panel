import { getTrpcErrorCode } from '@/lib/utils';
import { TRPCError } from '@trpc/server';
import { logsService } from './logs';
import type {
    CreateClientResponse,
    GetServerInfoResponse,
    GetClientsResponse,
    MessageResponse,
    Protocol,
    ServerBackup,
    ServerBackupZod,
    GetServerLoadResponse,
    IGenerateQrCodeResponse,
} from '../interfaces/amnezia-api';
import { serversCacheService, type ICachedServer } from './cache/servers-cache';

// interface UniversalResponse {
//     ok: boolean;
//     status: number;
//     statusText: string;
//     headers: {
//         get(name: string): string | null;
//     };
//     text(): Promise<string>;
//     json(): Promise<any>;
// }

class AmneziaApiService {
    private readonly maxRetries = 3;
    private readonly retryDelay = 1000;

    private async getApiServer(serverId: number): Promise<ICachedServer> {
        const server = await serversCacheService.getServer(serverId);
        if (!server?.apiKey) {
            throw new Error('Amnezia API key is required but not available');
        }
        return server;
    }

    private async getFetchOptions(
        serverId: number,
        method: string,
        server?: ICachedServer
    ): Promise<RequestInit> {
        const headers: HeadersInit = {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        };

        const targetServer = server || (await this.getApiServer(serverId));
        const apiKey = await serversCacheService.getDecryptedApiKey(targetServer.apiKey);
        headers['x-api-key'] = apiKey || '';

        return {
            method,
            headers,
        };
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private async makeRequestWithRetry<T>(
        serverId: number,
        endpoint: string,
        method: string,
        body?: any,
        query?: Record<string, string | number | boolean>
    ): Promise<T> {
        const server = await this.getApiServer(serverId);
        const baseUrl = `http://${server.ip}:${server.port}`;

        let url = `${baseUrl}/${endpoint}`;
        if (query) {
            const queryString = new URLSearchParams();
            for (const [key, value] of Object.entries(query)) {
                queryString.append(key, String(value));
            }
            url += `?${queryString.toString()}`;
        }

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const fetchOptions = await this.getFetchOptions(serverId, method, server);

                const fetchOptionsWithBody: RequestInit = {
                    ...fetchOptions,
                    body: body ? JSON.stringify(body) : undefined,
                };

                // let response: UniversalResponse;

                // if (typeof window === 'undefined') {
                //     const nodeFetch = await import('node-fetch');
                //     const { Agent } = await import('https');

                //     const agent = new Agent({
                //         rejectUnauthorized: false,
                //     });

                //     const rawResponse = await nodeFetch.default(url, {
                //         ...fetchOptionsWithBody,
                //         agent,
                //     } as any);

                //     response = {
                //         ok: rawResponse.ok,
                //         status: rawResponse.status,
                //         statusText: rawResponse.statusText,
                //         headers: {
                //             get: (name: string) => rawResponse.headers.get(name),
                //         },
                //         text: () => rawResponse.text(),
                //         json: () => rawResponse.json() as Promise<any>,
                //     };
                // } else {
                // const rawResponse = await fetch(url, fetchOptionsWithBody);
                const response = await fetch(url, fetchOptionsWithBody);

                // response = {
                //     ok: rawResponse.ok,
                //     status: rawResponse.status,
                //     statusText: rawResponse.statusText,
                //     headers: {
                //         get: (name: string) => rawResponse.headers.get(name),
                //     },
                //     text: () => rawResponse.text(),
                //     json: () => rawResponse.json() as Promise<any>,
                // };
                // }

                if (!response.ok) {
                    if (response.status === 400) {
                        throw new TRPCError({
                            code: getTrpcErrorCode(response.status),
                            message: 'Amnezia API error: Uncorrected request',
                        });
                    }

                    if (response.status === 401) {
                        throw new TRPCError({
                            code: getTrpcErrorCode(response.status),
                            message: 'Amnezia API error: Authentication failed',
                        });
                    }

                    if (response.status === 403) {
                        throw new TRPCError({
                            code: getTrpcErrorCode(response.status),
                            message: 'Amnezia API error: Forbidden',
                        });
                    }

                    if (response.status === 404) {
                        throw new TRPCError({
                            code: getTrpcErrorCode(response.status),
                            message: 'Amnezia API error: Not found',
                        });
                    }

                    if (response.status === 409) {
                        throw new TRPCError({
                            code: getTrpcErrorCode(response.status),
                            message: 'Amnezia API error: Conflict',
                        });
                    }

                    throw new TRPCError({
                        code: getTrpcErrorCode(response.status),
                        message: `Amnezia API error: ${await response.text()}`,
                    });
                }

                const data = await response.json();
                return data as T;
            } catch (error) {
                if (error instanceof TRPCError) {
                    throw error;
                }

                if (attempt === this.maxRetries) {
                    throw new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: `Amnezia API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    });
                }

                await this.sleep(this.retryDelay * attempt);
            }
        }

        throw new TRPCError({
            code: 'TIMEOUT',
            message: 'Amnezia API request failed after maximum retries',
        });
    }

    async getConfigs(
        serverId: number,
        skip: number = 0,
        limit: number = 100
    ): Promise<GetClientsResponse> {
        try {
            return await this.makeRequestWithRetry<GetClientsResponse>(
                serverId,
                'clients',
                'GET',
                undefined,
                { skip, limit }
            );
        } catch (error) {
            await logsService.createLog(
                'SERVER',
                'ERROR',
                `Failed to get configs: ${error instanceof TRPCError || error instanceof Error ? error.message : 'Unknown error'}`
            );

            if (error instanceof TRPCError) {
                throw error;
            }

            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to get configs: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    }

    async createConfig(
        serverId: number,
        clientName: string,
        protocol: Protocol,
        expiresAt: number
    ): Promise<CreateClientResponse> {
        try {
            return await this.makeRequestWithRetry<CreateClientResponse>(
                serverId,
                'clients',
                'POST',
                {
                    clientName,
                    protocol,
                    expiresAt,
                }
            );
        } catch (error) {
            await logsService.createLog(
                'SERVER',
                'ERROR',
                `Failed to create config: ${error instanceof TRPCError || error instanceof Error ? error.message : 'Unknown error'}`
            );

            if (error instanceof TRPCError) {
                throw error;
            }

            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to create config: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    }

    async updateConfig(
        serverId: number,
        clientId: string, // configId
        protocol: Protocol,
        expiresAt?: string,
        status?: string
    ): Promise<MessageResponse> {
        try {
            return await this.makeRequestWithRetry<MessageResponse>(serverId, 'clients', 'PATCH', {
                clientId,
                protocol,
                expiresAt,
                status,
            });
        } catch (error) {
            await logsService.createLog(
                'SERVER',
                'ERROR',
                `Failed to update config: ${error instanceof TRPCError || error instanceof Error ? error.message : 'Unknown error'}`
            );

            if (error instanceof TRPCError) {
                throw error;
            }

            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to create config: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    }

    async deleteConfig(
        serverId: number,
        clientId: string,
        protocol: Protocol
    ): Promise<MessageResponse> {
        try {
            return await this.makeRequestWithRetry<MessageResponse>(serverId, 'clients', 'DELETE', {
                clientId,
                protocol,
            });
        } catch (error) {
            if (error instanceof TRPCError && error.message.includes('Not found')) {
                await logsService.createLog(
                    'SERVER',
                    'ERROR',
                    'Failed to delete config of AmneziaVPN (404 Not found) but deleted in database'
                );

                return { message: 'Error: Not found config' };
            } else if (error instanceof TRPCError) {
                throw error;
            } else {
                await logsService.createLog(
                    'SERVER',
                    'ERROR',
                    `Failed to delete config: ${error instanceof TRPCError || error instanceof Error ? error.message : 'Unknown error'}`
                );

                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: `Failed to delete config: ${error instanceof Error ? error.message : 'Unknown error'}`,
                });
            }
        }
    }

    async generateQrCode(serverId: number, vpnKey: string): Promise<IGenerateQrCodeResponse> {
        try {
            return await this.makeRequestWithRetry<IGenerateQrCodeResponse>(
                serverId,
                'clients/qr',
                'POST',
                { config: vpnKey }
            );
        } catch (error) {
            await logsService.createLog(
                'SERVER',
                'ERROR',
                `Failed to generate QR Code: ${error instanceof TRPCError || error instanceof Error ? error.message : 'Unknown error'}`
            );

            if (error instanceof TRPCError) {
                throw error;
            }

            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to generate QR Code: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    }

    async getServerInfo(serverId: number): Promise<GetServerInfoResponse> {
        try {
            return await this.makeRequestWithRetry<GetServerInfoResponse>(
                serverId,
                'server',
                'GET'
            );
        } catch (error) {
            await logsService.createLog(
                'SERVER',
                'ERROR',
                `Failed to get server: ${error instanceof TRPCError || error instanceof Error ? error.message : 'Unknown error'}`
            );

            if (error instanceof TRPCError) {
                throw error;
            }

            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to get server: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    }

    async getServerBackup(serverId: number): Promise<ServerBackup> {
        try {
            return await this.makeRequestWithRetry<ServerBackup>(serverId, 'server/backup', 'GET');
        } catch (error) {
            await logsService.createLog(
                'SERVER',
                'ERROR',
                `Failed to get server backup: ${error instanceof TRPCError || error instanceof Error ? error.message : 'Unknown error'}`
            );

            if (error instanceof TRPCError) {
                throw error;
            }

            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to get server backup: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    }

    async importServerBackup(serverId: number, body: ServerBackupZod): Promise<ServerBackup> {
        try {
            return await this.makeRequestWithRetry<ServerBackup>(
                serverId,
                'server/backup',
                'POST',
                body
            );
        } catch (error) {
            await logsService.createLog(
                'SERVER',
                'ERROR',
                `Failed to import server backup: ${error instanceof TRPCError || error instanceof Error ? error.message : 'Unknown error'}`
            );

            if (error instanceof TRPCError) {
                throw error;
            }

            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to import server backup: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    }

    async rebootServer(serverId: number): Promise<MessageResponse> {
        try {
            return await this.makeRequestWithRetry<MessageResponse>(
                serverId,
                'server/reboot',
                'POST'
            );
        } catch (error) {
            await logsService.createLog(
                'SERVER',
                'ERROR',
                `Failed to reboot server: ${error instanceof TRPCError || error instanceof Error ? error.message : 'Unknown error'}`
            );

            if (error instanceof TRPCError) {
                throw error;
            }

            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to reboot server: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    }

    async getServerLoad(serverId: number): Promise<GetServerLoadResponse> {
        try {
            return await this.makeRequestWithRetry<GetServerLoadResponse>(
                serverId,
                'server/load',
                'GET'
            );
        } catch (error) {
            await logsService.createLog(
                'SERVER',
                'ERROR',
                `Failed to load server: ${error instanceof TRPCError || error instanceof Error ? error.message : 'Unknown error'}`
            );

            if (error instanceof TRPCError) {
                throw error;
            }

            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to load server: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    }
}

export const amneziaApiService = new AmneziaApiService();
