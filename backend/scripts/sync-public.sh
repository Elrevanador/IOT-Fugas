#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$BACKEND_DIR/.." && pwd)"
SOURCE_DIR="$ROOT_DIR/frontend"
TARGET_DIR="$BACKEND_DIR/public"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "No se encontro la carpeta frontend en $SOURCE_DIR. Se omite la sincronizacion."
  exit 0
fi

mkdir -p "$TARGET_DIR"
find "$TARGET_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +

shopt -s dotglob nullglob
for item in "$SOURCE_DIR"/*; do
  name="$(basename "$item")"
  case "$name" in
    .env*|node_modules|package.json|package-lock.json|dist|scripts)
      continue
      ;;
  esac

  cp -R "$item" "$TARGET_DIR"/
done

echo "UI sincronizada desde $SOURCE_DIR hacia $TARGET_DIR"
