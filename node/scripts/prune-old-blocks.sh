#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLOCK_DIR="$(dirname "$SCRIPT_DIR")/data/blocks"
DAYS=14
DELETE=false

usage() {
    cat <<'EOF'
Usage: scripts/prune-old-blocks.sh [OPTIONS] [BLOCK_DIR]

Remove block files whose filename timestamp is older than the cutoff.
The timestamp must be Unix time in milliseconds at the start of the name:
    1784551269569-<hash>.sai

Options:
    --days DAYS   Set the maximum age in days (default: 14)
    --delete      Delete matching files (default: dry run)
    -h, --help    Show this help

Examples:
    scripts/prune-old-blocks.sh
    scripts/prune-old-blocks.sh --delete
    scripts/prune-old-blocks.sh --days 30 --delete /path/to/blocks
EOF
}

while (($# > 0)); do
    case "$1" in
        --days)
            if (($# < 2)); then
                echo "Error: --days requires a value" >&2
                exit 2
            fi
            DAYS="$2"
            shift 2
            ;;
        --delete)
            DELETE=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        -* )
            echo "Error: unknown option: $1" >&2
            usage >&2
            exit 2
            ;;
        *)
            BLOCK_DIR="$1"
            shift
            if (($# > 0)); then
                echo "Error: only one block directory may be specified" >&2
                exit 2
            fi
            ;;
    esac
done

if [[ ! "$DAYS" =~ ^[0-9]+$ ]] || ((DAYS < 1)); then
    echo "Error: --days must be a positive whole number" >&2
    exit 2
fi

if [[ ! -d "$BLOCK_DIR" ]]; then
    echo "Error: block directory does not exist: $BLOCK_DIR" >&2
    exit 1
fi

now_ms=$(( $(date +%s) * 1000 ))
cutoff_ms=$(( now_ms - DAYS * 24 * 60 * 60 * 1000 ))
matched=0
ignored=0

while IFS= read -r -d '' file; do
    filename="${file##*/}"

    if [[ "$filename" =~ ^([0-9]+)-.+\.sai$ ]]; then
        timestamp_ms="${BASH_REMATCH[1]}"

        # 10# forces decimal interpretation if a timestamp has leading zeroes.
        if ((10#$timestamp_ms < cutoff_ms)); then
            ((matched += 1))
            if [[ "$DELETE" == true ]]; then
                printf 'Deleting %s\n' "$file"
                rm -- "$file"
            else
                printf 'Would delete %s\n' "$file"
            fi
        fi
    else
        ((ignored += 1))
    fi
done < <(find "$BLOCK_DIR" -maxdepth 1 -type f -name '*.sai' -print0)

if [[ "$DELETE" == true ]]; then
    printf 'Deleted %d block file(s) older than %d days.\n' "$matched" "$DAYS"
else
    printf 'Dry run: %d block file(s) are older than %d days. Re-run with --delete to remove them.\n' "$matched" "$DAYS"
fi

if ((ignored > 0)); then
    printf 'Ignored %d .sai file(s) without a valid timestamp prefix.\n' "$ignored"
fi
