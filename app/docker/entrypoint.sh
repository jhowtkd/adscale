#!/bin/sh
set -e

echo "⏳ Aguardando PostgreSQL ficar disponível..."
while ! nc -z postgres 5432; do
  sleep 1
done
echo "✅ PostgreSQL disponível"

echo "🔄 Rodando migrações do banco..."
npx drizzle-kit migrate

echo "🚀 Iniciando aplicação..."
exec node server.js
