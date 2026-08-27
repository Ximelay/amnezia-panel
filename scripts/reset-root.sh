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

# The panel is published on 127.0.0.1 only, so this has to be a loopback call: the
# address `hostname -I` reports is not listening.
curl -X POST "https://127.0.0.1:8443/api/auth/reset-root" -H "Authorization: Bearer $ROOT_SECRET" \
    --insecure # delete if will be not selfsigned cert
echo