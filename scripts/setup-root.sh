#!/bin/bash

ENV_FILE=$(find /root /home /opt -type f -name ".env" -path "*/amnezia-panel/*" 2>/dev/null | head -n 1)

if [ -n "$ENV_FILE" ]; then
    source "$ENV_FILE"
else
    echo "Error: .env file not found!"
    exit 1
fi

if [ -z "${ROOT_SECRET}" ]; then
    echo "Error: ROOT_SECRET not set in .env file!"
    exit 1
fi

MACHINE_IP=$(hostname -I | awk '{print $1}')

curl -X POST "https://$MACHINE_IP:8443/api/auth/setup-root" -H "Authorization: Bearer $ROOT_SECRET" \
    --insecure # delete if will be not selfsigned cert
echo