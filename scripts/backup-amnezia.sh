#!/bin/bash

CRON_SECRET="your_secret_here"  # Change to your actual CRON_SECRET
SERVER_IP="your_server_ip_here" # Change to your server IP or domain
PANEL_URL="https://your-panel-domain.com"  # Change to your panel URL

BACKUP_DIR="/root/backups/amnezia"
TIMESTAMP=$(date +"%Y%m%d%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/backup-${TIMESTAMP}.json"

# Проверка переменных
if [ -z "${CRON_SECRET}" ] || [ "${CRON_SECRET}" = "your_secret_here" ]; then
    echo "Error: Please set CRON_SECRET in the script!"
    exit 1
fi

if [ -z "${SERVER_IP}" ] || [ "${SERVER_IP}" = "your_server_ip_here" ]; then
    echo "Error: Please set SERVER_IP in the script!"
    exit 1
fi

if [ -z "${PANEL_URL}" ] || [ "${PANEL_URL}" = "https://your-panel-domain.com" ]; then
    echo "Error: Please set PANEL_URL in the script!"
    exit 1
fi

# Создание директории для бэкапов
mkdir -p "${BACKUP_DIR}"

echo "Starting Amnezia configuration backup for server IP: $SERVER_IP"
echo "Panel URL: $PANEL_URL"

# Выполнение запроса к API
HTTP_STATUS=$(curl -s -o "${BACKUP_FILE}" -w "%{http_code}" \
    -X POST "${PANEL_URL}/api/cron/amnezia-backup" \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    -H "Content-Type: application/json" \
    -d "{\"ip\":\"${SERVER_IP}\"}")

echo "HTTP Status: $HTTP_STATUS"

if [ "$HTTP_STATUS" -eq 200 ]; then
    echo "Backup created successfully: $BACKUP_FILE"
    
    # Проверяем, что файл содержит данные
    if [ -s "$BACKUP_FILE" ]; then
        echo "Backup size: $(stat -c%s "$BACKUP_FILE") bytes"
        chmod 400 "$BACKUP_FILE"
        
        # Удаление старых бэкапов (оставляем последние 3)
        BACKUP_COUNT=$(ls -1 ${BACKUP_DIR}/backup-*.json 2>/dev/null | wc -l)
        if [ "${BACKUP_COUNT}" -gt 3 ]; then
            NUM_TO_DELETE=$((${BACKUP_COUNT} - 3))
            echo "Found $BACKUP_COUNT backups. Removing $NUM_TO_DELETE old backup(s)..."
            ls -1 ${BACKUP_DIR}/backup-*.json | sort | head -n ${NUM_TO_DELETE} | xargs -r rm -f --
            echo "Removed $NUM_TO_DELETE old backup(s)"
        fi
    else
        echo "Warning: Backup file is empty!"
        exit 1
    fi
else
    echo "Error: Failed to create backup. HTTP status: $HTTP_STATUS"
    if [ -f "$BACKUP_FILE" ]; then
        echo "Response content:"
        cat "$BACKUP_FILE"
        echo ""
        rm -f "$BACKUP_FILE"
    fi
    exit 1
fi

echo "Backup process completed successfully."
echo