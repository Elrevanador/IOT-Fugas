#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$ROOT_DIR/build"
WORKSPACE_BUILD_DIR="$(cd "$ROOT_DIR/.." && pwd)/build"
FQBN="${FQBN:-esp32:esp32:esp32}"
SKETCH_NAME="$(basename "$ROOT_DIR").ino"
SKETCH_PATH="$ROOT_DIR/$SKETCH_NAME"
LIBRARIES_FILE="$ROOT_DIR/libraries.txt"
LOCAL_LIBRARIES_DIR="$ROOT_DIR/libraries"
BACKEND_ENV_FILE="$(cd "$ROOT_DIR/.." && pwd)/backend/.env"

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
BUILD_PROPERTIES=()

if [[ -d "$LOCAL_LIBRARIES_DIR" ]]; then
  echo "==> Usando librerias locales desde $LOCAL_LIBRARIES_DIR"
  COMPILE_ARGS+=(--libraries "$LOCAL_LIBRARIES_DIR")
fi

if [[ -n "${ARDUINO_BUILD_PROPERTIES:-}" ]]; then
  while IFS= read -r build_property; do
    [[ -z "$build_property" ]] && continue
    BUILD_PROPERTIES+=("$build_property")
  done <<< "$ARDUINO_BUILD_PROPERTIES"
fi

has_ingest_key_define() {
  local property
  for property in "${BUILD_PROPERTIES[@]}"; do
    if [[ "$property" == *"INGEST_API_KEY_VALUE"* ]]; then
      return 0
    fi
  done
  return 1
}

read_backend_ingest_key() {
  [[ -f "$BACKEND_ENV_FILE" ]] || return 1

  awk -F= '
    $1 == "INGEST_API_KEY" {
      value = $0
      sub(/^[^=]*=/, "", value)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      gsub(/^"|"$/, "", value)
      gsub(/^'\''|'\''$/, "", value)
      print value
      exit
    }
  ' "$BACKEND_ENV_FILE"
}

escape_define_value() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s' "$value"
}

if ! has_ingest_key_define; then
  BACKEND_INGEST_KEY="$(read_backend_ingest_key || true)"
  if [[ -n "$BACKEND_INGEST_KEY" ]]; then
    echo "==> Usando INGEST_API_KEY desde backend/.env para la simulacion"
    BUILD_PROPERTIES+=("compiler.cpp.extra_flags=-DINGEST_API_KEY_VALUE=\"$(escape_define_value "$BACKEND_INGEST_KEY")\"")
  else
    echo "==> Aviso: no se encontro INGEST_API_KEY. El firmware usara la clave de ejemplo y Railway rechazara el envio." >&2
  fi
fi

if (( ${#BUILD_PROPERTIES[@]} > 0 )); then
  echo "==> Aplicando build properties"
  for build_property in "${BUILD_PROPERTIES[@]}"; do
    COMPILE_ARGS+=(--build-property "$build_property")
  done
fi

echo "==> Compilando $SKETCH_NAME"
arduino-cli compile "${COMPILE_ARGS[@]}" "$ROOT_DIR"
APP_BIN="$BUILD_DIR/$SKETCH_NAME.bin"
ELF_BIN="$BUILD_DIR/$SKETCH_NAME.elf"
MERGED_BIN="$BUILD_DIR/$SKETCH_NAME.merged.bin"

for path in "$APP_BIN" "$ELF_BIN" "$MERGED_BIN"; do
  if [[ ! -f "$path" ]]; then
    echo "Falta el archivo requerido: $path" >&2
    exit 1
  fi
done

mkdir -p "$WORKSPACE_BUILD_DIR"
cp "$APP_BIN" "$WORKSPACE_BUILD_DIR/$SKETCH_NAME.bin"
cp "$ELF_BIN" "$WORKSPACE_BUILD_DIR/$SKETCH_NAME.elf"
cp "$MERGED_BIN" "$WORKSPACE_BUILD_DIR/$SKETCH_NAME.merged.bin"

echo "==> Listo"
echo "   Firmware : $APP_BIN"
echo "   ELF      : $ELF_BIN"
echo "   Merged   : $MERGED_BIN"
echo "   Copia Wokwi workspace : $WORKSPACE_BUILD_DIR/$SKETCH_NAME.merged.bin"
