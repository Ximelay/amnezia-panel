import { Languages, LevelTypes, LogTypes, Protocols } from 'prisma/generated/enums';

export const protocolsMapping: Record<Protocols, string> = {
    [Protocols.AMNEZIAWG]: 'AmneziaWG',
    [Protocols.AMNEZIAWG2]: 'AmneziaWG 2.0',
    [Protocols.XRAY]: 'XRAY',
};

export const protocolsApiMapping: Record<Protocols, 'amneziawg' | 'amneziawg2' | 'xray'> = {
    [Protocols.AMNEZIAWG]: 'amneziawg',
    [Protocols.AMNEZIAWG2]: 'amneziawg2',
    [Protocols.XRAY]: 'xray',
};

export const protocolsServerMapping: Record<string, string> = {
    amneziawg: 'AmneziaWG',
    amneziawg2: 'AmneziaWG 2.0',
    xray: 'XRAY',
};

export const apiProtocolsMapping: Record<'amneziawg' | 'amneziawg2' | 'xray', Protocols> = {
    ['amneziawg']: Protocols.AMNEZIAWG,
    ['amneziawg2']: Protocols.AMNEZIAWG2,
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
};

export const LanguagesMapping: Record<Languages, string> = {
    [Languages.ENGLISH]: 'English',
    [Languages.RUSSIAN]: 'Russian',
};