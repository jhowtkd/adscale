# Phase 179 User Setup

**Status:** Incomplete

## MiniMax API

| Variable | Source | Required |
|----------|--------|----------|
| `MINIMAX_API_KEY` | MiniMax Platform → API Keys | Yes (production) |
| `MINIMAX_MODEL` | Optional override; default `MiniMax-M3` | No |

Add to `app/.env`:

```bash
MINIMAX_API_KEY="your-key-here"
MINIMAX_MODEL="MiniMax-M3"
```

## Verification

```bash
cd app && npx vitest run --config config/vitest.config.ts src/server/assistant/model
```

Live streaming requires a valid `MINIMAX_API_KEY` in the deployment environment.
