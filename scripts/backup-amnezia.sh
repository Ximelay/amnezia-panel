#!/bin/bash

CRON_SECRET="Secret"  # Change CRON_SECRET
SERVER_IP="IP Address or Domain"       # Change IP or Domain
PANEL_URL="https://IP:PORT"  # Change URL

BACKUP_DIR="/root/backups/amnezia"
TIMESTAMP=$(date +"%Y%m%d%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/backup-${TIMESTAMP}.json"

if [ -z "${CRON_SECRET}" ] || [ "${CRON_SECRET}" = "Secret" ]; then
    echo "Error: Please set CRON_SECRET in the script!"
    exit 1
fi

if [ -z "${SERVER_IP}" ] || [ "${SERVER_IP}" = "IP" ]; then
    echo "Error: Please set SERVER_IP in the script!"
    exit 1
fi

mkdir -p "${BACKUP_DIR}"

echo "Starting Amnezia configuration backup for server IP: $SERVER_IP"

HTTP_STATUS=$(curl -s -o "${BACKUP_FILE}" -w "%{http_code}" \
    -X POST "${PANEL_URL}/api/cron/backup-amnezia" \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    -H "Content-Type: application/json" \
    -d "{\"ip\":\"${SERVER_IP}\"}")

if [ "$HTTP_STATUS" -eq 200 ]; then
    echo "Backup created successfully: $BACKUP_FILE"
    chmod 400 "$BACKUP_FILE"
    
    BACKUP_COUNT=$(ls -1 ${BACKUP_DIR}/backup-*.json 2>/dev/null | wc -l)
    if [ "${BACKUP_COUNT}" -gt 3 ]; then
        NUM_TO_DELETE=$((${BACKUP_COUNT} - 3))
        ls -1 ${BACKUP_DIR}/backup-*.json | sort | head -n ${NUM_TO_DELETE} | xargs -r rm --
        echo "Removed $NUM_TO_DELETE old backup(s)"
    fi
else
    echo "Error: Failed to create backup. HTTP status: $HTTP_STATUS"
    if [ -f "$BACKUP_FILE" ]; then
        echo "Response content:"
        cat "$BACKUP_FILE"
        rm "$BACKUP_FILE"
    fi
    exit 1
fi