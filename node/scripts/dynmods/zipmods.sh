#!/bin/bash
#
# Creates zips of modules from mods/ and writes them to dist/mods/zip/.
# Optional argument: a single directory name under mods/.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

SOURCE_DIR="${PROJECT_DIR}/mods"
TARGET_DIR="${PROJECT_DIR}/dist/mods/zip"

SOURCE_DIRS=("$SOURCE_DIR"/*)
if [ "$#" -gt 0 ]; then
  if [ "$#" -ne 1 ] || [[ ! "$1" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_-]*$ ]]; then
    echo "Usage: zipmods.sh [mod-directory]" >&2
    exit 1
  fi
  if [ ! -d "$SOURCE_DIR/$1" ]; then
    echo "Module directory not found: mods/$1" >&2
    exit 1
  fi
  SOURCE_DIRS=("$SOURCE_DIR/$1")
fi

mkdir -p "$TARGET_DIR"

for dir in "${SOURCE_DIRS[@]}"; do
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

    # keep arcade image for metadata extraction before removing web assets
    if [ -f "$TMP_DIR/web/img/arcade/arcade.jpg" ]; then
      mv -f "$TMP_DIR/web/img/arcade/arcade.jpg" "$TMP_DIR/arcade.jpg"
    fi

    # remove unnecessary directories/files
    rm -rf "$TMP_DIR/license"
    rm -rf "$TMP_DIR/build"
    rm -rf "$TMP_DIR/web"
    rm -rf "$TMP_DIR/.DS_Store"

    # create zip
    (
      cd "$TARGET_DIR"
      node - "$dirname" <<'NODE'
const fs = require('fs');
const archiver = require('archiver');
const { pipeline } = require('stream/promises');

async function createZip() {
  const dirname = process.argv[2];
  const archive = archiver('zip');
  archive.on('warning', (err) => archive.destroy(err));
  const output = pipeline(archive, fs.createWriteStream(`${dirname}.zip`));
  // The compiler uses the root directory entry to locate the module entrypoint.
  archive.append('', { name: `${dirname}/` });
  archive.directory(dirname, dirname);
  await Promise.all([output, archive.finalize()]);
}

createZip().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
NODE
    )

    # remove staging directory
    rm -rf "$TMP_DIR"

  fi
done

echo "Done copying directories."
