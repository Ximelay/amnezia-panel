import { TRPCError } from '@trpc/server';
import { telegramService } from './telegram';
import { recordKeyMessage } from './key-messages';
import { encryptionService } from '../encryption';
import { escapeHtml } from './bot/texts';
import { format } from 'date-fns';
import { protocolsMapping } from '@/lib/data/mappings';
import type { Languages, Protocols } from 'prisma/generated/enums';
import type { JsonValue } from '@prisma/client/runtime/client';

interface TelegramConfig {
    id: string;
    clientName: string;
    expiresAt: string | null;
    protocol: Protocols;
    vpnKey: JsonValue;
}

interface Translations {
    header: string;
    configFor: string;
    protocol: string;
    expirationDate: string;
    notSpecified: string;
    notSet: string;
    totalConfigs: string;
}

const translations: Record<Languages, Translations> = {
    ENGLISH: {
        header: 'VPN configurations from',
        configFor: 'Configuration for',
        protocol: 'Protocol',
        expirationDate: 'Expiration date',
        notSpecified: 'Not specified',
        notSet: 'Not set',
        totalConfigs: 'Total configurations',
    },
    RUSSIAN: {
        header: 'VPN ключи от',
        configFor: 'Ключ для',
        protocol: 'Протокол',
        expirationDate: 'Дата истечения',
        notSpecified: 'Не указан',
        notSet: 'Не установлена',
        totalConfigs: 'Всего ключей',
    },
};

interface FormatConfigsOptions {
    showHeader: boolean;
    showFooter: boolean;
    totalConfigs: number;
    language: Languages;
}

function formatConfigsMessage(
    configs: TelegramConfig[],
    clientName: string,
    options: FormatConfigsOptions
): string {
    const { showHeader, showFooter, totalConfigs, language } = options;

    const t = translations[language];

    let message = '';

    if (showHeader) {
        message += `🔐 <b>${t.header} ${escapeHtml(process.env.NEXT_PUBLIC_VPN_NAME ?? '')}</b>\n\n`;
    }

    const configMessages = configs.map((config, index) => {
        const decryptedVpnKey = encryptionService.decryptField(config.vpnKey);

        const expiryDate = config.expiresAt
            ? format(
                  new Date(Number(config.expiresAt) * 1000),
                  language === 'RUSSIAN' ? 'dd.MM.yyyy' : 'MM/dd/yyyy'
              )
            : t.notSet;

        const clientNameDisplay = config.clientName.startsWith(clientName)
            ? config.clientName.split('-')[1] || config.clientName
            : config.clientName;

        // Escaped because these are names an admin typed and a key the VPN server
        // produced: an unescaped `&` or `<` makes Telegram reject the whole message with
        // "can't parse entities", and the client is left with no key at all.
        return `${t.configFor} <b>${escapeHtml(clientNameDisplay)}</b>
${t.protocol}: <b>${escapeHtml(protocolsMapping[config.protocol] || t.notSpecified)}</b>
${t.expirationDate}: <b>${expiryDate}</b>
<code>${escapeHtml(decryptedVpnKey ?? '')}</code>${index < configs.length - 1 ? '\n─────────────────────\n' : ''}`;
    });

    message += configMessages.join('\n');

    if (showFooter) {
        message += `\n\n📦 ${t.totalConfigs}: ${totalConfigs}`;
    }

    return message;
}

export async function sendConfigsToTelegram(
    clientName: string,
    telegramId: string,
    language: Languages,
    configs?: TelegramConfig[],
    clientId?: number | null
) {
    if (!configs) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Error' });

    const MAX_CONFIGS_PER_MESSAGE = 3;

    const configGroups: TelegramConfig[][] = [];
    for (let i = 0; i < configs.length; i += MAX_CONFIGS_PER_MESSAGE) {
        configGroups.push(configs.slice(i, i + MAX_CONFIGS_PER_MESSAGE));
    }

    for (let i = 0; i < configGroups.length; i++) {
        const currentGroup = configGroups[i];
        if (!currentGroup) continue;

        const isFirstGroup = i === 0;
        const isLastGroup = i === configGroups.length - 1;

        const message = formatConfigsMessage(currentGroup, clientName, {
            showHeader: isFirstGroup,
            showFooter: isLastGroup,
            totalConfigs: configs.length,
            language,
        });

        try {
            const sent = await telegramService.sendMessage(
                {
                    chatId: telegramId,
                    text: message,
                    parseMode: 'HTML',
                },
                clientName
            );

            await recordKeyMessage(
                telegramId,
                sent.message_id,
                currentGroup.map((config) => config.id),
                clientId
            );
        } catch (error: any) {
            if (
                error?.message?.includes('message is too long') ||
                error?.message?.includes('parse error')
            ) {
                for (const config of currentGroup) {
                    const singleMessage = formatConfigsMessage([config], clientName, {
                        showHeader: isFirstGroup && currentGroup.indexOf(config) === 0,
                        showFooter:
                            isLastGroup && currentGroup.indexOf(config) === currentGroup.length - 1,
                        totalConfigs: configs.length,
                        language,
                    });

                    const sent = await telegramService.sendMessage(
                        {
                            chatId: telegramId,
                            text: singleMessage,
                            parseMode: 'HTML',
                        },
                        clientName
                    );

                    await recordKeyMessage(telegramId, sent.message_id, [config.id], clientId);
                }
            } else {
                throw error;
            }
        }
    }
}
