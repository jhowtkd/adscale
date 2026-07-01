#!/bin/bash
# Script de verificação para o autoresearch de correção de auditoria
# Conta problemas críticos/high restantes

cd "$(dirname "$0")/.."

COUNT=0

# C1: Webhook sem auth
if [ -f src/app/api/notifications/webhook/route.ts ]; then
  if ! grep -q "x-webhook-signature\|WEBHOOK_SECRET\|api-key\|authorization" src/app/api/notifications/webhook/route.ts 2>/dev/null; then
    COUNT=$((COUNT + 1))
  fi
fi

# C2: BriefingStep.tsx > 1000 linhas
if [ -f src/components/workspace/BriefingStep.tsx ]; then
  LINES=$(wc -l < src/components/workspace/BriefingStep.tsx | tr -d ' ')
  if [ "$LINES" -gt 1000 ]; then
    COUNT=$((COUNT + 1))
  fi
fi

# C3: getCampaigns sem paginação
if grep -q "getCampaigns" src/server/repositories/campaign.ts 2>/dev/null; then
  if ! grep -q "\.limit\|\.offset" src/server/repositories/campaign.ts 2>/dev/null; then
    COUNT=$((COUNT + 1))
  fi
fi

# C4: Cache presigned URLs sem limite (Map simples)
if [ -f src/server/storage/r2-object-storage.ts ]; then
  if grep -q "new Map()" src/server/storage/r2-object-storage.ts 2>/dev/null; then
    # Map simples = unbounded. Só falha se não houver limite (maxSize) próximo.
    if ! grep -q "maxSize" src/server/storage/r2-object-storage.ts 2>/dev/null; then
      COUNT=$((COUNT + 1))
    fi
  fi
fi

# C5: ReactQueryDevtools em produção
if [ -f src/components/providers/QueryProvider.tsx ]; then
  if grep -q "ReactQueryDevtools" src/components/providers/QueryProvider.tsx 2>/dev/null; then
    if ! grep -q "NODE_ENV.*development\|process.env.NODE_ENV" src/components/providers/QueryProvider.tsx 2>/dev/null; then
      COUNT=$((COUNT + 1))
    fi
  fi
fi

# C6: Polling agressivo
if [ -f src/lib/hooks/use-derivations.ts ]; then
  if grep -q "refetchInterval.*2000" src/lib/hooks/use-derivations.ts 2>/dev/null; then
    COUNT=$((COUNT + 1))
  fi
fi

# H1: Headers de segurança ausentes
if [ -f next.config.ts ]; then
  if ! grep -q "Content-Security-Policy\|X-Frame-Options" next.config.ts 2>/dev/null; then
    COUNT=$((COUNT + 1))
  fi
fi

# H2: Rate limit fail open
if [ -f src/lib/rate-limit.ts ]; then
  if grep -q "success: true" src/lib/rate-limit.ts 2>/dev/null; then
    COUNT=$((COUNT + 1))
  fi
fi

# H3: getOpenAI recriado em múltiplos arquivos
OPENAI_COUNT=$(grep -r "new OpenAI" src/server/ai/ --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
if [ "$OPENAI_COUNT" -gt 2 ]; then
  COUNT=$((COUNT + 1))
fi

# H4: ALLOWED_TYPES duplicado
ALLOWED_COUNT=$(grep -r "ALLOWED_TYPES" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v ".test." | wc -l | tr -d ' ')
if [ "$ALLOWED_COUNT" -gt 3 ]; then
  COUNT=$((COUNT + 1))
fi

# H5: as assertions em AI
AS_COUNT=$(grep -r "as unknown as" src/server/ai/ --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
if [ "$AS_COUNT" -gt 0 ]; then
  COUNT=$((COUNT + 1))
fi

# H6: Non-null assertions em derivation job
if [ -f src/server/jobs/derivation.ts ]; then
  NONNULL_COUNT=$(grep -o "\!\." src/server/jobs/derivation.ts 2>/dev/null | wc -l | tr -d ' ')
  if [ "$NONNULL_COUNT" -gt 0 ]; then
    COUNT=$((COUNT + 1))
  fi
fi

echo "$COUNT"
