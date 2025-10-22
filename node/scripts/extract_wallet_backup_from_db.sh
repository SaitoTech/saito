#!/usr/bin/env bash

if [ $# -ne 2 ]; then
  echo "Usage: $0 <path-to-db> <publickey>"
  exit 1
fi

DB="$1"
PUB="$2"

sqlite3 -batch -separator $'\t' "$DB" \
  "SELECT id, tx FROM recovery WHERE publickey='$PUB';" |
while IFS=$'\t' read -r id txjson; do
  ct=$(printf '%s' "$txjson" \
      | jq -r '.m' \
      | base64 -d \
      | jq -r '.wallet')

  printf '%s' "$ct" | base64 -d > "${PUB}-${id}-wallet-backup.aes" 2>/dev/null \
    || printf '%s' "$ct" > "${PUB}-${id}-wallet-backup.aes"

  echo "wrote ${PUB}-${id}-wallet-backup.aes"
done
