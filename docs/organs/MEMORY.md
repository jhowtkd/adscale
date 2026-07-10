# Memory — Organ Deep Dive

> Character-level map of ADScale recalled brand & campaign context.  
> Parent atlas: [`../COGNITIVE-ATLAS.md`](../COGNITIVE-ATLAS.md) · ADR: [`../adr/0012-cognitive-atlas.md`](../adr/0012-cognitive-atlas.md)  
> Upstream: [`NERVE.md`](./NERVE.md) · Peer: [`TASTE.md`](./TASTE.md) · Downstream: [`HANDS.md`](./HANDS.md), [`CORTEX.md`](./CORTEX.md)  
> Code home: `app/src/server/memory/` · Atlas name: **Memory**  
> Version: **v0.1** · 2026-07-10

---

## 1. What Memory is

Memory **recalls** what the brand and campaign already lived — approvals, rejections, references, learnings — and returns an **auxiliary** prompt block for Hands (and a soft context block for Cortex). It does not judge art (Gaze), does not mint typed rules (Taste), and is not the source of truth for Nerve events.

| Layer | Path |
|-------|------|
| Mem0 client / feature flag | `mem0-client.ts` |
| Brand event types + sanitize | `brand-memory-events.ts` |
| Brand dispatch (Inngest) | `brand-memory-dispatch.ts` |
| Brand ingest | `brand-memory-ingest.ts` |
| Brand retrieve → prompt | `brand-memory-context.ts` |
| Campaign memory (Postgres) | `campaign-memory.ts`, `campaign-memory-context.ts` |
| Nerve projection | `output-learning-projection.ts` |
| Performance projection | `performance-learning-projection.ts` (+ retrieval helper) |
| Job | `app/src/server/jobs/brand-memory.ts` |

**Thesis:** Memory is auxiliary. It must not override literal CTA, source image, target format, campaign constraints, or generation mode. If Mem0 is off, the body continues without the brand block.

---

## 2. Two layers

| Layer | Store | Scope | Nature |
|-------|-------|-------|--------|
| **Brand Memory** | Mem0 (vector) | workspace (+ client profile user id) | Episodes / facts / projected learnings |
| **Campaign Memory** | Postgres `campaigns.campaignMemory` | One campaign | Short, deterministic entries (~24 max) |

Hands read **both** in `derivationJob` (`fetch-brand-memory` + `fetch-campaign-memory`).  
Cortex sensory cortex reads brand memory via `context-builder.ts`.

---

## 3. Feature flag & identity

`isBrandMemoryEnabled()` → `MEM0_ENABLED === "true"` **and** `MEM0_API_KEY` set.

User id: `{MEM0_USER_PREFIX|adscale_workspace}_{workspaceId}[_{clientProfileId}]`

Optional org/project ids from env. Client is lazy-singleton; tests can `resetBrandMemoryClientForTests()`.

---

## 4. Brand Memory — write path

### Event types (`BrandMemoryEventType`)

`brand_profile_created_or_updated` · `campaign_created_or_updated` · `creative_approved` · `creative_rejected` · `creative_saved_as_reference` · `creative_qa_completed` · `persona_test_completed` · `delivery_prepared`

### Dispatch

```text
recordBrandMemoryEvent(event)
  → if disabled: { status: "disabled" }
  → inngest.send({ name: "brand-memory.ingest", data: event })
  → best-effort (warn on failure; does not throw to caller path ideally)
```

Job: `brandMemoryIngestJob` → `ingestBrandMemoryEvent`.

### Ingest

```text
prepareBrandMemoryEvent (sanitize payload, strip secrets, bound depth/size)
  → client.add([{ role: "user", content }], { user_id, metadata, infer: false })
```

Metadata carries `eventType`, workspace, optional client/campaign/derivation.  
`infer: false` — ADScale controls content shape; Mem0 should not freely invent memories from raw chat.

### Sanitize

`sanitizeBrandMemoryPayload` drops keys matching secret patterns (`apiKey`, `password`, `accessToken`, …), truncates deep trees and long strings.

---

## 5. Brand Memory — read path

`getBrandMemoryContext(input)`:

```text
if no Mem0 client → { items: [], block: "" }
ensure scope user id
buildBrandMemorySearchQuery (client, product, offer, audience, mode, format, CTA…)
client.search(query, { user_id, limit ~8, optional clientProfile metadata filter })
map → BrandMemoryItem { text, source, createdAt?, relevance? }
buildBrandMemoryPromptBlock → top 6 unique lines
```

Prompt header:

```text
BRAND MEMORY / LEARNED CONTEXT:
- …
These learned patterns are auxiliary context only. They must not override…
```

Item `source` today: mostly `fact` vs `episode` (episode when metadata has `eventType`).

---

## 6. Campaign Memory

Types: `approved_cta` · `rejected_output` · `text_rule` · `regeneration_feedback`

```text
recordCampaignMemoryEntry(campaignId, workspaceId, entry)
  → append (cap MAX_ENTRIES = 24) → update campaigns.campaignMemory

getCampaignMemoryPromptBlock → buildCampaignMemoryPromptBlock
```

Written from review / regenerate / derivation job paths (and some Cortex quick handlers).  
More immediate and deterministic than Mem0 — survives Mem0-off.

---

## 7. Projections (other organs write here)

| Origin | Mem0 `memoryType` | Module |
|--------|-------------------|--------|
| **Nerve** (`client_output_learnings`) | `output_learning` | `output-learning-projection.ts` |
| **Muscle** (performance learnings) | `performance_learning` | `performance-learning-projection.ts` |

Projection upserts content + metadata; `removed` / `superseded` → delete Mem0 id and clear local pointer.

**Important:** Nerve’s canonical store remains Postgres. Recommendations must **not** treat Mem0 as authority ([`NERVE.md`](./NERVE.md) SAFE-02). Memory is recall for prompts / search, not the learning ledger.

---

## 8. Who wakes Memory (write call sites)

Representative:

| Caller | What |
|--------|------|
| Campaign create/update API | brand profile / campaign events |
| Review API | brand + campaign entries on approve/reject |
| QA / persona / delivery routes | brand episodes |
| Cortex handlers | persona simulate, quick regen campaign memory |
| Hands job | may record campaign memory after gate/retry paths |
| Nerve recompute | `projectOutputLearnings` |
| Performance learning recompute | `projectPerformanceLearnings` |

Ingestion doorway for visual brand assets: `brand-training/` + `jobs/brand-training.ts` — not this organ; approved training becomes events / identity elsewhere that Memory may later recall.

---

## 9. Who reads Memory

| Reader | How |
|--------|-----|
| **Hands** | `getBrandMemoryContext` + `getCampaignMemoryPromptBlock` in derivation job → prompt-builder |
| **Cortex** | `buildAssistantContext` includes brand memory block (allowlisted) |
| Performance tools | `performance-learning-retrieval.ts` search helpers |

Prompt stack position (Hands): after Gaze / Taste / corpus — **Memory is soft context**, not hard constraint.

---

## 10. Nerves

| Direction | Organ | How |
|-----------|-------|-----|
| In ← Nerve | output learning projection | Mem0 |
| In ← Human / APIs | brand events + campaign entries | dispatch / Postgres |
| In ← Muscle | performance learning projection | Mem0 (limb) |
| Out → Hands | brand + campaign prompt blocks | derivation job |
| Out → Cortex | brand memory in assistant context | context-builder |
| Peer Taste | separate; Taste = typed rules | do not conflate |

---

## 11. Memory vs Taste vs Nerve

| | **Memory** | **Taste** | **Nerve** |
|--|------------|-----------|-----------|
| Form | Text / vectors | Approved rules | Decision events → learnings |
| Gate | `MEM0_ENABLED` | evidenceLevel + approve | best-effort capture |
| Prompt force | Soft | Explicit constraints | Prefill (guarded) |
| Canonical for decisions? | No | No | **Yes** (Postgres events) |
| Mem0 off | Body continues | Unaffected | Learnings still in Postgres |

---

## 12. Safety invariants

1. **Auxiliary-only disclaimer** on brand prompt block.  
2. **Secrets stripped** before Mem0 add.  
3. **Best-effort ingest** — generation/review should not hard-fail on Mem0 outage.  
4. **Disabled = empty context**, not an error.  
5. **Campaign memory capped** (~24) to avoid unbounded prompt growth.  
6. **Brand block capped** (search ~8, prompt top 6 unique).  
7. **Projections sync deletes** on superseded/removed learnings.  
8. Never promote Mem0 hits to recommendation authority over approved Postgres learnings.

---

## 13. What Memory is not

- Not Cortex conversation state (threads/messages are separate)  
- Not Taste rule lifecycle  
- Not Gaze / Skin  
- Not Marrow corpus  
- Not brand-training analysis motor (doorway only)  
- Not source of truth for output decisions

---

## 14. File cheat sheet (start here)

| Priority | File | Why |
|----------|------|-----|
| 1 | `brand-memory-context.ts` | What Hands/Cortex read |
| 2 | `brand-memory-dispatch.ts` | Write entry (queue) |
| 3 | `brand-memory-ingest.ts` | Mem0 add |
| 4 | `brand-memory-events.ts` | Types, sanitize, search query |
| 5 | `mem0-client.ts` | Flag + user id |
| 6 | `campaign-memory.ts` + `campaign-memory-context.ts` | Local layer |
| 7 | `output-learning-projection.ts` | Nerve → Mem0 |
| 8 | `jobs/brand-memory.ts` | Inngest worker |

---

## 15. Maintenance

1. New brand episode type → extend `BrandMemoryEventType` + call sites + this doc.  
2. New campaign entry type → `CampaignMemoryEntryType` + writers + prompt builder.  
3. Changing Mem0 schema/metadata → keep search filters and projection `memoryType` in sync.  
4. Do not move Nerve canonical storage into Mem0.  
5. Keep Hands prompt order: Gaze → Taste → corpus → **Memory** → contract…
