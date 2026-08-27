#!/bin/bash
#
# Deletes VPN keys out of client Telegram chats once they have outlived
# TELEGRAM_KEY_TTL_MINUTES.
#
# Telegram will not let the bot delete its own message more than 48 hours after sending,
# so this has to run comfortably more often than that. Hourly, via cron:
#
#   0 * * * * /root/amnezia-panel/scripts/telegram-cleanup.sh >> /var/log/tg-cleanup.log 2>&1

ENV_FILE=$(find /root /home /opt -type f -name ".env" -path "*/amnezia-panel/*" 2>/dev/null | head -n 1)

if [ -n "$ENV_FILE" ]; then
    source "$ENV_FILE"
else
    echo "Error: .env file not found!"
    exit 1
fi

if [ -z "${CRON_SECRET}" ]; then
    echo "Error: CRON_SECRET not set in .env file!"
    exit 1
fi

# The panel is published on 127.0.0.1 only, so this has to be a loopback call: the
# address `hostname -I` reports is not listening.
curl -X POST "https://127.0.0.1:8443/api/cron/telegram-cleanup" -H "Authorization: Bearer $CRON_SECRET" \
    --insecure # delete if will be not selfsigned cert
echo