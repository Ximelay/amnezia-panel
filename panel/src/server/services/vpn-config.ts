import { inflateSync } from 'node:zlib';

/**
 * Reads the protocol version out of a `vpn://` config.
 *
 * AmneziaWG 2.0 and 3.x are one protocol as far as the API is concerned — both are
 * `amneziawg2` and live in the same container — and the API decides which one a config
 * is by inspecting `awg0.conf` when it creates it. The only place that decision surfaces
 * is `protocol_version` inside the config payload, so this is the panel's sole way of
 * telling a 2.0 config from a 3.1 one.
 *
 * The payload is `vpn://` followed by base64url of a 4-byte big-endian length header and
 * a zlib stream. Anything unparseable yields null: a config the panel cannot read a
 * version out of is not an error, it just has no version to show.
 */
export function readProtocolVersion(vpnKey: unknown): string | null {
    if (typeof vpnKey !== 'string' || !vpnKey.startsWith('vpn://')) return null;

    try {
        const payload = Buffer.from(
            vpnKey.slice('vpn://'.length).replace(/-/g, '+').replace(/_/g, '/'),
            'base64'
        );
        if (payload.length <= 4) return null;

        const parsed: unknown = JSON.parse(inflateSync(payload.subarray(4)).toString('utf-8'));

        if (!parsed || typeof parsed !== 'object') return null;
        const containers = (parsed as { containers?: unknown }).containers;
        if (!Array.isArray(containers)) return null;

        for (const container of containers) {
            if (!container || typeof container !== 'object') continue;

            const awg = (container as { awg?: unknown }).awg;
            if (!awg || typeof awg !== 'object') continue;

            const version = (awg as { protocol_version?: unknown }).protocol_version;
            if (typeof version === 'string' && version) return version;
        }

        return null;
    } catch {
        return null;
    }
}