#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$ROOT_DIR/build"
FQBN="${FQBN:-esp32:esp32:esp32}"
SKETCH_NAME="$(basename "$ROOT_DIR").ino"
SKETCH_PATH="$ROOT_DIR/$SKETCH_NAME"
LIBRARIES_FILE="$ROOT_DIR/libraries.txt"
LOCAL_LIBRARIES_DIR="$ROOT_DIR/libraries"

if [[ ! -f "$SKETCH_PATH" ]]; then
  echo "No se encontro el sketch principal en $SKETCH_PATH" >&2
  exit 1
fi

if [[ -f "$LIBRARIES_FILE" ]]; then
  REQUIRED_LIBS=()

  while IFS= read -r library_spec; do
    local_library_name="${library_spec%@*}"

    if [[ -d "$LOCAL_LIBRARIES_DIR/$local_library_name" ]]; then
      continue
    fi

    REQUIRED_LIBS+=("$library_spec")
  done < <(
    awk '
      /^[[:space:]]*(#|$)/ { next }
      {
        sub(/^[[:space:]]+/, "")
        sub(/[[:space:]]+$/, "")
        print
      }
    ' "$LIBRARIES_FILE"
  )

  if (( ${#REQUIRED_LIBS[@]} > 0 )); then
    echo "==> Verificando librerias"
    arduino-cli lib install --no-overwrite "${REQUIRED_LIBS[@]}"
  fi
fi

mkdir -p "$BUILD_DIR"

COMPILE_ARGS=(--clean --fqbn "$FQBN" --build-path "$BUILD_DIR")

if [[ -d "$LOCAL_LIBRARIES_DIR" ]]; then
  echo "==> Usando librerias locales desde $LOCAL_LIBRARIES_DIR"
  COMPILE_ARGS+=(--libraries "$LOCAL_LIBRARIES_DIR")
fi

if [[ -n "${ARDUINO_BUILD_PROPERTIES:-}" ]]; then
  echo "==> Aplicando build properties personalizadas"
  while IFS= read -r build_property; do
    [[ -z "$build_property" ]] && continue
    COMPILE_ARGS+=(--build-property "$build_property")
  done <<< "$ARDUINO_BUILD_PROPERTIES"
fi

echo "==> Compilando $SKETCH_NAME"
arduino-cli compile "${COMPILE_ARGS[@]}" "$ROOT_DIR"
APP_BIN="$BUILD_DIR/$SKETCH_NAME.bin"
ELF_BIN="$BUILD_DIR/$SKETCH_NAME.elf"

for path in "$APP_BIN" "$ELF_BIN"; do
  if [[ ! -f "$path" ]]; then
    echo "Falta el archivo requerido: $path" >&2
    exit 1
  fi
done

echo "==> Listo"
echo "   Firmware : $APP_BIN"
echo "   ELF      : $ELF_BIN"
