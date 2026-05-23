#!/bin/bash
# Script de verificação para problemas medium/low da auditoria

cd "$(dirname "$0")/.."

COUNT=0

# M1: NEXT_PUBLIC_APP_URL no client
if grep -rq "NEXT_PUBLIC_APP_URL" src/lib/ src/components/ --include="*.ts" --include="*.tsx" 2>/dev/null; then
  COUNT=$((COUNT + 1))
fi

# M2: Uploads sem magic bytes validation
if ! grep -rq "magic\|file-type\|mmmagic" src/ --include="*.ts" 2>/dev/null; then
  # Se não existe nenhuma lib de magic bytes, conta como problema
  COUNT=$((COUNT + 1))
fi

# M3: console.error esquecido
if grep -rq "console\.\(log\|error\|warn\)" src/components/ src/lib/ --include="*.tsx" --include="*.ts" 2>/dev/null | grep -vq "logger\."; then
  COUNT=$((COUNT + 1))
fi

# M4: require("react") proibido
if grep -rq 'require("react")' src/ --include="*.ts" --include="*.tsx" 2>/dev/null; then
  COUNT=$((COUNT + 1))
fi

# M5: ESLint errors
ESLINT_ERRORS=$(npx eslint --quiet src/ 2>/dev/null | grep -c "error" || echo "0")
if [ "$ESLINT_ERRORS" -gt 10 ]; then
  COUNT=$((COUNT + 1))
fi

# M6: setState em useEffect
SETSTATE_EFFECT=$(grep -r "setState.*useEffect\|useEffect.*setState" src/ --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
if [ "$SETSTATE_EFFECT" -gt 0 ]; then
  COUNT=$((COUNT + 1))
fi

# M7: Imports não usados (simplificado - verifica se há imports comuns não usados)
# Este é complexo de detectar via shell, vamos usar um proxy
UNUSED_IMPORTS=$(grep -r "^import.*from" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
if [ "$UNUSED_IMPORTS" -gt 200 ]; then
  COUNT=$((COUNT + 1))
fi

# M8: Variáveis/params não usados (detecta _ prefix ausente)
UNUSED_VARS=$(grep -rn "^_" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')

# M9: Variáveis não usadas no export.ts (do audit)
if grep -rq "unused\|_batch" src/app/api/exports/ --include="*.ts" 2>/dev/null; then
  COUNT=$((COUNT + 1))
fi

echo "$COUNT"
