#!/bin/bash
#
# Creates zips of modules from mods/ and writes them to dist/mods/zip/.
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

    TMP_DIR="$TARGET_DIR/$dirname"

    # remove any previous staging directory
    rm -rf "$TMP_DIR"

    # recreate staging directory
    mkdir -p "$TMP_DIR"

    # copy module contents (including hidden files)
    cp -R "$dir"/. "$TMP_DIR/"

    # remove unnecessary directories/files
    rm -rf "$TMP_DIR/license"
    rm -rf "$TMP_DIR/build"
    rm -rf "$TMP_DIR/web"
    rm -rf "$TMP_DIR/.DS_Store"

    # create zip
    (
      cd "$TARGET_DIR"
      zip -r "$dirname.zip" "$dirname" > /dev/null
    )

    # remove staging directory
    rm -rf "$TMP_DIR"

  fi
done

echo "Done copying directories."

