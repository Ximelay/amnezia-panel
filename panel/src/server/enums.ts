import { LevelTypes, LogTypes, Protocols, Roles } from 'prisma/generated/enums';

const protocolEnum = Protocols;

const ProtocolFilterEnum = {
    All: 'All',
};

export type ProtocolsFilter = keyof typeof ProtocolFilterEnum | keyof typeof protocolEnum;

const levelTypeEnum = LevelTypes;

const LevelTypeFilterEnum = {
    All: 'All',
};

export type LevelTypesFilter = keyof typeof LevelTypeFilterEnum | keyof typeof levelTypeEnum;

const logTypeEnum = LogTypes;

const LogTypeFilterEnum = {
    All: 'All',
};

export type LogTypesFilter = keyof typeof LogTypeFilterEnum | keyof typeof logTypeEnum;

export const TTL_CONFIG = {
    SERVERS: 10 * 60 * 1000, // 10 minutes
} as const;

export const rolesEnum = Roles;

export const RolesFilterEnum = {
    All: 'All',
};

export type RolesFilter = keyof typeof RolesFilterEnum | keyof typeof rolesEnum;
