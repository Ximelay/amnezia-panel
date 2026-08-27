#!/bin/bash
#
# Управление SSH-туннелем до админ-панели.
#
#   ./panel-tunnel.sh start    поднять туннель и открыть панель в браузере
#   ./panel-tunnel.sh stop     закрыть
#   ./panel-tunnel.sh status   проверить состояние
#
# Панель опубликована только на loopback сервера, поэтому иначе до неё не добраться.

set -u

SERVER="${PANEL_SERVER:-root@201.51.28.92}"
PORT="${PANEL_PORT:-8443}"
SOCKET="$HOME/.ssh/panel-tunnel.sock"
URL="https://127.0.0.1:${PORT}"

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; NC=$'\033[0m'

info()  { echo "${GREEN}[OK]${NC} $1"; }
warn()  { echo "${YELLOW}[..]${NC} $1"; }
error() { echo "${RED}[!!]${NC} $1" >&2; }

# Управляющий сокет ssh заменяет возню с PID-файлами: сам ssh и отвечает,
# жив ли туннель, и умеет корректно себя закрыть.
is_running() {
    ssh -S "$SOCKET" -O check "$SERVER" 2>/dev/null
}

start() {
    if is_running; then
        info "Туннель уже поднят: $URL"
        return 0
    fi

    # Осиротевший сокет остаётся, если процесс убили не через -O exit.
    [ -S "$SOCKET" ] && rm -f "$SOCKET"

    warn "Поднимаю туннель до $SERVER..."

    # ExitOnForwardFailure обязателен: без него ssh молча поднимется даже когда
    # порт занят, и вы получите пустую вкладку вместо внятной ошибки.
    if ! ssh -M -S "$SOCKET" -fN \
            -o ExitOnForwardFailure=yes \
            -o ServerAliveInterval=30 \
            -o ServerAliveCountMax=3 \
            -o Compression=yes \
            -L "${PORT}:127.0.0.1:${PORT}" \
            "$SERVER"; then
        error "Не удалось поднять туннель."
        if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
            error "Порт $PORT уже занят:"
            lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >&2
        fi
        return 1
    fi

    local code
    code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "$URL/auth/login" 2>/dev/null)

    if [ "$code" = "200" ]; then
        info "Панель отвечает: $URL"
        command -v open >/dev/null && open "$URL"
    else
        warn "Туннель поднят, но панель ответила '$code' вместо 200."
        warn "Проверьте на сервере: docker ps | grep app-amnezia-panel"
    fi
}

stop() {
    if ! is_running; then
        info "Туннель и так не запущен."
        [ -S "$SOCKET" ] && rm -f "$SOCKET"
        return 0
    fi

    ssh -S "$SOCKET" -O exit "$SERVER" 2>/dev/null
    info "Туннель закрыт."
}

status() {
    if is_running; then
        info "Туннель поднят."
        local code
        code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 "$URL/auth/login" 2>/dev/null)
        [ "$code" = "200" ] \
            && info "Панель отвечает 200: $URL" \
            || warn "Панель отвечает '$code' — туннель есть, приложение недоступно."
    else
        warn "Туннель не запущен."
        return 1
    fi
}

case "${1:-}" in
    start)   start ;;
    stop)    stop ;;
    restart) stop; start ;;
    status)  status ;;
    *)
        echo "Использование: $0 {start|stop|restart|status}"
        echo
        echo "Переопределяется переменными окружения:"
        echo "  PANEL_SERVER   по умолчанию $SERVER"
        echo "  PANEL_PORT     по умолчанию $PORT"
        exit 1
        ;;
esac