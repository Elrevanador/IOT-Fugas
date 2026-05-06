#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-127.0.0.1}"
PORT="${2:-4000}"
BAUD="${3:-115200}"

if ! command -v nc >/dev/null 2>&1; then
  echo "No se encontro 'nc'. Instala netcat para validar el puerto antes de abrir la consola serie." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "No se encontro 'python3'." >&2
  exit 1
fi

echo "Verificando puerto RFC2217 en ${HOST}:${PORT}..."
if ! nc -z "$HOST" "$PORT" >/dev/null 2>&1; then
  echo "No hay ninguna simulacion escuchando en ${HOST}:${PORT}." >&2
  echo "Abre primero Wokwi o la simulacion que expone 'rfc2217ServerPort = ${PORT}'." >&2
  exit 1
fi

echo "Conectando al serial en rfc2217://${HOST}:${PORT} a ${BAUD} baudios"
echo "Salir: Ctrl+] "
exec python3 -m serial.tools.miniterm "rfc2217://${HOST}:${PORT}" "$BAUD" -q --eol LF
