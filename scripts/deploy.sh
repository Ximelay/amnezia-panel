#!/bin/bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

APP_HOST=$(hostname -I | awk '{print $1}')

print_message() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

get_project_root() {
    local script_dir
    script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    echo "$(dirname "$script_dir")"
}

generate_encryption_key() {
    if command -v node &> /dev/null; then
        node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" 2>/dev/null || echo ""
    else
        print_error "Neither node not found. Cannot generate encryption key."
        exit 1
    fi
}

generate_auth_secret() {
    if command -v openssl &> /dev/null; then
        openssl rand -base64 32 2>/dev/null || echo ""
    else
        print_error "Neither openssl not found. Cannot generate auth secret."
        exit 1
    fi
}

read_env_value() {
    local key="$1"
    local env_file="$2"
    if [ -f "$env_file" ] && [ -s "$env_file" ]; then
        grep -E "^[[:space:]]*${key}[[:space:]]*=" "$env_file" 2>/dev/null | head -n 1 | cut -d '=' -f2- | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
    else
        echo ""
    fi
}

prompt_with_default() {
    local var_name="$1"
    local prompt_text="$2"
    local script_default_value="$3"
    local is_secret="${4:-false}"
    local env_file="$5"

    local current_value=""
    local display_value=""
    local default_value="$script_default_value"

    if [ -f "$env_file" ] && [ -s "$env_file" ]; then
        current_value=$(read_env_value "$var_name" "$env_file")
    fi

    if [ -n "$current_value" ] && [ "$current_value" != "\"\"" ] && [ "$current_value" != "''" ]; then
        default_value="$current_value"
    fi

    if [ "$is_secret" = "true" ] && [ -n "$default_value" ]; then
        display_value="[Use existing value]"
    elif [ -n "$default_value" ]; then
        display_value="[$default_value]"
    else
        display_value="[]"
    fi

    exec 3>/dev/tty
    printf "%s %s: " "$prompt_text" "$display_value" >&3

    local user_input
    if [ "$is_secret" = "true" ]; then
        user_input=$(head -1 < /dev/tty)
        if [ -z "$user_input" ] && [ -n "$current_value" ]; then
            echo "$current_value"
        elif [ -z "$user_input" ] && [ -n "$script_default_value" ]; then
            echo "$script_default_value"
        else
            echo "$user_input"
        fi
    else
        user_input=$(head -1 < /dev/tty)
        if [ -z "$user_input" ]; then
            echo "$default_value"
        else
            echo "$user_input"
        fi
    fi
    exec 3>&-
}

add_cron_jobs() {
    local project_root="$1"
    local backup_db_path="$project_root/scripts/backup-database.sh"
    local time2pay_path="$project_root/scripts/time2pay.sh"

    local cron_backup="0 0 */3 * * /bin/bash $backup_db_path"
    local cron_time2pay="30 10 * * * /bin/bash $time2pay_path"

    local temp_crontab=$(mktemp)

    if ! command -v crontab -l >/dev/null 2>&1; then
        print_message "Installing cron..."
        apt install cron -y
    fi

    print_message "Setting up cron jobs..."

    crontab -l 2>/dev/null > "$temp_crontab" || true

    if grep -qF "$backup_db_path" "$temp_crontab"; then
        print_message "Cron job for backup already exists"
    else
        echo "$cron_backup" >> "$temp_crontab"
        print_message "Cron job added: Database backup every 3 days at midnight"
    fi

    if grep -qF "$time2pay_path" "$temp_crontab"; then
        print_message "Cron job for time2pay already exists"
    else
        echo "$cron_time2pay" >> "$temp_crontab"
        print_message "Cron job added: time2pay daily at 10:30"
    fi

    crontab "$temp_crontab"
    rm -f "$temp_crontab"

    print_message "Current cron jobs:"
    crontab -l 2>/dev/null | grep -E "(backup|time2pay|$project_root)" || echo "  (no relevant cron jobs found)"
}

setup_autostart() {
    local panel_dir="$1"
    local service_name="amnezia-panel"
    local service_file="/etc/systemd/system/${service_name}.service"

    if ! command -v systemctl >/dev/null 2>&1; then
        print_warning "systemd not found, cannot set up autostart."
        return 1
    fi

    if [ "$EUID" -ne 0 ]; then
        print_warning "Not running as root, cannot set up autostart. Please run with sudo."
        return 1
    fi

    local docker_cmd
    docker_cmd=$(command -v docker)
    if [ -z "$docker_cmd" ]; then
        print_error "docker command not found, cannot set up autostart."
        return 1
    fi

    print_message "Creating systemd service for autostart..."

    cat > "$service_file" << EOF
[Unit]
Description=AmneziaVPN Panel
After=docker.service
Requires=docker.service
Wants=network.target
After=network.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${panel_dir}
ExecStart=${docker_cmd} compose --env-file .env up -d
ExecStop=${docker_cmd} compose down
User=root
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable "${service_name}.service"

    if ! systemctl is-active --quiet "${service_name}.service"; then
        systemctl start "${service_name}.service"
        print_message "Service started."
    else
        print_message "Service already running."
    fi

    print_message "Autostart enabled: $service_name"
}

install_nodejs() {
    if ! command -v node >/dev/null 2>&1; then
        if ! command -v curl >/dev/null 2>&1; then
            apt-get update -y
            apt-get install -y curl
        fi

        print_message "Installing NodeJS and yarn..."
        curl -fsSL https://raw.githubusercontent.com/tj/n/master/bin/n | bash -s lts
        hash -r
    fi

    node -v > /dev/null 2>&1 && npm -v > /dev/null 2>&1

    if ! command -v yarn >/dev/null 2>&1; then
        npm install -g yarn > /dev/null 2>&1
    fi

    yarn -v > /dev/null 2>&1
}

main() {
    PROJECT_ROOT=$(get_project_root)
    PANEL_DIR="$PROJECT_ROOT/panel"

    print_message "Project root: $PROJECT_ROOT"
    print_message "Panel directory: $PANEL_DIR"

    local original_dir=$(pwd)

    if [ ! -d "$PANEL_DIR" ]; then
        print_message "Creating panel directory..."
        mkdir -p "$PANEL_DIR"
    fi

    ENV_FILE="$PANEL_DIR/.env"

    install_nodejs

    print_message "Starting deployment of AmneziaVPN Panel"

    cd "$PANEL_DIR" || {
        print_error "Failed to change directory to $PANEL_DIR"
        exit 1
    }

    print_message "Checking SSL certificates..."
    if [ ! -d "certs" ]; then
        mkdir -p certs
    fi

    if [ ! -f "certs/selfsigned.crt" ] || [ ! -f "certs/selfsigned.key" ]; then
        print_message "Generating self-signed SSL certificates..."
        openssl req -x509 -newkey rsa:4096 \
            -keyout certs/selfsigned.key \
            -out certs/selfsigned.crt \
            -days 365 -nodes \
            -subj "/CN=amnezia-panel.local" 2>/dev/null || {
            print_error "Failed to generate SSL certificates"
            exit 1
        }

        print_message "SSL certificates generated successfully"
    else
        print_message "SSL certificates already exist"
    fi

    print_message "Loading default values..."

    print_message "Configuring environment variables (press Enter to use default value):"
    echo "================================================"

    if [ ! -f "$ENV_FILE" ]; then
        print_message "No .env file found, will create new one"
    else
        if [ ! -s "$ENV_FILE" ]; then
            print_message "Found empty .env file, will recreate it"
        else
            print_message "Found existing .env file at $ENV_FILE"
        fi
    fi

    NEXT_PUBLIC_VPN_NAME=$(prompt_with_default "NEXT_PUBLIC_VPN_NAME" "VPN Service Name" "AmneziaVPN" false "$ENV_FILE")

    NEXT_PUBLIC_USES_TELEGRAM_BOT=$(prompt_with_default "NEXT_PUBLIC_USES_TELEGRAM_BOT" "Use Telegram Bot (true/false)" "true" false "$ENV_FILE")

    DB_USER=$(prompt_with_default "DB_USER" "Database username" "username" false "$ENV_FILE")

    DB_PASSWORD=$(prompt_with_default "DB_PASSWORD" "Database password" "password" true "$ENV_FILE")

    DB_NAME=$(prompt_with_default "DB_NAME" "Database name" "panel" false "$ENV_FILE")

    DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@db:5432/${DB_NAME}"

    TELEGRAM_BOT_TOKEN=$(prompt_with_default "TELEGRAM_BOT_TOKEN" "Telegram Bot Token (optional, press Enter for none)" "" true "$ENV_FILE")

    if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
        NEXT_PUBLIC_USES_TELEGRAM_BOT="false"
    else
        NEXT_PUBLIC_USES_TELEGRAM_BOT="true"
    fi

    ENCRYPTION_KEY=$(read_env_value "ENCRYPTION_KEY" "$ENV_FILE")
    if [ -z "$ENCRYPTION_KEY" ]; then
        print_message "Generating new ENCRYPTION_KEY..."
        ENCRYPTION_KEY=$(generate_encryption_key)
        if [ -n "$ENCRYPTION_KEY" ]; then
            print_message "ENCRYPTION_KEY generated successfully"
        else
            print_error "Failed to generate ENCRYPTION_KEY"
            exit 1
        fi
    else
        print_message "Using existing ENCRYPTION_KEY from .env"
    fi

    AUTH_SECRET=$(read_env_value "AUTH_SECRET" "$ENV_FILE")
    if [ -z "$AUTH_SECRET" ]; then
        print_message "Generating new AUTH_SECRET..."
        AUTH_SECRET=$(generate_auth_secret)
        if [ -n "$AUTH_SECRET" ]; then
            print_message "AUTH_SECRET generated successfully"
        else
            print_error "Failed to generate AUTH_SECRET"
            exit 1
        fi
    else
        print_message "Using existing AUTH_SECRET from .env"
    fi

    CRON_SECRET=$(read_env_value "CRON_SECRET" "$ENV_FILE")
    if [ -z "$CRON_SECRET" ]; then
        print_message "Generating new CRON_SECRET..."
        CRON_SECRET=$(generate_encryption_key)
        if [ -n "$CRON_SECRET" ]; then
            print_message "CRON_SECRET generated successfully"
        else
            print_error "Failed to generate CRON_SECRET"
            exit 1
        fi
    else
        print_message "Using existing CRON_SECRET from .env"
    fi

    ROOT_SECRET=$(read_env_value "ROOT_SECRET" "$ENV_FILE")
    if [ -z "$ROOT_SECRET" ]; then
        print_message "Generating new ROOT_SECRET..."
        ROOT_SECRET=$(generate_encryption_key)
        if [ -n "$ROOT_SECRET" ]; then
            print_message "ROOT_SECRET generated successfully"
        else
            print_error "Failed to generate ROOT_SECRET"
            exit 1
        fi
    else
        print_message "Using existing ROOT_SECRET from .env"
    fi

    NODE_ENV=$(prompt_with_default "NODE_ENV" "Node environment (development/test/production)" "production" false "$ENV_FILE")

    print_message "Creating/updating .env file at $ENV_FILE..."

    ENV_TEMP=$(mktemp)

    cat > "$ENV_TEMP" << EOF
# VPN Name Service
NEXT_PUBLIC_VPN_NAME="${NEXT_PUBLIC_VPN_NAME}"
# true or false
NEXT_PUBLIC_USES_TELEGRAM_BOT="${NEXT_PUBLIC_USES_TELEGRAM_BOT}"

# PostgreSQL database
DB_USER="${DB_USER}"
DB_PASSWORD="${DB_PASSWORD}"
DB_NAME="${DB_NAME}"
DATABASE_URL="${DATABASE_URL}"

# Telegram Bot Token (optional)
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN}"

# Key for encrypt VPN config keys
ENCRYPTION_KEY="${ENCRYPTION_KEY}"

# Cron secret key
CRON_SECRET="${CRON_SECRET}"
# Root secret key
ROOT_SECRET="${ROOT_SECRET}"

# Auth secret key
AUTH_SECRET="${AUTH_SECRET}"

# development or test or production
NODE_ENV="${NODE_ENV}"
EOF

    mv "$ENV_TEMP" "$ENV_FILE"

    chmod 600 "$ENV_FILE"

    print_message ".env file created/updated successfully at $ENV_FILE"

    print_message "Installing project dependencies..."
    yarn

    print_message "Checking Docker and Docker Compose..."

    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker using official docs."
        exit 1
    fi

    if ! command -v docker compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose using official docs."
        exit 1
    fi

    print_message "Building and starting Docker containers..."

    docker compose down || true

    print_message "Starting Docker..."
    docker compose --env-file .env up -d --build

    print_message "Checking container status..."

    sleep 5

    if docker ps | grep -q "app-amnezia-panel"; then
        print_message "Application container is running"
    else
        print_error "Application container failed to start"
        docker compose logs app
        exit 1
    fi

    if docker ps | grep -q "db-amnezia-panel"; then
        print_message "Database container is running"
    else
        print_error "Database container failed to start"
        docker compose logs db
        exit 1
    fi

    cd "$original_dir"

    add_cron_jobs "$PROJECT_ROOT"

    setup_autostart "$PANEL_DIR"

    cd "$PANEL_DIR"

    echo "================================================"
    print_message "Deployment completed successfully!"
    echo ""
    print_message "Application is available at:"
    print_message "  https://${APP_HOST}:8443"
    echo ""
    print_message "Containers running:"
    docker compose ps
    echo ""
    print_message "To view logs:"
    print_message "  docker compose logs -f"
    echo ""
    print_message "To stop the application:"
    print_message "  docker compose down"
    echo ""
    print_warning "Note: Using self-signed certificate. You may need to accept the security warning in your browser."
    print_warning "Note: If you have ENCRYPTION_KEY and old database then change .env."
    echo "================================================"
    print_message "Run the script <setup-root.sh> if you built the Amnezia Panel for the first time"
    echo ""
}

main "$@"