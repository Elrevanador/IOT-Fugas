#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKEN_FILE="$ROOT_DIR/.env.wokwi"
HOST="${WOKWI_SERIAL_HOST:-127.0.0.1}"
PORT="${WOKWI_SERIAL_PORT:-4000}"
BAUD="${WOKWI_SERIAL_BAUD:-115200}"
WAIT_SECONDS="${WOKWI_SERIAL_WAIT_SECONDS:-20}"
TIMEOUT_MS="${WOKWI_TIMEOUT_MS:-600000}"
RUN_MODE="${WOKWI_RUN_MODE:-auto}"
SKIP_BUILD="${WOKWI_SKIP_BUILD:-0}"

usage() {
  cat <<EOF
Uso:
  ./simular_y_serial.sh

Variables opcionales:
  WOKWI_RUN_MODE=auto|cli|serial
  WOKWI_SKIP_BUILD=1
  WOKWI_TIMEOUT_MS=600000
  WOKWI_CLI_TOKEN=...
  WOKWI_SERIAL_HOST=127.0.0.1
  WOKWI_SERIAL_PORT=4000
  WOKWI_SERIAL_BAUD=115200
  WOKWI_SERIAL_WAIT_SECONDS=20

Modos:
  auto   intenta wokwi-cli y si no existe usa el puerto serial RFC2217
  cli    obliga a ejecutar wokwi-cli
  serial conecta al puerto RFC2217 ya expuesto por la simulacion
EOF
}

load_local_token() {
  if [[ -n "${WOKWI_CLI_TOKEN:-}" ]]; then
    return 0
  fi

  if [[ -f "$TOKEN_FILE" ]]; then
    # Carga un token local del proyecto sin obligar a modificar ~/.bashrc.
    # shellcheck disable=SC1090
    source "$TOKEN_FILE"
  fi
}

port_ready() {
  nc -z "$HOST" "$PORT" >/dev/null 2>&1
}

wait_for_port() {
  local elapsed=0

  echo "Esperando hasta ${WAIT_SECONDS}s a que aparezca ${HOST}:${PORT}..."
  while (( elapsed < WAIT_SECONDS )); do
    if port_ready; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  return 1
}

run_serial_mode() {
  if ! command -v nc >/dev/null 2>&1; then
    echo "No se encontro 'nc'. Instala netcat para validar el puerto serial." >&2
    exit 1
  fi

  if port_ready || wait_for_port; then
    exec "$ROOT_DIR/ver_serial_terminal.sh" "$HOST" "$PORT" "$BAUD"
  fi

  echo "No aparecio ninguna simulacion en ${HOST}:${PORT}." >&2
  echo "Si usas VS Code, compila el proyecto y luego ejecuta 'Wokwi: Start Simulator'." >&2
  echo "Si prefieres una sola terminal, instala wokwi-cli y exporta WOKWI_CLI_TOKEN." >&2
  exit 1
}

run_cli_mode() {
  if ! command -v wokwi-cli >/dev/null 2>&1; then
    echo "No se encontro 'wokwi-cli' en PATH." >&2
    echo "Instalacion oficial: curl -L https://wokwi.com/ci/install.sh | sh" >&2
    exit 1
  fi

  if [[ -z "${WOKWI_CLI_TOKEN:-}" ]]; then
    echo "Falta la variable WOKWI_CLI_TOKEN para usar wokwi-cli." >&2
    echo "Crea el token en Wokwi CI Dashboard y exportalo antes de correr este script." >&2
    exit 1
  fi

  echo "Iniciando simulacion con wokwi-cli..."
  echo "El serial saldra en esta misma terminal."
  echo "Para escribir comandos al ESP32, usa esta misma consola."
  exec wokwi-cli "$ROOT_DIR" --interactive --timeout "$TIMEOUT_MS"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

load_local_token

if [[ "$SKIP_BUILD" != "1" ]]; then
  "$ROOT_DIR/build_wokwi_bundle.sh"
fi

case "$RUN_MODE" in
  auto)
    if command -v wokwi-cli >/dev/null 2>&1 && [[ -n "${WOKWI_CLI_TOKEN:-}" ]]; then
      run_cli_mode
    fi
    run_serial_mode
    ;;
  cli)
    run_cli_mode
    ;;
  serial)
    run_serial_mode
    ;;
  *)
    echo "Modo invalido: $RUN_MODE" >&2
    usage >&2
    exit 1
    ;;
esac
