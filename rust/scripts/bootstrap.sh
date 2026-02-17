#!/usr/bin/env bash

set -euo pipefail

echo "Detecting operating system..."

OS="$(uname -s)"

case "$OS" in
    Darwin)
        echo "macOS detected."
        SCRIPT="bootstrap_mac.sh"
        ;;
    Linux)
        echo "Linux detected."
        SCRIPT="bootstrap_linux.sh"
        ;;
    *)
        echo "Unsupported operating system: $OS"
        exit 1
        ;;
esac

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$SCRIPT"

if [ ! -f "$SCRIPT_PATH" ]; then
    echo "Bootstrap script not found: $SCRIPT_PATH"
    exit 1
fi

echo "Running $SCRIPT..."
exec "$SCRIPT_PATH"


