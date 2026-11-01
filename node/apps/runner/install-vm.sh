#!/usr/bin/env bash
# Ubuntu/Debian. Standalone installer; run as root or a user with sudo access.
set -euo pipefail

runner_privilege=()
if [[ $EUID -ne 0 ]]; then
  runner_privilege=(sudo)
fi

runner_checkout=/opt/saito
runner_branch=2610/game-runner
runner_repo=https://github.com/SaitoTech/saito.git

# System dependencies, including tools needed to build native npm packages.
"${runner_privilege[@]}" apt-get update
"${runner_privilege[@]}" apt-get install -y ca-certificates curl gnupg git build-essential python3 pkg-config libssl-dev libsqlite3-dev

# Clone the requested branch, or safely update an existing matching checkout.
if [[ ! -e "$runner_checkout" ]]; then
  "${runner_privilege[@]}" install -d -o "$(id -u)" -g "$(id -g)" "$runner_checkout"
  git clone --branch "$runner_branch" --single-branch "$runner_repo" "$runner_checkout"
elif [[ -d "$runner_checkout/.git" ]]; then
  if [[ "$(git -C "$runner_checkout" branch --show-current)" != "$runner_branch" ]]; then
    echo "$runner_checkout is not on $runner_branch; stopping without switching branches." >&2
    exit 1
  fi
  case "$(git -C "$runner_checkout" remote get-url origin)" in
    https://github.com/SaitoTech/saito.git|git@github.com:SaitoTech/saito.git) ;;
    *) echo "$runner_checkout has an unexpected origin; stopping." >&2; exit 1 ;;
  esac
  git -C "$runner_checkout" pull --ff-only origin "$runner_branch"
elif [[ -d "$runner_checkout" && -z "$(ls -A "$runner_checkout")" ]]; then
  git clone --branch "$runner_branch" --single-branch "$runner_repo" "$runner_checkout"
else
  echo "$runner_checkout already exists and is not a Saito checkout or an empty directory." >&2
  exit 1
fi
cd "$runner_checkout/node"

# Node.js 22 from NodeSource.
runner_setup="$(mktemp)"
trap 'rm -f -- "$runner_setup"' EXIT
curl -fsSL https://deb.nodesource.com/setup_22.x -o "$runner_setup"
"${runner_privilege[@]}" bash "$runner_setup"
"${runner_privilege[@]}" apt-get install -y nodejs

# CLI tools and the project's locked dependencies. ts-node needs dev dependencies.
"${runner_privilege[@]}" npm install -g pm2 @openai/codex
npm ci --include=dev --no-audit --no-fund

# The headless runtime imports this metadata even without a browser build.
mkdir -p dist
if [[ ! -f dist/build.json ]]; then
  node -e 'require("fs").writeFileSync("dist/build.json", JSON.stringify({build_number: Date.now()}), {flag: "wx"})'
fi

# Preserve existing configuration.
if [[ ! -f daemon.json ]]; then
  cp apps/runner/daemon.example.json daemon.json
fi

cat <<'NEXT'

Installed in /opt/saito. Run these commands:

  cd /opt/saito/node
  codex login --device-auth
  # Review daemon.json, then:
  npm run runner -- doctor ./daemon.json
  pm2 start apps/runner/index.ts --name saito-runner --interpreter ./node_modules/.bin/ts-node --interpreter-args="--transpile-only --project config/build/tsconfig.json" --kill-timeout 30000 --restart-delay 30000 -- daemon ./daemon.json
  pm2 save
  pm2 startup

If `pm2 startup` prints a further command, run it to enable startup after reboot.
View logs with: pm2 logs saito-runner
NEXT
