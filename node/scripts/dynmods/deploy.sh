#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SAITO_DIR="$PROJECT_ROOT/dist/mods/saito"

if [[ ! -d "$SAITO_DIR" ]]; then
  echo "Error: $SAITO_DIR does not exist. Run npm run .saito first."
  exit 1
fi

rsync -avP "$SAITO_DIR/" mods@mods.saito.io:/var/www/html/mods/
