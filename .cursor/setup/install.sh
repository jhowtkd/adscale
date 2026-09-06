#!/usr/bin/env bash
# Idempotent Cloud Agent install phase for ADScale.
# Prepares durable, source-derived state after checkout:
#   1. PostgreSQL 16 server binaries (system dependency)
#   2. app/ Node dependencies (npm ci against the lockfile)
#   3. app/.env.local generated from the committed template (git-ignored)
# Per-boot runtime work (starting Postgres, migrations) lives in start.sh.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "[install] Ensuring PostgreSQL 16 is installed..."
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib
else
  echo "[install] PostgreSQL already present; skipping apt install."
fi

echo "[install] Installing app dependencies (npm ci)..."
cd "$REPO_ROOT/app"
npm ci

echo "[install] Ensuring app/.env.local exists..."
if [ ! -f "$REPO_ROOT/app/.env.local" ]; then
  cp "$REPO_ROOT/.cursor/setup/env.local.template" "$REPO_ROOT/app/.env.local"
  echo "[install] Wrote app/.env.local from template."
else
  echo "[install] app/.env.local already exists; leaving it unchanged."
fi

echo "[install] Done."
