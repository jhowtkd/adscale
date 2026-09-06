#!/usr/bin/env bash
# Idempotent Cloud Agent start phase for ADScale — runs on every boot.
# Brings up the local Postgres service, ensures the role/database exist, and
# applies pending Drizzle migrations. Returns once the database is ready; the
# Next.js dev server runs separately as the "app-dev" terminal.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

DB_USER="adscale"
DB_PASS="adscale123"
DB_NAME="adscale_db"

echo "[start] Starting PostgreSQL cluster..."
sudo pg_ctlcluster 16 main start 2>/dev/null || true

echo "[start] Waiting for PostgreSQL to accept connections..."
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then
    break
  fi
  sleep 1
done

echo "[start] Ensuring role and database exist..."
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}' CREATEDB;"
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
fi
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};" >/dev/null

echo "[start] Applying database migrations..."
cd "$REPO_ROOT/app"
export DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}?sslmode=disable"
npm run db:migrate

echo "[start] Database ready."
