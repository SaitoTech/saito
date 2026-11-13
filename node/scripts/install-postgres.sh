#!/usr/bin/env bash

set -euo pipefail

usage() {
    cat <<'EOF'
Usage: sudo bash scripts/install-postgres.sh

Install PostgreSQL on Arch Linux, initialize /var/lib/postgres/data if needed,
enable/start postgresql.service, and create or update a login superuser.

Defaults:
    Username: admin
    Password: password
    Database: postgres
    Address:  127.0.0.1:5432 (new installations listen on localhost only)

Override credentials with environment variables passed through sudo:
    sudo POSTGRES_ADMIN_USER=myadmin POSTGRES_ADMIN_PASSWORD='my-password' \
        bash scripts/install-postgres.sh

Rerunning preserves databases and existing configuration, but resets the chosen
role's password and grants it LOGIN, SUPERUSER, CREATEDB, and CREATEROLE.
Existing installations must use Arch's standard data directory, port 5432,
and allow the postgres OS user to connect through the local Unix socket.
Packages already installed are not upgraded. Package installation uses the
current pacman package database; maintain/update the OS separately as needed.

Connect afterwards (enter the configured password when prompted):
    psql -h 127.0.0.1 -U admin -d postgres -W

References:
    https://wiki.archlinux.org/title/PostgreSQL
    https://www.postgresql.org/docs/current/app-initdb.html
    https://www.postgresql.org/docs/current/app-psql.html
EOF
}

fail() {
    echo "Error: $*" >&2
    exit 1
}

if [[ $# -eq 1 && ( $1 == --help || $1 == -h ) ]]; then
    usage
    exit 0
fi
[[ $# -eq 0 ]] || fail "Unexpected arguments. Use --help for usage."
[[ $EUID -eq 0 ]] || fail "Run this script with sudo or as root."

# shellcheck source=/dev/null
source /etc/os-release
[[ ${ID:-} == arch ]] || fail "This installer supports Arch Linux only."
[[ -d /run/systemd/system ]] || fail "A running systemd instance is required."

export POSTGRES_ADMIN_USER="${POSTGRES_ADMIN_USER-admin}"
export POSTGRES_ADMIN_PASSWORD="${POSTGRES_ADMIN_PASSWORD-password}"
[[ $POSTGRES_ADMIN_USER =~ ^[a-z_][a-z0-9_]{0,62}$ ]] ||
    fail "Use a username of 1-63 lowercase letters, digits, or underscores, starting with a letter or underscore."
[[ $POSTGRES_ADMIN_USER != postgres && $POSTGRES_ADMIN_USER != pg_* ]] ||
    fail "Choose a username other than postgres or the reserved pg_ prefix."
[[ -n $POSTGRES_ADMIN_PASSWORD ]] || fail "The password cannot be empty."

if ! pacman -Q postgresql >/dev/null 2>&1; then
    pacman -S --needed --noconfirm postgresql
fi

data_dir=/var/lib/postgres/data
if [[ -f $data_dir/PG_VERSION ]]; then
    installed_version=$(postgres --version)
    installed_version=${installed_version##* }
    [[ $(cat "$data_dir/PG_VERSION") == "${installed_version%%.*}" ]] ||
        fail "Existing cluster needs a PostgreSQL major-version upgrade; it has been left intact."
else
    # initdb refuses a nonempty directory, protecting an incomplete/existing cluster.
    install -d -m 700 -o postgres -g postgres "$data_dir"
    runuser -u postgres -- initdb -D "$data_dir" --encoding=UTF8 --locale=C.UTF-8 \
        --auth-local=peer --auth-host=scram-sha-256
fi

systemctl enable --now postgresql.service

# Clear inherited libpq settings so administrative SQL targets the local server.
# psql quotes variables as SQL literals/identifiers; credentials are not placed
# in command-line arguments or interpolated into shell-generated SQL.
unset PGSERVICE PGSERVICEFILE PGOPTIONS PGPASSWORD
export PGCONNECT_TIMEOUT=10
runuser -u postgres -- psql -X -w -h /run/postgresql -p 5432 -U postgres \
    -d postgres -v ON_ERROR_STOP=1 <<'SQL'
\getenv admin_user POSTGRES_ADMIN_USER
\getenv admin_password POSTGRES_ADMIN_PASSWORD
BEGIN;
SET LOCAL password_encryption = 'scram-sha-256';
SELECT format('CREATE ROLE %I', :'admin_user')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'admin_user')
\gexec
ALTER ROLE :"admin_user" WITH LOGIN SUPERUSER CREATEDB CREATEROLE
    PASSWORD :'admin_password' VALID UNTIL 'infinity';
COMMIT;
SQL

# Verify the credentials and privileges over TCP, using the same path as clients.
verified=$(PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" psql -X -w -h 127.0.0.1 -p 5432 \
    -U "$POSTGRES_ADMIN_USER" -d postgres -At -v ON_ERROR_STOP=1 \
    -c 'SELECT rolsuper AND rolcanlogin AND rolcreatedb AND rolcreaterole FROM pg_roles WHERE rolname = current_user')
[[ $verified == t ]] || fail "Superuser verification failed."

printf '\nPostgreSQL is ready at 127.0.0.1:5432; superuser: %s; database: postgres.\n' "$POSTGRES_ADMIN_USER"
printf 'Connect: psql -h 127.0.0.1 -U %s -d postgres -W\n' "$POSTGRES_ADMIN_USER"
