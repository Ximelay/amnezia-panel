#!/bin/bash

# Local development counterpart of setup-root.sh / reset-root.sh.
#
# Those scripts target a deployed server: they look for .env under /root, /home
# or /opt, resolve the host with `hostname -I` (a GNU-only flag) and call the
# panel over https on port 8443. None of that holds for a dev machine, so this
# script reads panel/.env directly and talks to `yarn dev` over plain http.
#
#   bash scripts/setup-root-local.sh            # create the ROOT user
#   bash scripts/setup-root-local.sh --reset    # reset a forgotten ROOT login
#   PORT=3001 bash scripts/setup-root-local.sh  # non-default dev port

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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

# Reads a value without sourcing the file, so a stray command in .env is inert.
read_env_value() {
    grep -E "^${1}=" "$2" 2>/dev/null | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}

ACTION="setup"
if [ "$1" = "--reset" ]; then
    ACTION="reset"
elif [ -n "$1" ]; then
    print_error "Unknown argument: $1 (expected --reset or nothing)"
    exit 1
fi

PROJECT_ROOT="$(get_project_root)"
ENV_FILE="$PROJECT_ROOT/panel/.env"
PORT="${PORT:-3000}"
URL="http://localhost:$PORT/api/auth/$ACTION-root"

if [ ! -f "$ENV_FILE" ]; then
    print_error "No .env at $ENV_FILE"
    echo "       Copy panel/.env.example to panel/.env and fill it in."
    exit 1
fi

ROOT_SECRET="$(read_env_value "ROOT_SECRET" "$ENV_FILE")"
if [ -z "$ROOT_SECRET" ]; then
    print_error "ROOT_SECRET is not set in $ENV_FILE"
    exit 1
fi

print_message "Calling $URL"

HTTP_BODY=""
HTTP_CODE=""
RESPONSE="$(curl -s -w $'\n%{http_code}' -X POST "$URL" \
    -H "Authorization: Bearer $ROOT_SECRET" 2>/dev/null)" || {
    print_error "Could not reach the panel on port $PORT"
    echo "       Start it first:  cd panel && corepack yarn dev"
    exit 1
}

HTTP_CODE="$(echo "$RESPONSE" | tail -n1)"
HTTP_BODY="$(echo "$RESPONSE" | sed '$d')"

case "$HTTP_CODE" in
    200)
        print_message "$(echo "$HTTP_BODY" | sed -e 's/.*"message":"//' -e 's/".*//')"
        ;;
    400)
        if [ "$ACTION" = "setup" ]; then
            print_warning "A ROOT user already exists."
            echo "         Forgot the credentials? Run: bash scripts/setup-root-local.sh --reset"
        else
            print_warning "There is no ROOT user to reset. Run without --reset to create one."
        fi
        exit 1
        ;;
    401)
        print_error "ROOT_SECRET was rejected."
        echo "       The dev server reads .env at startup, so restart it after editing that value."
        exit 1
        ;;
    *)
        print_error "Unexpected response (HTTP $HTTP_CODE): $HTTP_BODY"
        exit 1
        ;;
esac