# Real-time Notifications (SSE) — Design Doc

> **Status:** Approved  
> **Scope:** Replace derivation polling with Inngest Realtime v4 streaming for live status updates.

---

## 1. Goal

Eliminate the 3s→5s→10s progressive polling of `useDerivations` and replace it with push-based real-time updates via Inngest Realtime. When a derivation status changes (queued → processing → completed/failed), the client receives the update instantly without polling.

---

## 2. Current State

- **Polling**: `useDerivations` polls every 3s with progressive backoff to 10s
- **Status lifecycle**: `queued` → `processing` → `completed` / `failed` → `approved` / `rejected`
- **Job updates**: Inngest job updates derivation status at `check-idempotency`, `mark-processing`, `generate-and-store-output`, `mark-completed`, and `onFailure`
- **Push mechanism**: None. Client relies 100% on polling.

---

## 3. Architecture: Inngest Realtime v4

### Overview

```
┌──────────────┐     subscribe      ┌─────────────────────┐
│   Client     │ ◄───────────────── │  Inngest Realtime   │
│ (useRealtime)│   (token + WS/SSE) │  (managed stream)   │
└──────────────┘                    └─────────────────────┘
        ▲                                    ▲
        │                                    │ publish
        │                            ┌───────┴───────────┐
        │                            │  Inngest Function │
        │                            │  (derivationJob)  │
        │                            │  • step.run()     │
        │                            │  • step.publish() │
        │                            └───────────────────┘
        │
        └──────────── token via Server Action ────────────┘
```

### Components

1. **Inngest Client** (v4) — updated from v3.54
2. **Realtime Channel** — `derivation:{derivationId}` with `status` topic
3. **Server Action** — `getDerivationRealtimeToken` to mint subscription tokens
4. **Custom Hook** — `useDerivationRealtime` wrapping `useRealtime` + TanStack Query cache sync
5. **Job Updates** — `step.realtime.publish()` calls in `derivationJob`

---

## 4. Data Contract

### Channel Schema

```typescript
// src/server/jobs/channels.ts
import { realtime } from "inngest";
import { z } from "zod";

export const derivationChannel = realtime.channel({
  name: ({ derivationId }: { derivationId: string }) => `derivation:${derivationId}`,
  topics: {
    status: {
      schema: z.object({
        derivationId: z.string(),
        status: z.enum(["queued", "processing", "generating", "completed", "failed"]),
        outputKey: z.string().nullable(),
        imageUrl: z.string().nullable(),
        updatedAt: z.string(),
      }),
    },
  },
});
```

### Status Events Published

| Step | Status | Payload |
|------|--------|---------|
| `check-idempotency` | `queued` (initial) | `{ status: "queued" }` |
| `mark-processing` | `processing` | `{ status: "processing" }` |
| `generate-and-store-output` | `generating` | `{ status: "generating" }` |
| `mark-completed` | `completed` | `{ status: "completed", outputKey, imageUrl }` |
| `onFailure` | `failed` | `{ status: "failed" }` |

---

## 5. Client Integration

### Hook: useDerivationRealtime

```typescript
"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRealtime } from "inngest/react";
import { derivationChannel } from "@/server/jobs/channels";
import { getDerivationRealtimeToken } from "@/app/actions/realtime";

export function useDerivationRealtime(derivationId: string) {
  const queryClient = useQueryClient();
  const channel = derivationChannel({ derivationId });

  const { connectionStatus, messages } = useRealtime({
    channel,
    topics: ["status"],
    token: () => getDerivationRealtimeToken(derivationId),
  });

  // Sync incoming messages to TanStack Query cache
  useEffect(() => {
    const statusMsg = messages.byTopic.status?.data;
    if (!statusMsg) return;

    // Update the derivations list cache
    queryClient.setQueryData<Derivation[]>(
      ["derivations", statusMsg.campaignId],
      (old) => {
        if (!old) return old;
        return old.map((d) =>
          d.id === statusMsg.derivationId
            ? { ...d, status: statusMsg.status, imageUrl: statusMsg.imageUrl ?? d.imageUrl, outputKey: statusMsg.outputKey ?? d.outputKey }
            : d
        );
      }
    );
  }, [messages, queryClient]);

  return { connectionStatus };
}
```

### Campaign Page Integration

In `campaigns/[id]/page.tsx`, call `useDerivationRealtime` for each active derivation:

```typescript
// In the campaign page component:
const activeDerivationIds = allDerivations
  .filter((d) => ["queued", "processing", "generating"].includes(d.status))
  .map((d) => d.id);

// Subscribe to real-time updates for all active derivations
activeDerivationIds.forEach((id) => {
  useDerivationRealtime(id);
});
```

Or use a single hook that subscribes to multiple derivations:

```typescript
export function useCampaignRealtime(campaignId: string, derivationIds: string[]) {
  // Subscribe to all active derivations
  derivationIds.forEach((id) => useDerivationRealtime(id));
}
```

---

## 6. Backward Compatibility

- **Polling fallback**: Keep `useDerivations` with `refetchInterval` as fallback if real-time connection fails
- **Graceful degradation**: If `useRealtime` fails (e.g., token error), the client falls back to polling automatically
- **No breaking changes**: The derivation list API remains unchanged; real-time is an additive enhancement

---

## 7. Performance

- **Before**: ~20-30 polling requests per minute per campaign
- **After**: 1 WebSocket/SSE connection per active derivation + push events only on status change
- **Vercel impact**: Reduced function invocations, lower bandwidth

---

## 8. Security

- **Tokens**: Subscription tokens are minted server-side via Server Action, scoped to a specific derivation
- **Workspace isolation**: Tokens only allow subscribing to derivations in the user's workspace
- **No sensitive data**: Status events only contain public derivation data (status, imageUrl)

---

## 9. Error Handling

| Scenario | Behavior |
|----------|----------|
| Token expired | `useRealtime` reconnects with fresh token |
| Connection lost | Auto-reconnect with exponential backoff |
| Derivation not found | Token minting fails, falls back to polling |
| Inngest Realtime unavailable | Falls back to polling |

---

## 10. Files to Touch

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Update `inngest` to `^4.4.0` |
| `src/server/jobs/client.ts` | Modify | Update client initialization for v4 |
| `src/server/jobs/channels.ts` | **Create** | Realtime channel definition |
| `src/server/jobs/derivation.ts` | Modify | Add `step.realtime.publish()` calls |
| `src/app/actions/realtime.ts` | **Create** | Server Action to mint tokens |
| `src/lib/hooks/use-derivation-realtime.ts` | **Create** | Hook wrapping `useRealtime` + cache sync |
| `src/lib/hooks/use-derivations.ts` | Modify | Reduce polling when real-time is active |
| `src/app/(dashboard)/campaigns/[id]/page.tsx` | Modify | Wire real-time hook |
| `src/app/api/inngest/route.ts` | Modify | Update `serve` for v4 |

---

*Design approved. Next: invoke `writing-plans` skill for implementation.*
