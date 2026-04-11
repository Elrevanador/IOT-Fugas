#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$ROOT_DIR/build"
DATA_DIR="$ROOT_DIR/data"
FQBN="${FQBN:-esp32:esp32:esp32}"
SKETCH_NAME="$(basename "$ROOT_DIR").ino"
SKETCH_PATH="$ROOT_DIR/$SKETCH_NAME"

if [[ ! -f "$SKETCH_PATH" ]]; then
  echo "No se encontro el sketch principal en $SKETCH_PATH" >&2
  exit 1
fi

mkdir -p "$BUILD_DIR"

echo "==> Compilando $SKETCH_NAME"
arduino-cli compile --fqbn "$FQBN" --build-path "$BUILD_DIR" "$ROOT_DIR"

echo "==> Resolviendo herramientas del core ESP32"
PROPS="$(arduino-cli compile --fqbn "$FQBN" --show-properties=expanded "$ROOT_DIR")"

prop() {
  local key="$1"
  printf '%s\n' "$PROPS" | awk -F= -v key="$key" '$1 == key { print substr($0, index($0, "=") + 1); exit }'
}

ESPTOOL_DIR="$(prop runtime.tools.esptool_py.path)"
MKLITTLEFS_DIR="$(prop runtime.tools.mklittlefs.path)"
PLATFORM_DIR="$(prop runtime.platform.path)"
FLASH_SIZE="$(prop build.flash_size)"
BOOTLOADER_ADDR="$(prop build.bootloader_addr)"
CHIP="$(prop build.mcu)"

ESPTOOL="$ESPTOOL_DIR/esptool"
MKLITTLEFS="$MKLITTLEFS_DIR/mklittlefs"
BOOT_APP0="$PLATFORM_DIR/tools/partitions/boot_app0.bin"
APP_BIN="$BUILD_DIR/$SKETCH_NAME.bin"
BOOT_BIN="$BUILD_DIR/$SKETCH_NAME.bootloader.bin"
PART_BIN="$BUILD_DIR/$SKETCH_NAME.partitions.bin"
LFS_BIN="$BUILD_DIR/littlefs.bin"
MERGED_BIN="$BUILD_DIR/$SKETCH_NAME.merged.bin"
BUILD_PARTITIONS="$BUILD_DIR/partitions.csv"

for path in "$ESPTOOL" "$MKLITTLEFS" "$BOOT_APP0" "$APP_BIN" "$BOOT_BIN" "$PART_BIN" "$BUILD_PARTITIONS"; do
  if [[ ! -f "$path" ]]; then
    echo "Falta el archivo requerido: $path" >&2
    exit 1
  fi
done

read -r LFS_OFFSET LFS_SIZE < <(
  awk -F, '$1 ~ /^[[:space:]]*spiffs[[:space:]]*$/ {
    gsub(/[[:space:]]/, "", $4);
    gsub(/[[:space:]]/, "", $5);
    print $4, $5;
    exit
  }' "$BUILD_PARTITIONS"
)

if [[ -z "${LFS_OFFSET:-}" || -z "${LFS_SIZE:-}" ]]; then
  echo "No fue posible obtener la particion spiffs desde $BUILD_PARTITIONS" >&2
  exit 1
fi

echo "==> Empaquetando LittleFS desde $DATA_DIR"
"$MKLITTLEFS" -c "$DATA_DIR" -b 4096 -p 256 -s "$LFS_SIZE" "$LFS_BIN"

echo "==> Generando binario merged para Wokwi"
"$ESPTOOL" --chip "$CHIP" merge-bin -o "$MERGED_BIN" \
  --pad-to-size "$FLASH_SIZE" \
  --flash-mode keep \
  --flash-freq keep \
  --flash-size keep \
  "$BOOTLOADER_ADDR" "$BOOT_BIN" \
  0x8000 "$PART_BIN" \
  0xe000 "$BOOT_APP0" \
  0x10000 "$APP_BIN" \
  "$LFS_OFFSET" "$LFS_BIN"

echo "==> Listo"
echo "   LittleFS : $LFS_BIN"
echo "   Wokwi    : $MERGED_BIN"
