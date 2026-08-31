import { TRPCError } from '@trpc/server';

import { protocolsApiMapping } from '@/lib/data/mappings';
import { db } from '@/server/db';
import type {
    CreateClientResponse,
    IGenerateQrCodeResponse,
} from '@/server/interfaces/amnezia-api';
import { amneziaApiService } from '@/server/services/amnezia-api';
import { encryptionService } from '@/server/services/encryption';
import { logsService } from '@/server/services/logs';
import { withdrawSentKeys } from '@/server/services/telegram/key-messages';
import { readProtocolVersion } from '@/server/services/vpn-config';

export interface ReissueResult {
    id: string;
    clientName: string;
    vpnKey: string;
    qrCode: IGenerateQrCodeResponse | null;
}

interface ReissueOptions {
    /** Overrides the expiry carried over from the old config. */
    expiresAt?: string;
    /** The admin who asked, or null when the client asked through the bot. */
    adminId: string | null;
}

/**
 * Replaces a broken config with a fresh one in a single step, keeping the client
 * assignment, protocol, server and expiration date, and returns the new key together with
 * its QR code so it can be forwarded to the client right away.
 *
 * Lives outside the tRPC router because the bot performs the same operation on the
 * client's own request, and there is no admin session behind that call.
 */
export async function reissueConfigById(
    id: string,
    { expiresAt: expiresAtOverride, adminId }: ReissueOptions
): Promise<ReissueResult> {
    const oldConfig = await db.configs.findUnique({
        where: { id },
        select: {
            serverId: true,
            clientId: true,
            clientName: true,
            protocol: true,
            expiresAt: true,
        },
    });
    if (!oldConfig) throw new TRPCError({ code: 'NOT_FOUND', message: 'Config not found' });

    const expiresAt = expiresAtOverride ?? oldConfig.expiresAt;
    if (!expiresAt)
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Config has no expiration date, provide one to reissue it',
        });

    const apiProtocol = protocolsApiMapping[oldConfig.protocol];

    // The new config is created first: if this fails, the client keeps the old one.
    let clientName = oldConfig.clientName;
    let createdConfig: CreateClientResponse;

    try {
        createdConfig = await amneziaApiService.createConfig(
            oldConfig.serverId,
            clientName,
            apiProtocol,
            Number(expiresAt)
        );
    } catch (error) {
        if (!(error instanceof TRPCError) || error.code !== 'CONFLICT') throw error;

        // The server rejects a duplicate name while the old config still exists.
        clientName = `${oldConfig.clientName}-r${Date.now().toString(36).slice(-4)}`;
        createdConfig = await amneziaApiService.createConfig(
            oldConfig.serverId,
            clientName,
            apiProtocol,
            Number(expiresAt)
        );
    }

    // From here on the replacement already works, so failures are logged, not thrown.
    try {
        await amneziaApiService.deleteConfig(oldConfig.serverId, id, apiProtocol);
    } catch (error) {
        await logsService.createLog(
            'SERVER',
            'WARNING',
            `Config <${oldConfig.clientName}> was reissued but the old one could not be removed from the server: ${error instanceof Error ? error.message : 'Unknown error'}`,
            adminId ?? undefined
        );
    }

    const encryptedVpnKey = encryptionService.encrypt(createdConfig.client.config);

    await db.$transaction([
        db.configs.delete({ where: { id } }),
        db.configs.create({
            data: {
                id: createdConfig.client.id,
                serverId: oldConfig.serverId,
                clientId: oldConfig.clientId,
                clientName,
                expiresAt,
                protocol: oldConfig.protocol,
                protocolVersion: readProtocolVersion(createdConfig.client.config),
                vpnKey: encryptedVpnKey,
            },
        }),
    ]);

    let qrCode: IGenerateQrCodeResponse | null = null;
    try {
        qrCode = await amneziaApiService.generateQrCode(
            oldConfig.serverId,
            createdConfig.client.config
        );
    } catch {
        // The key alone is enough to hand over, the QR code is a convenience.
    }

    // The point of a reissue is that the old key is compromised or broken, so leaving it
    // readable in the chat defeats the exercise.
    await withdrawSentKeys([id], oldConfig.clientName, adminId);

    await logsService.createLog(
        'CLIENT',
        'INFO',
        adminId
            ? `Config <${clientName}> reissued`
            : `Config <${clientName}> reissued by the client from the bot`,
        adminId ?? undefined
    );

    return {
        id: createdConfig.client.id,
        clientName,
        vpnKey: createdConfig.client.config,
        qrCode,
    };
}