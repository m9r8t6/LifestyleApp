#!/usr/bin/env bash
# Runs ON the server (deploy.sh pipes it over SSH). Safe to run repeatedly.
# Creates the database, a dedicated database user and the .env entries.
set -euo pipefail

cd "${HOME}/ai-backend"
mkdir -p cron/lifestyle backups/lifestyle
ENV_FILE=.env
DB_NAME=lifestyle_db
DB_USER=lifestyle
PG="docker exec shared_postgres_db psql -v ON_ERROR_STOP=1 -U postgres"

if ! grep -q '^LIFESTYLE_DB_PASS=' "$ENV_FILE"; then
    cp "$ENV_FILE" "$ENV_FILE.bak_lifestyle"
    {
        echo ""
        echo "#Lifestyle App (LifeOS)"
        echo "LIFESTYLE_DB_NAME=${DB_NAME}"
        echo "LIFESTYLE_DB_USER=${DB_USER}"
        echo "LIFESTYLE_DB_PASS=$(openssl rand -hex 24)"
    } >> "$ENV_FILE"
    echo "Added LIFESTYLE_* entries to .env"
fi
DB_PASS="$(grep -E '^LIFESTYLE_DB_PASS=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"

if [ "$($PG -Atc "SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}'")" != "1" ]; then
    $PG -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}'" >/dev/null
    echo "Created database user ${DB_USER}"
else
    $PG -c "ALTER ROLE ${DB_USER} PASSWORD '${DB_PASS}'" >/dev/null
fi

if [ "$($PG -Atc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'")" != "1" ]; then
    $PG -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}" >/dev/null
    $PG -c "REVOKE ALL ON DATABASE ${DB_NAME} FROM PUBLIC" >/dev/null
    echo "Created database ${DB_NAME}"
fi
