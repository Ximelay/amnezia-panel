import { Languages, LevelTypes, LogTypes, Protocols, Roles } from 'prisma/generated/enums';

export const protocolsMapping: Record<Protocols, string> = {
    [Protocols.AMNEZIAWG2]: 'AmneziaWG 2.0',
    [Protocols.AMNEZIAWG]: 'AmneziaWG',
    [Protocols.XRAY]: 'XRAY',
};

export const protocolsApiMapping: Record<Protocols, 'amneziawg' | 'amneziawg2' | 'xray'> = {
    [Protocols.AMNEZIAWG2]: 'amneziawg2',
    [Protocols.AMNEZIAWG]: 'amneziawg',
    [Protocols.XRAY]: 'xray',
};

export const protocolsServerMapping: Record<string, string> = {
    amneziawg2: 'AmneziaWG 2.0',
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
