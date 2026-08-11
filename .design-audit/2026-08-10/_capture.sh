#!/bin/bash
# Usage: _capture.sh <output_path> [selector] [format] [quality] [session]
# Kimi WebBridge v1.11.5+ returns a path directly, we just copy it.
# Default session: adscale-audit. Override via 5th arg or SESSION env.

set -euo pipefail
OUT="$1"
SELECTOR="${2:-}"
FORMAT="${3:-png}"
QUALITY="${4:-}"
SESSION="${5:-${SESSION:-adscale-audit}}"

ARGS=$(python3 -c "
import json
a = {'format': '$FORMAT'}
if '$SELECTOR': a['selector'] = '$SELECTOR'
if '$QUALITY': a['quality'] = int('$QUALITY')
print(json.dumps(a))
")

mkdir -p "$(dirname "$OUT")"

PATH_REMOTE=$(curl -s -X POST http://127.0.0.1:10086/command \
  -H 'Content-Type: application/json' \
  -d "{\"action\":\"screenshot\",\"args\":$ARGS,\"session\":\"$SESSION\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['path'])")

cp "$PATH_REMOTE" "$OUT"
SIZE=$(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT")
echo "saved: $OUT ($SIZE bytes, source: $PATH_REMOTE)"
