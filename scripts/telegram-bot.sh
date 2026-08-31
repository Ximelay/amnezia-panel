#!/bin/bash
#
# Drives the client-facing Telegram bot.
#
# Telegram cannot reach the panel — it listens on loopback behind a self-signed cert — so
# the bot polls instead of receiving a webhook. One run long-polls for ~50 seconds and
# then returns, which is why this belongs on a per-minute schedule:
#
#   * * * * * /root/amnezia-panel/scripts/telegram-bot.sh >> /var/log/tg-bot.log 2>&1
#
# Overlapping runs are harmless: the panel keeps a lease in the database and a second run
# exits immediately rather than consuming the same updates twice.

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

# --max-time outlives the run budget in the route; without it a wedged long poll would
# leave curl hanging until the next tick starts another one.
curl -X POST "https://127.0.0.1:8443/api/cron/telegram-bot" \
    -H "Authorization: Bearer $CRON_SECRET" \
    --max-time 90 \
    --insecure # delete if will be not selfsigned cert
echo