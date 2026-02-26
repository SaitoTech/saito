#!/bin/bash
#
# Creates zips of modules from mods/ and writes them to dist/mods/zip/.
# Used to prepare modules for dynamic compilation (strips license, build, web, etc.).
# Safe to run from any directory: project root is resolved from this script's location.
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
SOURCE_DIR="${PROJECT_DIR}/mods"
TARGET_DIR="${PROJECT_DIR}/dist/mods/zip"

mkdir -p "$TARGET_DIR"

for dir in "$SOURCE_DIR"/*; do
  if [ -d "$dir" ]; then
    dirname=$(basename "$dir")
    echo "Copying $dirname..."
    cp -r "$dir" "$TARGET_DIR/$dirname"
    rm -rf "$TARGET_DIR/$dirname/license"
    rm -rf "$TARGET_DIR/$dirname/build"
    rm -rf "$TARGET_DIR/$dirname/web"
    rm -rf "$TARGET_DIR/$dirname/.DS_Store"
    (cd "$TARGET_DIR" && zip -r "$dirname.zip" "$dirname" > /dev/null)
    rm -rf "$TARGET_DIR/$dirname"
  fi
done

echo "Done copying directories."
