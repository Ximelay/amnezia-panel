import { Languages, LevelTypes, LogTypes, Protocols, Roles } from 'prisma/generated/enums';

export const protocolsMapping: Record<Protocols, string> = {
    // 2.0 and 3.x are one protocol as far as the API and the container are concerned;
    // which of the two a config actually is only becomes known once it is issued.
    [Protocols.AMNEZIAWG2]: 'AmneziaWG 2.0 / 3.x',
    [Protocols.AMNEZIAWG]: 'AmneziaWG',
    [Protocols.XRAY]: 'XRAY',
};

/**
 * Names a config's protocol as precisely as what is known about it allows: exact once
 * the version was read out of the issued config, the ambiguous pair until then.
 */
export const protocolLabel = (protocol: Protocols, version?: string | null): string => {
    if (protocol !== Protocols.AMNEZIAWG2 || !version) return protocolsMapping[protocol];

    // The API reports 2.0 as a bare "2", which reads oddly next to "3.1".
    return `AmneziaWG ${version === '2' ? '2.0' : version}`;
};

export const protocolsApiMapping: Record<Protocols, 'amneziawg' | 'amneziawg2' | 'xray'> = {
    [Protocols.AMNEZIAWG2]: 'amneziawg2',
    [Protocols.AMNEZIAWG]: 'amneziawg',
    [Protocols.XRAY]: 'xray',
};

export const protocolsServerMapping: Record<string, string> = {
    amneziawg2: 'AmneziaWG 2.0 / 3.x',
    amneziawg: 'AmneziaWG',
    xray: 'XRAY',
};

export const apiProtocolsMapping: Record<'amneziawg' | 'amneziawg2' | 'xray', Protocols> = {
    ['amneziawg2']: Protocols.AMNEZIAWG2,
    ['amneziawg']: Protocols.AMNEZIAWG,
    ['xray']: Protocols.XRAY,
};

export const levelTypesMapping: Record<LevelTypes, string> = {
    [LevelTypes.INFO]: 'Info',
    [LevelTypes.WARNING]: 'Warning',
    [LevelTypes.ERROR]: 'Error',
};

export const logTypesMapping: Record<LogTypes, string> = {
    [LogTypes.CLIENT]: 'Client',
    [LogTypes.SERVER]: 'Server',
    [LogTypes.TELEGRAM]: 'Telegram',
    [LogTypes.ADMIN]: 'Admins',
};

export const LanguagesMapping: Record<Languages, string> = {
    [Languages.ENGLISH]: 'English',
    [Languages.RUSSIAN]: 'Russian',
};

export const rolesMapping: Record<Roles, string> = {
    [Roles.ROOT]: 'Root',
    [Roles.ADMIN]: 'Admin',
};
