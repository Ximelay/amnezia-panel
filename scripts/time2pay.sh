#!/bin/bash

ENV_FILE=$(find / -type f -name ".env" -path "*/amnezia-panel/*" 2>/dev/null | head -n 1)

if [ -n "$ENV_FILE" ]; then
    source "$ENV_FILE"
else
    echo "Error: .env file not found!"
    exit 1
fi

MACHINE_IP=$(hostname -I | awk '{print $1}')

curl -X POST "https://$MACHINE_IP/api/cron/time2pay" -H "Authorization: Bearer $CRON_SECRET" \
    --insecure # delete if will be not selfsigned cert