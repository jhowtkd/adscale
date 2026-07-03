# Real-time Notifications (SSE) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace derivation polling with Inngest Realtime v4 streaming for instant status updates.

**Architecture:** Update Inngest SDK to v4, define a `derivation:{id}` realtime channel with `status` topic, publish status changes from the derivation job, mint subscription tokens via Server Action, and sync incoming messages to TanStack Query cache via `useRealtime` hook.

**Tech Stack:** Next.js 16, React 19, TanStack Query, Inngest v4, Drizzle ORM

---

## Context You Need

**Existing files to study:**
- `app/package.json` — Inngest v3.54.0
- `app/src/server/jobs/client.ts` — Inngest client initialization
- `app/src/app/api/inngest/route.ts` — Inngest serve handler
- `app/src/server/jobs/derivation.ts` — derivation job (1317 lines)
- `app/src/lib/hooks/use-derivations.ts` — polling hook
- `app/src/app/(dashboard)/campaigns/[id]/page.tsx` — campaign page

**Design doc:** `docs/plans/2026-05-23-realtime-notifications-sse-design.md`

**Inngest v4 Realtime docs:** https://www.inngest.com/docs/features/realtime

---

### Task 1: Update Inngest to v4

**Files:**
- Modify: `app/package.json`
- Modify: `app/package-lock.json` (auto-generated)

**Step 1: Update package.json**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npm install inngest@latest
```

**Step 2: Verify tests still pass**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run --config config/vitest.config.ts src/server/jobs/derivation.test.ts
```
Expected: PASS

**Step 3: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add app/package.json app/package-lock.json && git commit -m "chore: upgrade inngest from v3.54 to v4.4"
```

---

### Task 2: Update Inngest Client and Serve for v4

**Files:**
- Modify: `app/src/server/jobs/client.ts`
- Modify: `app/src/app/api/inngest/route.ts`

**Step 1: Read current files**

```bash
cat app/src/server/jobs/client.ts
cat app/src/app/api/inngest/route.ts
```

**Step 2: Update client.ts**

Inngest v4 client initialization is the same API:

```typescript
import { Inngest } from "inngest";
import { env } from "../validation/env";

export const inngest = new Inngest({
  id: "adscale",
  eventKey: env.INNGEST_EVENT_KEY,
});
```

No changes needed if the API is the same. Verify by checking the v4 docs.

**Step 3: Update route.ts**

Inngest v4 `serve` API:

```typescript
import { serve } from "inngest/next";
import { inngest } from "@/server/jobs/client";
import { derivationJob } from "@/server/jobs/derivation";
import { trialNotificationJob } from "@/server/jobs/trial-notifications";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [derivationJob, trialNotificationJob],
});
```

Likely no changes needed. Verify build.

**Step 4: Verify build**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx tsc --noEmit src/server/jobs/client.ts src/app/api/inngest/route.ts
```

**Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add -A && git commit -m "feat(realtime): verify inngest v4 compatibility"
```

---

### Task 3: Create Realtime Channel

**Files:**
- Create: `app/src/server/jobs/channels.ts`

**Step 1: Implement**

```typescript
import { realtime } from "inngest";
import { z } from "zod";

export const derivationChannel = realtime.channel({
  name: ({ derivationId }: { derivationId: string }) => `derivation:${derivationId}`,
  topics: {
    status: {
      schema: z.object({
        derivationId: z.string(),
        status: z.enum(["queued", "processing", "generating", "completed", "failed"]),
        outputKey: z.string().nullable().optional(),
        imageUrl: z.string().nullable().optional(),
        updatedAt: z.string(),
      }),
    },
  },
});
```

**Step 2: Verify**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx tsc --noEmit src/server/jobs/channels.ts
```

**Step 3: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add src/server/jobs/channels.ts && git commit -m "feat(realtime): add derivation realtime channel"
```

---

### Task 4: Publish Status from Derivation Job

**Files:**
- Modify: `app/src/server/jobs/derivation.ts`

**Step 1: Read current job**

```bash
cat app/src/server/jobs/derivation.ts
```

**Step 2: Add publish calls**

Import the channel:

```typescript
import { derivationChannel } from "./channels";
```

Add publish calls at status transition points inside the `async ({ event, step }) => { ... }` function:

1. After `check-idempotency` step (if not skipped):
```typescript
await step.realtime.publish("status-queued",
  derivationChannel({ derivationId }).status,
  { derivationId, status: "queued", updatedAt: new Date().toISOString() }
);
```

2. After `mark-processing` step:
```typescript
await step.realtime.publish("status-processing",
  derivationChannel({ derivationId }).status,
  { derivationId, status: "processing", updatedAt: new Date().toISOString() }
);
```

3. Before image generation:
```typescript
await step.realtime.publish("status-generating",
  derivationChannel({ derivationId }).status,
  { derivationId, status: "generating", updatedAt: new Date().toISOString() }
);
```

4. After `mark-completed` step:
```typescript
await step.realtime.publish("status-completed",
  derivationChannel({ derivationId }).status,
  { derivationId, status: "completed", outputKey, imageUrl, updatedAt: new Date().toISOString() }
);
```

5. In `onFailure`:
```typescript
await inngest.realtime.publish(
  derivationChannel({ derivationId }).status,
  { derivationId, status: "failed", updatedAt: new Date().toISOString() }
);
```

**Note:** Use `step.realtime.publish()` for durable, memoized publishes inside steps. Use `inngest.realtime.publish()` for non-durable publishes outside steps (like in `onFailure`).

**Step 3: Verify**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx tsc --noEmit src/server/jobs/derivation.ts
```

**Step 4: Run derivation job tests**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run --config config/vitest.config.ts src/server/jobs/derivation.test.ts
```

**Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add src/server/jobs/derivation.ts && git commit -m "feat(realtime): publish derivation status updates from job"
```

---

### Task 5: Create Server Action for Token Minting

**Files:**
- Create: `app/src/app/actions/realtime.ts`

**Step 1: Implement**

```typescript
"use server";

import { getClientSubscriptionToken } from "inngest/react";
import { inngest } from "@/server/jobs/client";
import { derivationChannel } from "@/server/jobs/channels";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getDerivationById } from "@/server/repositories/derivation";

export async function getDerivationRealtimeToken(derivationId: string) {
  // Verify workspace access
  const { workspace } = await requireWorkspaceAccess(new Request("http://localhost"));
  
  // Verify derivation belongs to workspace
  const derivation = await getDerivationById(derivationId, workspace.id);
  if (!derivation) {
    throw new Error("Derivation not found");
  }

  return getClientSubscriptionToken(inngest, {
    channel: derivationChannel({ derivationId }),
    topics: ["status"],
  });
}
```

**Note:** `requireWorkspaceAccess` expects a `Request` object. In a Server Action context, we may need a different approach. Check how other server actions handle auth in this codebase.

**Step 2: Verify**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx tsc --noEmit src/app/actions/realtime.ts
```

**Step 3: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add src/app/actions/realtime.ts && git commit -m "feat(realtime): add server action for derivation subscription tokens"
```

---

### Task 6: Create useDerivationRealtime Hook

**Files:**
- Create: `app/src/lib/hooks/use-derivation-realtime.ts`

**Step 1: Implement**

```typescript
"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRealtime } from "inngest/react";
import { derivationChannel } from "@/server/jobs/channels";
import { getDerivationRealtimeToken } from "@/app/actions/realtime";

export function useDerivationRealtime(derivationId: string, campaignId: string) {
  const queryClient = useQueryClient();
  const channel = derivationChannel({ derivationId });

  const { connectionStatus, messages } = useRealtime({
    channel,
    topics: ["status"],
    token: () => getDerivationRealtimeToken(derivationId),
    enabled: !!derivationId,
  });

  // Sync incoming messages to TanStack Query cache
  useEffect(() => {
    const statusMsg = messages.byTopic.status?.data;
    if (!statusMsg) return;

    // Update the derivations list cache
    queryClient.setQueryData<unknown[]>(
      ["derivations", campaignId],
      (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((d: any) =>
          d.id === statusMsg.derivationId
            ? {
                ...d,
                status: statusMsg.status,
                imageUrl: statusMsg.imageUrl ?? d.imageUrl,
                outputKey: statusMsg.outputKey ?? d.outputKey,
                updatedAt: statusMsg.updatedAt,
              }
            : d
        );
      }
    );

    // Also invalidate to trigger background refetch for complete data
    queryClient.invalidateQueries({
      queryKey: ["derivations", campaignId],
    });
  }, [messages, queryClient, campaignId, derivationId]);

  return { connectionStatus };
}
```

**Step 2: Verify**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx tsc --noEmit src/lib/hooks/use-derivation-realtime.ts
```

**Step 3: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add src/lib/hooks/use-derivation-realtime.ts && git commit -m "feat(realtime): add useDerivationRealtime hook with cache sync"
```

---

### Task 7: Integrate into Campaign Page

**Files:**
- Modify: `app/src/app/(dashboard)/campaigns/[id]/page.tsx`

**Step 1: Read current file**

```bash
cat app/src/app/(dashboard)/campaigns/[id]/page.tsx
```

**Step 2: Add hook import**

```typescript
import { useDerivationRealtime } from "@/lib/hooks/use-derivation-realtime";
```

**Step 3: Add real-time subscriptions**

In the page component, after `allDerivations` is computed, subscribe to active derivations:

```typescript
// Subscribe to real-time updates for active derivations
const activeDerivationIds = allDerivations
  .filter((d) => ["queued", "processing", "generating"].includes(d.status))
  .map((d) => d.id);

activeDerivationIds.forEach((id) => {
  useDerivationRealtime(id, campaignId);
});
```

**Step 4: Reduce polling frequency**

Modify `useDerivations` call or hook to reduce polling when real-time is active. If `useDerivations` uses a fixed interval, increase it to 30s as a fallback:

```typescript
// In use-derivations.ts or at call site:
const { data: derivationsData } = useDerivations(campaignId, {
  refetchInterval: 30000, // fallback polling every 30s
});
```

**Step 5: Verify**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx tsc --noEmit src/app/\(dashboard\)/campaigns/\[id\]/page.tsx
```

**Step 6: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add src/app/\(dashboard\)/campaigns/\[id\]/page.tsx && git commit -m "feat(realtime): integrate derivation realtime into campaign page"
```

---

### Task 8: Run Full Test Suite + Build

**Step 1: Run tests**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npx vitest run --config config/vitest.config.ts
```
Expected: All tests pass

**Step 2: Run build**

```bash
cd /Users/jhonatan/Repos/ADScale_2/app && npm run build
```
Expected: Build succeeds

**Step 3: Commit final**

```bash
cd /Users/jhonatan/Repos/ADScale_2 && git add -A && git commit -m "v6.2: Real-time Notifications — Inngest Realtime v4 replaces derivation polling"
```

---

## Summary of Changes

| File | Action | Purpose |
|------|--------|---------|
| `package.json` / `package-lock.json` | Modify | Inngest v3.54 → v4.4 |
| `src/server/jobs/client.ts` | Verify | Inngest v4 client (no changes expected) |
| `src/app/api/inngest/route.ts` | Verify | Inngest v4 serve (no changes expected) |
| `src/server/jobs/channels.ts` | Create | Realtime channel definition |
| `src/server/jobs/derivation.ts` | Modify | Publish status at each transition |
| `src/app/actions/realtime.ts` | Create | Server Action for subscription tokens |
| `src/lib/hooks/use-derivation-realtime.ts` | Create | Hook wrapping `useRealtime` + cache sync |
| `src/app/(dashboard)/campaigns/[id]/page.tsx` | Modify | Wire real-time subscriptions |
| `src/lib/hooks/use-derivations.ts` | Modify | Reduce polling interval to 30s fallback |

---

**Plan saved to:** `docs/plans/2026-05-23-realtime-notifications-sse.md`

**Two execution options:**

**1. Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

Which approach?
