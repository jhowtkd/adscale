# Studio Entry Interview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the progressive Studio first screen, ask only missing chips from the active brand’s last works, write the request into the existing textarea, and keep protocol selection explicit without calling `selectIntent` until the user advances.

**Architecture:** Pure gap detection and request template run on the client. A brand-scoped GET projects sourced facts. A POST redacts one sentence (template fallback, existing `ai` rate limit, no credits). Presentation is gated by `STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT` on the same workspace bucket as the progressive Studio. Pedido and Protocol stay on `useCreativeComposer`.

**Tech Stack:** Next.js App Router, React, TypeScript, Zod, Drizzle, TanStack Query, OpenAI `chat.completions` via `getOpenAI()`, Vitest, Testing Library, existing beta-analytics `z.strictObject` allowlist.

**Spec:** `docs/superpowers/specs/2026-09-01-studio-entry-suggestions-design.md` (PR #311)

## File map

| File | Responsibility |
| --- | --- |
| `app/src/lib/studio/entry-types.ts` | Shared facts, chips, protocol ids |
| `app/src/lib/studio/entry-catalog.ts` | Generic chip catalogs + labels |
| `app/src/lib/studio/entry-request-template.ts` | Deterministic sentence |
| `app/src/lib/studio/detect-entry-gaps.ts` | Max 3 chips, no I/O |
| `app/src/server/creative-work/entry-facts.ts` | Consensus + sourced/inferred-high rules |
| `app/src/server/repositories/creative-work.ts` | `listCreativeWorksForEntryContext` |
| `app/src/server/repositories/campaign.ts` | `listCampaignsForEntryContext` |
| `app/src/server/application/get-studio-entry-context.ts` | GET use-case |
| `app/src/server/application/synthesize-studio-entry-request.ts` | POST use-case |
| `app/src/app/api/creative-work/entry-context/route.ts` | GET |
| `app/src/app/api/creative-work/entry-request/route.ts` | POST |
| `app/src/lib/hooks/use-studio-entry-context.ts` | TanStack Query for GET |
| `app/src/lib/hooks/use-studio-entry-interview.ts` | Chips, debounce, rewrite, telemetry |
| `app/src/components/creative-work/StudioEntryInterview.tsx` | Chip buttons |
| `app/src/components/dashboard/DashboardHomeActions.tsx` | Wire interview; hide objectives while protocol chip pending |
| `app/src/components/creative-work/CreativeToolCards.tsx` | Suggested (not pressed) protocol |
| `app/src/server/studio-rollout.ts` | `isStudioEntryInterviewEnabled` |
| `app/src/server/beta-analytics/types.ts` | New event keys + property keys |
| `app/src/app/(dashboard)/page.tsx` | Pass `entryInterviewEnabled` |
| `docs/runbooks/studio-entry-interview-rollout.md` | Percent, sample, rollback |

Do not modify `CreativeComposer.tsx` control layout, assistant, variations directions, Mem0, prepare, settlement, or `listCanonicalWorks`.

## Global Constraints

- Spec PR #311 is authoritative. Do not call `selectIntent` from a protocol chip click.
- Hide progressive `CreativeToolCards` while a protocol chip is pending (`hasEntry` writing the textarea must not reveal them).
- `inferredBriefing` is a fact only when `state === "sourced"`, or `state === "inferred"` and `confidence === "high"`. `briefingOverrides` win.
- Query by `clientProfileId` in the repository with `LIMIT 8`. Do not load the workspace list and filter in memory.
- `sanitizeBetaEventProperties` is `z.strictObject`: new event keys go in `STUDIO_BETA_EVENT_KEYS`; new properties go in `ALLOWED_PROPERTY_KEYS`. Use `requestSource`, never `source`.
- Redaction does not debit credits. Reuse `checkRateLimit(..., { category: "ai", workspaceId })` (5/min). Debounce client POSTs; one in-flight AbortController; no automatic retry.
- Default `STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT` to `0`. Do not raise it in this implementation.
- Interview UI only when `rolloutVariant === "progressive"` and `entryInterviewEnabled`. Control Studio stays unchanged.
- `social_post` never becomes a protocol option. `carousel` is omitted from facts and candidates unless `carouselEnabled`.
- Preserve unrelated git files. Stage only the files named in the active task. After source changes run `graphify update .` from the repo root before the source commit; do not stage unrelated graph files.
- Run tests from `app/` with `npm test -- <path>`.

## Execution map

```text
Task 1 catalogs + template + detectEntryGaps
  └─ Task 2 entry-facts projection
       └─ Task 3 brand-scoped repository reads
            └─ Task 4 GET entry-context
                 ├─ Task 5 POST entry-request
                 ├─ Task 6 beta-analytics allowlist
                 └─ Task 7 rollout flag + page prop
                      └─ Task 8 interview hook
                           └─ Task 9 progressive entry UI
                                └─ Task 10 suggested tool cards
                                     └─ Task 11 rollout runbook
```

---

### Task 1: Catalogs, template, and gap detector

**Files:**
- Create: `app/src/lib/studio/entry-types.ts`
- Create: `app/src/lib/studio/entry-catalog.ts`
- Create: `app/src/lib/studio/entry-request-template.ts`
- Create: `app/src/lib/studio/entry-request-template.test.ts`
- Create: `app/src/lib/studio/detect-entry-gaps.ts`
- Create: `app/src/lib/studio/detect-entry-gaps.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `EntryFacts`, `EntryContext`, `EntryChip`, `detectEntryGaps()`, `formatEntryRequestTemplate()`, catalogs

- [ ] **Step 1: Write failing tests**

Create `app/src/lib/studio/detect-entry-gaps.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { detectEntryGaps } from "./detect-entry-gaps";
import type { EntryContext } from "./entry-types";

const emptyFacts = {
  protocol: null,
  offer: null,
  audience: null,
  tone: null,
  protocolCandidates: [],
  offerCandidates: [],
  audienceCandidates: [],
  toneCandidates: [],
  workCount: 0,
} satisfies EntryContext;

describe("detectEntryGaps", () => {
  it("returns generic protocol+offer+audience when workCount is 0", () => {
    const chips = detectEntryGaps({
      context: emptyFacts,
      request: "",
      hasAttachment: false,
      carouselEnabled: false,
    });
    expect(chips.map((chip) => chip.slot)).toEqual(["protocol", "offer", "audience"]);
    expect(chips[0]?.options).toEqual(["single", "variations", "format_adaptation", "restyle"]);
  });

  it("includes carousel in the generic protocol catalog when enabled", () => {
    const chips = detectEntryGaps({
      context: emptyFacts,
      request: "",
      hasAttachment: false,
      carouselEnabled: true,
    });
    expect(chips[0]?.options).toContain("carousel");
  });

  it("omits the protocol chip when every work shares single", () => {
    const chips = detectEntryGaps({
      context: {
        ...emptyFacts,
        workCount: 3,
        protocol: "single",
        offer: "imersão NR-1",
        tone: "institucional",
      },
      request: "",
      hasAttachment: false,
      carouselEnabled: false,
    });
    expect(chips.some((chip) => chip.slot === "protocol")).toBe(false);
    expect(chips.length).toBeLessThanOrEqual(3);
  });

  it("lists mixed protocols as chip options and drops social_post", () => {
    const chips = detectEntryGaps({
      context: {
        ...emptyFacts,
        workCount: 2,
        protocolCandidates: ["single", "variations"],
      },
      request: "",
      hasAttachment: false,
      carouselEnabled: false,
    });
    const protocol = chips.find((chip) => chip.slot === "protocol");
    expect(protocol?.options).toEqual(["single", "variations"]);
  });

  it("does not treat carousel as a fact or option when the gate is off", () => {
    const chips = detectEntryGaps({
      context: {
        ...emptyFacts,
        workCount: 2,
        protocol: "carousel",
        protocolCandidates: ["carousel", "single"],
      },
      request: "",
      hasAttachment: false,
      carouselEnabled: false,
    });
    const protocol = chips.find((chip) => chip.slot === "protocol");
    expect(protocol?.options).not.toContain("carousel");
    expect(chips.every((chip) => chip.slot !== "protocol" || chip.options.includes("single"))).toBe(true);
  });

  it("hides audience when the request already names a candidate", () => {
    const chips = detectEntryGaps({
      context: {
        ...emptyFacts,
        workCount: 2,
        protocol: "single",
        audienceCandidates: ["dentistas"],
      },
      request: "Peça para dentistas",
      hasAttachment: false,
      carouselEnabled: false,
    });
    expect(chips.some((chip) => chip.slot === "audience")).toBe(false);
  });

  it("does not close offer because an attachment exists", () => {
    const chips = detectEntryGaps({
      context: {
        ...emptyFacts,
        workCount: 2,
        protocol: "single",
      },
      request: "",
      hasAttachment: true,
      carouselEnabled: false,
    });
    expect(chips.some((chip) => chip.slot === "offer")).toBe(true);
  });

  it("caps chips at three and only then considers tone", () => {
    const chips = detectEntryGaps({
      context: {
        ...emptyFacts,
        workCount: 4,
        protocolCandidates: ["single", "restyle"],
        offerCandidates: ["A", "B"],
        audienceCandidates: ["X", "Y"],
        toneCandidates: ["direto"],
      },
      request: "",
      hasAttachment: false,
      carouselEnabled: false,
    });
    expect(chips).toHaveLength(3);
    expect(chips.map((chip) => chip.slot)).toEqual(["protocol", "offer", "audience"]);
  });
});
```

Create `app/src/lib/studio/entry-request-template.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatEntryRequestTemplate } from "./entry-request-template";

describe("formatEntryRequestTemplate", () => {
  it("omits null slots and uses localized protocol labels", () => {
    expect(formatEntryRequestTemplate({
      protocol: "single",
      offer: "imersão NR-1",
      audience: null,
      tone: "institucional",
    }, "pt-BR")).toBe("Peça única de imersão NR-1, tom institucional.");
  });

  it("returns empty string when every slot is empty", () => {
    expect(formatEntryRequestTemplate({
      protocol: null, offer: null, audience: null, tone: null,
    }, "pt-BR")).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm test -- src/lib/studio/detect-entry-gaps.test.ts src/lib/studio/entry-request-template.test.ts`

Expected: FAIL (modules not found)

- [ ] **Step 3: Implement**

`app/src/lib/studio/entry-types.ts`:

```ts
export const ENTRY_PROTOCOLS = [
  "single",
  "variations",
  "format_adaptation",
  "restyle",
  "carousel",
] as const;
export type EntryProtocol = (typeof ENTRY_PROTOCOLS)[number];

export const ENTRY_SLOTS = ["protocol", "offer", "audience", "tone"] as const;
export type EntrySlot = (typeof ENTRY_SLOTS)[number];

export type EntryFacts = {
  protocol: EntryProtocol | null;
  offer: string | null;
  audience: string | null;
  tone: string | null;
};

export type EntryContext = EntryFacts & {
  protocolCandidates: EntryProtocol[];
  offerCandidates: string[];
  audienceCandidates: string[];
  toneCandidates: string[];
  workCount: number;
};

export type EntryChip = {
  slot: EntrySlot;
  options: string[];
};

export type EntryLocale = "pt-BR" | "en";
```

`app/src/lib/studio/entry-catalog.ts`:

```ts
import { ENTRY_PROTOCOLS, type EntryLocale, type EntryProtocol } from "./entry-types";

export const GENERIC_OFFER_IDS = ["launch", "capture", "immersion", "promo"] as const;
export const GENERIC_AUDIENCE_IDS = ["new", "returning", "companies"] as const;

export function genericProtocolIds(carouselEnabled: boolean): EntryProtocol[] {
  const base: EntryProtocol[] = ["single", "variations", "format_adaptation", "restyle"];
  return carouselEnabled ? [...base, "carousel"] : base;
}

export function isEntryProtocol(value: string): value is EntryProtocol {
  return (ENTRY_PROTOCOLS as readonly string[]).includes(value);
}

export function filterProtocols(
  values: string[],
  carouselEnabled: boolean,
): EntryProtocol[] {
  return values.filter((value): value is EntryProtocol => {
    if (value === "social_post") return false;
    if (value === "carousel" && !carouselEnabled) return false;
    return isEntryProtocol(value);
  });
}

const PROTOCOL_LABELS: Record<EntryLocale, Record<EntryProtocol, string>> = {
  "pt-BR": {
    single: "Peça única",
    variations: "Variações",
    format_adaptation: "Adaptar formatos",
    restyle: "Mudar estilo",
    carousel: "Carrossel",
  },
  en: {
    single: "Single piece",
    variations: "Variations",
    format_adaptation: "Adapt formats",
    restyle: "Restyle",
    carousel: "Carousel",
  },
};

const OFFER_LABELS: Record<EntryLocale, Record<(typeof GENERIC_OFFER_IDS)[number], string>> = {
  "pt-BR": {
    launch: "Lançamento",
    capture: "Captação",
    immersion: "Turma/imersão",
    promo: "Promoção",
  },
  en: {
    launch: "Launch",
    capture: "Lead gen",
    immersion: "Cohort / immersion",
    promo: "Promotion",
  },
};

const AUDIENCE_LABELS: Record<EntryLocale, Record<(typeof GENERIC_AUDIENCE_IDS)[number], string>> = {
  "pt-BR": {
    new: "Quem ainda não conhece",
    returning: "Quem já comprou",
    companies: "Empresas / times",
  },
  en: {
    new: "People who don't know you yet",
    returning: "Past buyers",
    companies: "Companies / teams",
  },
};

export function labelEntryValue(slot: "protocol" | "offer" | "audience" | "tone", value: string, locale: EntryLocale): string {
  if (slot === "protocol" && isEntryProtocol(value)) return PROTOCOL_LABELS[locale][value];
  if (slot === "offer" && value in OFFER_LABELS[locale]) {
    return OFFER_LABELS[locale][value as keyof typeof OFFER_LABELS["pt-BR"]];
  }
  if (slot === "audience" && value in AUDIENCE_LABELS[locale]) {
    return AUDIENCE_LABELS[locale][value as keyof typeof AUDIENCE_LABELS["pt-BR"]];
  }
  return value;
}
```

`app/src/lib/studio/entry-request-template.ts`:

```ts
import { labelEntryValue } from "./entry-catalog";
import type { EntryFacts, EntryLocale } from "./entry-types";

export function formatEntryRequestTemplate(facts: EntryFacts, locale: EntryLocale): string {
  const protocol = facts.protocol ? labelEntryValue("protocol", facts.protocol, locale) : "";
  const offer = facts.offer ? labelEntryValue("offer", facts.offer, locale) : "";
  const audience = facts.audience ? labelEntryValue("audience", facts.audience, locale) : "";
  const tone = facts.tone ? labelEntryValue("tone", facts.tone, locale) : "";
  if (!protocol && !offer && !audience && !tone) return "";
  const head = protocol || (locale === "en" ? "Piece" : "Peça");
  const offerPart = offer ? (locale === "en" ? ` for ${offer}` : ` de ${offer}`) : "";
  const audiencePart = audience ? (locale === "en" ? ` to ${audience}` : ` para ${audience}`) : "";
  const tonePart = tone ? (locale === "en" ? `, ${tone} tone` : `, tom ${tone}`) : "";
  return `${head}${offerPart}${audiencePart}${tonePart}.`;
}
```

`app/src/lib/studio/detect-entry-gaps.ts`:

```ts
import {
  filterProtocols,
  GENERIC_AUDIENCE_IDS,
  GENERIC_OFFER_IDS,
  genericProtocolIds,
} from "./entry-catalog";
import type { EntryChip, EntryContext, EntryProtocol, EntrySlot } from "./entry-types";

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function requestCovers(request: string, values: Array<string | null | undefined>) {
  const haystack = normalize(request);
  if (!haystack) return false;
  return values.some((value) => {
    if (!value?.trim()) return false;
    return haystack.includes(normalize(value));
  });
}

export function detectEntryGaps(input: {
  context: EntryContext;
  request: string;
  hasAttachment: boolean;
  carouselEnabled: boolean;
}): EntryChip[] {
  void input.hasAttachment;
  const protocolCandidates = filterProtocols(
    input.context.protocol ? [input.context.protocol, ...input.context.protocolCandidates] : input.context.protocolCandidates,
    input.carouselEnabled,
  );
  const protocolFact: EntryProtocol | null = input.carouselEnabled
    ? input.context.protocol
    : input.context.protocol === "carousel"
      ? null
      : input.context.protocol;

  const uniqueProtocolOptions = Array.from(new Set(
    input.context.workCount === 0
      ? genericProtocolIds(input.carouselEnabled)
      : filterProtocols(input.context.protocolCandidates, input.carouselEnabled),
  ));

  const chips: EntryChip[] = [];
  const push = (slot: EntrySlot, options: string[]) => {
    if (chips.length >= 3 || options.length === 0) return;
    chips.push({ slot, options });
  };

  if (!protocolFact) {
    const options = uniqueProtocolOptions.length > 0
      ? uniqueProtocolOptions
      : genericProtocolIds(input.carouselEnabled);
    push("protocol", options);
  }

  const offerKnown = Boolean(input.context.offer) || requestCovers(input.request, [input.context.offer, ...input.context.offerCandidates]);
  if (!offerKnown) {
    push("offer", input.context.offerCandidates.length > 0 ? input.context.offerCandidates : [...GENERIC_OFFER_IDS]);
  }

  const audienceKnown = Boolean(input.context.audience) || requestCovers(input.request, [input.context.audience, ...input.context.audienceCandidates]);
  if (!audienceKnown) {
    push("audience", input.context.audienceCandidates.length > 0 ? input.context.audienceCandidates : [...GENERIC_AUDIENCE_IDS]);
  }

  const toneKnown = Boolean(input.context.tone) || requestCovers(input.request, [input.context.tone, ...input.context.toneCandidates]);
  if (!toneKnown && input.context.toneCandidates.length > 0) {
    push("tone", input.context.toneCandidates);
  }

  return chips;
}
```

Note: `hasAttachment` is accepted and ignored for briefing slots (spec: attachment never closes offer/audience/tone). Keep the parameter so the hook passes it and the test documents the rule.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm test -- src/lib/studio/detect-entry-gaps.test.ts src/lib/studio/entry-request-template.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
graphify update .
git add app/src/lib/studio/entry-types.ts app/src/lib/studio/entry-catalog.ts \
  app/src/lib/studio/entry-request-template.ts app/src/lib/studio/entry-request-template.test.ts \
  app/src/lib/studio/detect-entry-gaps.ts app/src/lib/studio/detect-entry-gaps.test.ts
git commit -m "feat: add Studio entry gap detector and request template"
```

---

### Task 2: Project sourced facts from history rows

**Files:**
- Create: `app/src/server/creative-work/entry-facts.ts`
- Create: `app/src/server/creative-work/entry-facts.test.ts`

**Interfaces:**
- Consumes: `EntryContext` / `EntryFacts` from Task 1; `InferredBriefing`, `CreativeWorkBriefingOverrides` from `app/src/server/creative-work/contracts.ts`
- Produces: `projectStudioEntryContext(rows, kit, carouselEnabled): EntryContext`

A **row** is a discriminated union the GET layer will build. This module stays pure.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { projectStudioEntryContext } from "./entry-facts";
import type { StudioEntryHistoryRow } from "./entry-facts";

const inferred = (
  value: string,
  state: "sourced" | "inferred" | "unknown",
  confidence?: "high" | "medium" | "low",
) => state === "unknown"
  ? { value: null, state }
  : state === "inferred"
    ? { value, state, confidence }
    : { value, state };

function work(partial: Partial<StudioEntryHistoryRow> & Pick<StudioEntryHistoryRow, "id" | "updatedAt">): StudioEntryHistoryRow {
  return {
    origin: "creative_work",
    toolKind: "single",
    offer: null,
    audience: null,
    tone: null,
    ...partial,
  };
}

describe("projectStudioEntryContext", () => {
  it("treats a single shared protocol as a fact", () => {
    const context = projectStudioEntryContext({
      rows: [
        work({ id: "a", updatedAt: new Date("2026-09-01"), toolKind: "single" }),
        work({ id: "b", updatedAt: new Date("2026-08-01"), toolKind: "single" }),
      ],
      kit: { toneOfVoice: null, toneNotes: null, description: null },
      carouselEnabled: false,
    });
    expect(context.workCount).toBe(2);
    expect(context.protocol).toBe("single");
  });

  it("drops social_post and does not copy carousel when the gate is off", () => {
    const context = projectStudioEntryContext({
      rows: [
        work({ id: "a", updatedAt: new Date("2026-09-01"), toolKind: "social_post" }),
        work({ id: "b", updatedAt: new Date("2026-08-01"), toolKind: "carousel" }),
      ],
      kit: { toneOfVoice: null, toneNotes: null, description: null },
      carouselEnabled: false,
    });
    expect(context.protocol).toBeNull();
    expect(context.protocolCandidates).toEqual([]);
  });

  it("keeps inferred medium offer as a candidate, not a fact", () => {
    const context = projectStudioEntryContext({
      rows: [
        work({
          id: "a",
          updatedAt: new Date("2026-09-01"),
          inferredOffer: inferred("Oferta mágica", "inferred", "medium"),
        }),
      ],
      kit: { toneOfVoice: null, toneNotes: null, description: null },
      carouselEnabled: false,
    });
    expect(context.offer).toBeNull();
    expect(context.offerCandidates).toContain("Oferta mágica");
  });

  it("accepts sourced offer and lets briefingOverrides win", () => {
    const context = projectStudioEntryContext({
      rows: [
        work({
          id: "a",
          updatedAt: new Date("2026-09-01"),
          inferredOffer: inferred("Prepare", "inferred", "high"),
          offerOverride: "Override do operador",
        }),
      ],
      kit: { toneOfVoice: null, toneNotes: null, description: null },
      carouselEnabled: false,
    });
    expect(context.offer).toBe("Override do operador");
  });

  it("reads campaign columns as sourced facts and ignores campaign protocol", () => {
    const context = projectStudioEntryContext({
      rows: [
        {
          origin: "campaign",
          id: "c1",
          updatedAt: new Date("2026-09-01"),
          toolKind: null,
          offer: "Matrículas",
          audience: "Gestores",
          tone: "Acolhedor",
        },
      ],
      kit: { toneOfVoice: null, toneNotes: null, description: null },
      carouselEnabled: false,
    });
    expect(context.protocol).toBeNull();
    expect(context.offer).toBe("Matrículas");
    expect(context.audience).toBe("Gestores");
    expect(context.tone).toBe("Acolhedor");
  });

  it("uses kit tone when works have none", () => {
    const context = projectStudioEntryContext({
      rows: [work({ id: "a", updatedAt: new Date("2026-09-01") })],
      kit: { toneOfVoice: "Direto", toneNotes: null, description: null },
      carouselEnabled: false,
    });
    expect(context.tone).toBe("Direto");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -- src/server/creative-work/entry-facts.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement `projectStudioEntryContext`**

Rules to encode in `app/src/server/creative-work/entry-facts.ts`:

- Window is the rows already capped at 8, newest first.
- `workCount = rows.length`.
- Protocol values: from `creative_work.toolKind` only, after `filterProtocols`.
- Protocol fact if `protocolValues.length >= 1` and every value is the same.
- Otherwise `protocolCandidates` = unique protocols.
- For offer/audience/tone on a work: override string if non-empty; else field from inferred briefing if `state === "sourced"` OR (`state === "inferred"` && `confidence === "high"`); else if the inferred field has a non-null value, push it as a candidate only.
- Campaign: `offer ?? product` as offer value (sourced). `audience` and `tone` columns sourced. No protocol.
- Majority fact: among rows that produced a non-empty value for that slot, if one value appears in more than half, it is the fact; unique values still become candidates.
- Kit `toneOfVoice` or `toneNotes` fills `facts.tone` when still null; kit `description` is an offer candidate, not a fact unless it is the only offer value in the window.

```ts
export type StudioEntryHistoryRow = {
  origin: "creative_work" | "campaign";
  id: string;
  updatedAt: Date;
  toolKind: string | null;
  offer?: string | null;
  audience?: string | null;
  tone?: string | null;
  inferredOffer?: { value: string | null; state: string; confidence?: string };
  inferredAudience?: { value: string | null; state: string; confidence?: string };
  inferredTone?: { value: string | null; state: string; confidence?: string };
  offerOverride?: string | null;
  audienceOverride?: string | null;
  toneOverride?: string | null;
};

export type StudioEntryKit = {
  toneOfVoice: string | null;
  toneNotes: string | null;
  description: string | null;
};

export function projectStudioEntryContext(input: {
  rows: StudioEntryHistoryRow[];
  kit: StudioEntryKit;
  carouselEnabled: boolean;
}): EntryContext
```

Implement majority as `count > values.length / 2` (strict majority). Ties → fact null, all values as candidates.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm test -- src/server/creative-work/entry-facts.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
graphify update .
git add app/src/server/creative-work/entry-facts.ts app/src/server/creative-work/entry-facts.test.ts
git commit -m "feat: project Studio entry facts without inferring on inferences"
```

---

### Task 3: Brand-scoped repository reads

**Files:**
- Modify: `app/src/server/repositories/creative-work.ts` (append next to `listCreativeWorks`)
- Modify: `app/src/server/repositories/creative-work.test.ts`
- Modify: `app/src/server/repositories/campaign.ts`
- Modify: `app/tests/unit/repositories/campaign.test.ts`

**Interfaces:**
- Consumes: Drizzle `creativeWorkItems`, `campaigns`
- Produces:

```ts
export const STUDIO_ENTRY_HISTORY_LIMIT = 8;

export async function listCreativeWorksForEntryContext(
  workspaceId: string,
  clientProfileId: string,
  limit = STUDIO_ENTRY_HISTORY_LIMIT,
): Promise<CreativeWorkItem[]>

export async function listCampaignsForEntryContext(
  workspaceId: string,
  clientProfileId: string,
  limit = STUDIO_ENTRY_HISTORY_LIMIT,
): Promise<Array<{
  id: string;
  updatedAt: Date;
  product: string | null;
  offer: string | null;
  audience: string | null;
  tone: string | null;
}>>
```

- [ ] **Step 1: Write failing tests**

In `creative-work.test.ts`, add a case that mocks `select` and asserts `whereMock` was called (do not assert SQL text). After calling `listCreativeWorksForEntryContext("ws", "brand", 8)`, expect `limitMock` to have been used and `fromMock` to have run. If the existing harness cannot see the `and(eq workspace, eq clientProfile)` condition, at least assert the function is exported and returns the queued `selectResults`.

Prefer this shape (matches the file’s drizzle mock):

```ts
it("lists creative works for entry context by workspace and brand with a limit", async () => {
  mocks.state.selectResults.push([{ id: "work-1", clientProfileId: "brand" }]);
  const { listCreativeWorksForEntryContext } = await import("./creative-work");
  const rows = await listCreativeWorksForEntryContext("ws-1", "brand", 8);
  expect(rows).toHaveLength(1);
  expect(mocks.limitMock).toHaveBeenCalled();
  expect(mocks.whereMock).toHaveBeenCalled();
});
```

Mirror for campaigns: the query must include `clientProfileId`, `orderBy updatedAt desc`, `limit`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm test -- src/server/repositories/creative-work.test.ts`

Expected: FAIL on missing export

- [ ] **Step 3: Implement**

In `listCreativeWorks`’s file, add:

```ts
export const STUDIO_ENTRY_HISTORY_LIMIT = 8;

export async function listCreativeWorksForEntryContext(
  workspaceId: string,
  clientProfileId: string,
  limit = STUDIO_ENTRY_HISTORY_LIMIT,
): Promise<CreativeWorkItem[]> {
  return db
    .select()
    .from(creativeWorkItems)
    .where(and(
      eq(creativeWorkItems.workspaceId, workspaceId),
      eq(creativeWorkItems.clientProfileId, clientProfileId),
    ))
    .orderBy(desc(creativeWorkItems.updatedAt))
    .limit(limit);
}
```

In `campaign.ts`:

```ts
export async function listCampaignsForEntryContext(
  workspaceId: string,
  clientProfileId: string,
  limit = 8,
) {
  return db
    .select({
      id: campaigns.id,
      updatedAt: campaigns.updatedAt,
      product: campaigns.product,
      offer: campaigns.offer,
      audience: campaigns.audience,
      tone: campaigns.tone,
    })
    .from(campaigns)
    .where(and(
      eq(campaigns.workspaceId, workspaceId),
      eq(campaigns.clientProfileId, clientProfileId),
    ))
    .orderBy(desc(campaigns.updatedAt))
    .limit(limit);
}
```

Do not add a migration. `creative_work_items` already has `creative_work_items_scope_idx` on `(workspaceId, clientProfileId, updatedAt)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm test -- src/server/repositories/creative-work.test.ts tests/unit/repositories/campaign.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
graphify update .
git add app/src/server/repositories/creative-work.ts app/src/server/repositories/creative-work.test.ts \
  app/src/server/repositories/campaign.ts app/tests/unit/repositories/campaign.test.ts
git commit -m "feat: list brand-scoped Studio entry history in repositories"
```

---

### Task 4: GET `/api/creative-work/entry-context`

**Files:**
- Create: `app/src/server/application/get-studio-entry-context.ts`
- Create: `app/src/server/application/get-studio-entry-context.test.ts`
- Create: `app/src/app/api/creative-work/entry-context/route.ts`
- Create: `app/src/app/api/creative-work/entry-context/route.test.ts`

**Interfaces:**
- Consumes: `getClientProfile`, `getBrandKit`, Task 2–3
- Produces: `{ ok: true, context: EntryContext } | { ok: false, error: "profile_not_found" }`

- [ ] **Step 1: Write failing application tests**

```ts
it("returns profile_not_found when the brand is outside the workspace", async () => {
  getClientProfileMock.mockResolvedValue(null);
  const result = await getStudioEntryContext({
    workspaceId: "ws",
    clientProfileId: "other",
    carouselEnabled: false,
  });
  expect(result).toEqual({ ok: false, error: "profile_not_found" });
  expect(listWorksMock).not.toHaveBeenCalled();
});

it("merges at most 8 newest rows across both origins", async () => {
  getClientProfileMock.mockResolvedValue({ id: "brand" });
  getBrandKitMock.mockResolvedValue({ toneOfVoice: null, toneNotes: null, description: null });
  listWorksMock.mockResolvedValue(
    Array.from({ length: 8 }, (_, index) => ({
      id: `w${index}`,
      updatedAt: new Date(2026, 0, 8 - index),
      toolKind: "single",
      brief: null,
      inputSnapshot: null,
      settings: {},
    })),
  );
  listCampaignsMock.mockResolvedValue(
    Array.from({ length: 8 }, (_, index) => ({
      id: `c${index}`,
      updatedAt: new Date(2026, 0, 7 - index),
      product: null,
      offer: "Campanha",
      audience: null,
      tone: null,
    })),
  );
  const result = await getStudioEntryContext({
    workspaceId: "ws",
    clientProfileId: "brand",
    carouselEnabled: false,
  });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.context.workCount).toBe(8);
});
```

Route tests follow `entry-context/route.test.ts` like `suggest/route.test.ts`: mock `requireWorkspaceAccess`, invalid uuid → 400, missing profile → 404, success → 200 `{ ...EntryContext }`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm test -- src/server/application/get-studio-entry-context.test.ts src/app/api/creative-work/entry-context/route.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

`getStudioEntryContext`:

1. `getClientProfile(workspaceId, clientProfileId)` → null means `{ ok: false, error: "profile_not_found" }`.
2. Parallel `listCreativeWorksForEntryContext`, `listCampaignsForEntryContext`, `getBrandKit(workspaceId, clientProfileId)` (kit may be null).
3. Map works to `StudioEntryHistoryRow`: `inferred*` from `inputSnapshot.inferredBriefing`; overrides from `settings.briefingOverrides ?? inputSnapshot.briefingOverrides`.
4. Map campaigns to rows with `origin: "campaign"`.
5. Sort by `updatedAt` desc, slice 0..8.
6. `projectStudioEntryContext`.
7. Return `{ ok: true, context }`.

GET route:

```ts
export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const clientProfileId = new URL(request.url).searchParams.get("clientProfileId");
    const parsed = z.string().uuid().safeParse(clientProfileId);
    if (!parsed.success) return apiError("invalidInput", 400);
    const carouselEnabled = isStudioCarouselEnabled(workspace.id, env.STUDIO_CAROUSEL_ROLLOUT_PERCENT);
    const result = await getStudioEntryContext({
      workspaceId: workspace.id,
      clientProfileId: parsed.data,
      carouselEnabled,
    });
    if (!result.ok) return apiError("notFound", 404);
    return NextResponse.json(result.context);
  } catch (error) {
    return handleApiError(error, "creative-work.entry-context.GET");
  }
}
```

Use `checkRateLimit(request, { category: "read", workspaceId: workspace.id })` before the use-case.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm test -- src/server/application/get-studio-entry-context.test.ts src/app/api/creative-work/entry-context/route.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
graphify update .
git add app/src/server/application/get-studio-entry-context.ts \
  app/src/server/application/get-studio-entry-context.test.ts \
  app/src/app/api/creative-work/entry-context/route.ts \
  app/src/app/api/creative-work/entry-context/route.test.ts
git commit -m "feat: add Studio entry-context GET for the active brand"
```

---

### Task 5: POST `/api/creative-work/entry-request`

**Files:**
- Create: `app/src/server/application/synthesize-studio-entry-request.ts`
- Create: `app/src/server/application/synthesize-studio-entry-request.test.ts`
- Create: `app/src/app/api/creative-work/entry-request/route.ts`
- Create: `app/src/app/api/creative-work/entry-request/route.test.ts`

**Interfaces:**
- Consumes: `EntryFacts`, `formatEntryRequestTemplate`, `getOpenAI`, `env.OPENAI_TEXT_MODEL`, `isE2EControlledProviderEnabled`
- Produces: `{ sentence: string; requestSource: "template" | "model" }`

Client body (untrusted):

```ts
export const entryRequestBodySchema = z.object({
  facts: z.object({
    protocol: z.enum(ENTRY_PROTOCOLS).nullable(),
    offer: z.string().trim().max(240).nullable(),
    audience: z.string().trim().max(240).nullable(),
    tone: z.string().trim().max(240).nullable(),
  }),
  chips: z.object({
    protocol: z.enum(ENTRY_PROTOCOLS).optional(),
    offer: z.string().trim().max(240).optional(),
    audience: z.string().trim().max(240).optional(),
    tone: z.string().trim().max(240).optional(),
  }).default({}),
  locale: z.enum(["pt-BR", "en"]),
}).strict();
```

Merged facts = `{ ...facts, ...chips }` with chip values winning when present.

- [ ] **Step 1: Write failing tests**

```ts
it("returns the template without calling OpenAI when the controlled provider is on", async () => {
  isE2EControlledProviderEnabledMock.mockReturnValue(true);
  const result = await synthesizeStudioEntryRequest({
    facts: { protocol: "single", offer: "imersão NR-1", audience: null, tone: "institucional" },
    chips: {},
    locale: "pt-BR",
  });
  expect(result.requestSource).toBe("template");
  expect(result.sentence).toBe("Peça única de imersão NR-1, tom institucional.");
  expect(createMock).not.toHaveBeenCalled();
});

it("falls back to the template when the model invents a price with no offer", async () => {
  isE2EControlledProviderEnabledMock.mockReturnValue(false);
  createMock.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ sentence: "Campanha a R$ 10" }) } }],
  });
  const result = await synthesizeStudioEntryRequest({
    facts: { protocol: "single", offer: null, audience: null, tone: null },
    chips: {},
    locale: "pt-BR",
  });
  expect(result.requestSource).toBe("template");
  expect(result.sentence).not.toMatch(/R\$/);
});

it("uses the model sentence when it only restates provided slots", async () => {
  isE2EControlledProviderEnabledMock.mockReturnValue(false);
  createMock.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ sentence: "Peça única de imersão NR-1." }) } }],
  });
  const result = await synthesizeStudioEntryRequest({
    facts: { protocol: "single", offer: "imersão NR-1", audience: null, tone: null },
    chips: {},
    locale: "pt-BR",
  });
  expect(result).toEqual({
    sentence: "Peça única de imersão NR-1.",
    requestSource: "model",
  });
});
```

Route tests: 400 on extra keys / oversize strings; 429 when `checkRateLimit` returns a response; 200 `{ sentence, requestSource }`; never persist.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm test -- src/server/application/synthesize-studio-entry-request.test.ts src/app/api/creative-work/entry-request/route.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

Prompt must list only non-null merged slots. System text (Portuguese, keep as a string constant in the module):

```
Você escreve um único pedido curto para um composer de anúncios.
Use somente os campos fornecidos. Não invente oferta, preço, benefício, público ou tom.
Se um campo estiver ausente, omita-o. Responda só o JSON { "sentence": string }.
```

`chat.completions.create` with `model: env.OPENAI_TEXT_MODEL`, `max_completion_tokens: 120`, `timeout: 8_000` if the SDK allows it on the call; otherwise rely on the client Abort of 8s plus template fallback on throw.

Reject the model sentence when `!merged.offer && /R\$\s*\d/i.test(sentence)`.

POST route: `requireWorkspaceAccess`, `checkRateLimit(..., { category: "ai", workspaceId })`, parse body with `entryRequestBodySchema`, return JSON.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm test -- src/server/application/synthesize-studio-entry-request.test.ts src/app/api/creative-work/entry-request/route.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
graphify update .
git add app/src/server/application/synthesize-studio-entry-request.ts \
  app/src/server/application/synthesize-studio-entry-request.test.ts \
  app/src/app/api/creative-work/entry-request/route.ts \
  app/src/app/api/creative-work/entry-request/route.test.ts
git commit -m "feat: synthesize Studio entry request with template fallback"
```

---

### Task 6: Beta-analytics allowlist

**Files:**
- Modify: `app/src/server/beta-analytics/types.ts`
- Modify: `app/src/server/beta-analytics/types.test.ts`
- Modify: `app/src/server/beta-analytics/sanitize.test.ts`
- Modify: `app/src/server/beta-analytics/record.test.ts`

**Interfaces:**
- Consumes: existing `STUDIO_BETA_EVENT_KEYS`, `ALLOWED_PROPERTY_KEYS`
- Produces: four new event keys; properties `workCount`, `slots`, `usedFallback`, `slot`, `requestSource`

- [ ] **Step 1: Write failing tests**

In `types.test.ts`:

```ts
it("allows Studio entry interview events and properties", () => {
  expect(STUDIO_BETA_EVENT_KEYS).toEqual(expect.arrayContaining([
    "studio_entry_chips_shown",
    "studio_entry_chip_selected",
    "studio_entry_request_written",
    "studio_entry_request_preserved",
  ]));
  expect(ALLOWED_PROPERTY_KEYS).toEqual(expect.arrayContaining([
    "workCount", "slots", "usedFallback", "slot", "requestSource",
  ]));
});
```

In `sanitize.test.ts`:

```ts
it("accepts Studio entry interview scalars and rejects arrays for slots", () => {
  expect(sanitizeBetaEventProperties({
    workCount: 3,
    slots: "protocol,offer",
    usedFallback: true,
    slot: "offer",
    requestSource: "template",
  })).toMatchObject({ slots: "protocol,offer", requestSource: "template" });
  expect(() => sanitizeBetaEventProperties({
    slots: ["protocol"] as unknown as string,
  })).toThrow(BetaEventPropertiesValidationError);
});
```

`record.test.ts` already iterates `STUDIO_BETA_EVENT_KEYS`; once the keys are added, that table covers persistence. Add one explicit case that recording `studio_entry_request_written` with `requestSource: "model"` calls insert.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm test -- src/server/beta-analytics/types.test.ts src/server/beta-analytics/sanitize.test.ts`

Expected: FAIL

- [ ] **Step 3: Implement**

Append to `ALLOWED_PROPERTY_KEYS`: `"workCount"`, `"slots"`, `"usedFallback"`, `"slot"`, `"requestSource"`.

Append to `STUDIO_BETA_EVENT_KEYS` the four event names from the spec.

Do not add `source` (already present and means something else).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm test -- src/server/beta-analytics/types.test.ts src/server/beta-analytics/sanitize.test.ts src/server/beta-analytics/record.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
graphify update .
git add app/src/server/beta-analytics/types.ts app/src/server/beta-analytics/types.test.ts \
  app/src/server/beta-analytics/sanitize.test.ts app/src/server/beta-analytics/record.test.ts
git commit -m "feat: allow Studio entry interview beta-analytics events"
```

---

### Task 7: Interview rollout flag

**Files:**
- Modify: `app/src/server/studio-rollout.ts`
- Modify: `app/src/server/studio-rollout.test.ts`
- Modify: `app/src/server/validation/env.ts`
- Modify: `app/src/server/validation/env.test.ts`
- Modify: `app/.env.example`
- Modify: `docs/CONFIGURATION.md`
- Modify: `app/src/app/(dashboard)/page.tsx`
- Modify: `app/src/app/(dashboard)/page.test.tsx`
- Modify: `app/src/components/dashboard/DashboardHomeActions.tsx` (prop only, unused until Task 9)

**Interfaces:**
- Consumes: `studioRolloutBucket`
- Produces:

```ts
export function isStudioEntryInterviewEnabled(workspaceId: string, percent: number): boolean
```

`DashboardHomeActions` gains `entryInterviewEnabled?: boolean` default `false`.

- [ ] **Step 1: Write failing tests**

In `studio-rollout.test.ts`, copy the carousel gate tests for `isStudioEntryInterviewEnabled` (0 → false, 100 → true, same bucket as progressive).

In `env.test.ts`, next to the progressive percent assertions, expect default `0` and reject `101`.

In `page.test.tsx`, extend the env Proxy to read `STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT` and assert `entryInterviewEnabled` false at 0 and true at 100.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm test -- src/server/studio-rollout.test.ts src/server/validation/env.test.ts src/app/\(dashboard\)/page.test.tsx`

Expected: FAIL

- [ ] **Step 3: Implement**

```ts
export function isStudioEntryInterviewEnabled(workspaceId: string, percent: number): boolean {
  const bounded = Math.max(0, Math.min(100, Math.trunc(percent)));
  return studioRolloutBucket(workspaceId) < bounded;
}
```

Env:

```ts
STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT: z.coerce.number().int().min(0).max(100).default(0),
```

`page.tsx` passes `entryInterviewEnabled={isStudioEntryInterviewEnabled(workspace.id, env.STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT)}`.

Document in `docs/CONFIGURATION.md` and `app/.env.example` as server-only, default 0, same bucket as progressive Studio.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm test -- src/server/studio-rollout.test.ts src/server/validation/env.test.ts src/app/\(dashboard\)/page.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
graphify update .
git add app/src/server/studio-rollout.ts app/src/server/studio-rollout.test.ts \
  app/src/server/validation/env.ts app/src/server/validation/env.test.ts \
  app/.env.example docs/CONFIGURATION.md \
  app/src/app/\(dashboard\)/page.tsx app/src/app/\(dashboard\)/page.test.tsx \
  app/src/components/dashboard/DashboardHomeActions.tsx
git commit -m "feat: gate Studio entry interview on the Studio rollout bucket"
```

---

### Task 8: Interview hook

**Files:**
- Create: `app/src/lib/hooks/use-studio-entry-context.ts`
- Create: `app/src/lib/hooks/use-studio-entry-interview.ts`
- Create: `app/src/lib/hooks/use-studio-entry-interview.test.tsx`

**Interfaces:**
- Consumes: Tasks 1, 4, 5, 6; `apiFetch`; `detectEntryGaps`; composer `setRequest`
- Produces:

```ts
export function useStudioEntryInterview(input: {
  enabled: boolean;
  clientProfileId: string | null;
  request: string;
  hasAttachment: boolean;
  carouselEnabled: boolean;
  locale: EntryLocale;
  setRequest: (value: string) => void;
  recordStudioEvent: (eventKey: string, properties?: Record<string, string | number | boolean>) => void;
  requestFocused: boolean;
}): {
  chips: EntryChip[];
  answers: Partial<Record<EntrySlot, string>>;
  pendingProtocol: boolean;
  answeredProtocol: EntryProtocol | null;
  suggestedProtocol: EntryProtocol | null;
  selectChip: (slot: EntrySlot, value: string) => void;
  usedFallback: boolean;
}
```

- [ ] **Step 1: Write failing hook tests** (renderHook + QueryClient)

Cases:

1. `enabled: false` → no fetch, `chips: []`.
2. GET 500 → chips equal generic three (`usedFallback: true`); `setRequest` not called until a chip is selected.
3. GET success with `protocol: "single"` and offer/tone facts, empty request, `requestFocused: false` → `setRequest` called with template; `recordStudioEvent("studio_entry_request_written", { requestSource: "template" })`; `suggestedProtocol === "single"`; `pendingProtocol === false`.
4. Selecting offer aborts an in-flight POST (mock `apiFetch` with a hanging promise + AbortError) and applies template immediately.
5. If `requestFocused: true`, a late POST result must not call `setRequest`; emit `studio_entry_request_preserved`.
6. Changing `clientProfileId` clears `answers`.
7. `selectChip("protocol", "variations")` does not need a `selectIntent` mock — the hook must not import `useCreativeComposer`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm test -- src/lib/hooks/use-studio-entry-interview.test.tsx`

Expected: FAIL

- [ ] **Step 3: Implement**

`use-studio-entry-context.ts`: `useQuery` key `["studio-entry-context", clientProfileId]`, `enabled: Boolean(enabled && clientProfileId)`, `queryFn` GET `/api/creative-work/entry-context?clientProfileId=`.

Hook behavior:

- Fallback context = Task 1 `workCount: 0` empty facts when query is error or no data yet with enabled+profile (chips still show generic; do not wait on GET to paint chips).
- `answers` state. `selectChip` sets answer, records `studio_entry_chip_selected` with `{ slot }`, writes template via `setRequest` immediately, then debounce 400ms POST with AbortController. On POST success, if `!requestFocused && requestRef === lastTemplateOrUnedited`, `setRequest(sentence)` and `studio_entry_request_written` `{ requestSource: "model" }`.
- Track `userEdited` when `request` changes without coming from template/model write (compare against last written string).
- `pendingProtocol`: chips include protocol and `answers.protocol` is missing.
- `answeredProtocol`: `answers.protocol` if it is an `EntryProtocol`.
- `suggestedProtocol`: context.facts.protocol when no protocol chip.
- On first chips paint, `studio_entry_chips_shown` with `{ workCount, slots: chips.map(c => c.slot).join(","), usedFallback }` once per context signature.
- When facts exist and request is empty and not focused, write template (spec: no blank screen).
- Debounce + single in-flight; no retry.

Use `apiFetch(url, { method: "POST", body, timeoutMs: 8000, signal })`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm test -- src/lib/hooks/use-studio-entry-interview.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
graphify update .
git add app/src/lib/hooks/use-studio-entry-context.ts \
  app/src/lib/hooks/use-studio-entry-interview.ts \
  app/src/lib/hooks/use-studio-entry-interview.test.tsx
git commit -m "feat: add Studio entry interview hook"
```

---

### Task 9: Progressive entry UI

**Files:**
- Create: `app/src/components/creative-work/StudioEntryInterview.tsx`
- Create: `app/src/components/creative-work/StudioEntryInterview.test.tsx`
- Modify: `app/src/components/dashboard/DashboardHomeActions.tsx`
- Modify: `app/src/components/dashboard/DashboardHomeActions.test.tsx`
- Modify: `app/messages/pt-BR.json`
- Modify: `app/messages/en.json`

**Interfaces:**
- Consumes: Task 8 hook, composer `setRequest` / `selectIntent` / `hasEntry` / `objectiveSelected` / `announcement`
- Produces: chips in the progressive entry card; Continue that calls `selectIntent` only when a protocol chip was answered; objectives hidden while `pendingProtocol`

- [ ] **Step 1: Write failing UI tests**

`StudioEntryInterview.test.tsx`: chips are `role="button"` with `aria-pressed`; clicking offer calls `onSelect("offer", "launch")`; wrap so chips wrap (`flex-wrap`), no `overflow-x-auto`.

`DashboardHomeActions.test.tsx` (progressive branch, `entryInterviewEnabled: true`):

1. Mock hook `pendingProtocol: true`, `chips: [{ slot: "protocol", options: ["single"] }]`, composer `hasEntry: true`, `objectiveSelected: false` → protocol tool cards (`chooseObjective`) are **absent**; textarea present.
2. `pendingProtocol: false`, `answeredProtocol: "single"` → still no duplicate tool cards; a button `entryInterviewContinue` is present; click calls `selectIntent("single", true)` **once**.
3. GET fallback path is the hook’s; here only assert typing in the textarea still calls `setRequest`.
4. Progressive + `entryInterviewEnabled: false` → no chip region (`studio-entry-interview`).

Copy keys under `dashboard.home.entryInterview`:

- `continueWithType` / `continueWithType` (en)
- `slotProtocol`, `slotOffer`, `slotAudience`, `slotTone`
- generic option labels matching Task 1 catalogs
- `requestUpdated` for the live region when the hook writes the field (set `composer` announcement by calling existing `setRequest` then a small `announce` prop, **or** write `aria-live` text inside `StudioEntryInterview` when `request` changes from the hook — prefer a `status` paragraph `aria-live="polite"` in `StudioEntryInterview` that reads `t("requestUpdated")` when `writtenToken` increments)

The progressive entry already has `aria-live` on the drop hint. Keep it. Additionally, `StudioEntryInterview` must render `role="status"` with `requestUpdated` after a programmatic write so a screen reader hears the rewrite.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm test -- src/components/creative-work/StudioEntryInterview.test.tsx src/components/dashboard/DashboardHomeActions.test.tsx`

Expected: FAIL

- [ ] **Step 3: Implement**

In the progressive tree of `DashboardHomeActions`:

```ts
const interviewEnabled = rolloutVariant === "progressive" && entryInterviewEnabled && Boolean(composer.clientProfileId);
const [requestFocused, setRequestFocused] = useState(false);
const interview = useStudioEntryInterview({
  enabled: interviewEnabled,
  clientProfileId: composer.clientProfileId,
  request: composer.request,
  hasAttachment: Boolean(composer.bufferedFile),
  carouselEnabled: carouselCreationEnabled,
  locale: "pt-BR",
  setRequest: composer.setRequest,
  recordStudioEvent: /* cannot access composer internals */;
  requestFocused,
});
```

`recordStudioEvent` is inside `useCreativeComposer` and is not returned today. **Do not** leak the whole composer. Add `recordStudioEvent` to the composer view model in `useCreativeComposer.ts` as a pass-through of the existing callback (same signature). Extend the composer mock in `DashboardHomeActions.test.tsx` with `recordStudioEvent: vi.fn()`.

This is an allowed, small addition to `useCreativeComposer.ts` / `.test.tsx` in this task: export `recordStudioEvent` on the view model next to the other telemetry-adjacent fields. Do not change when `studio_entry_started` fires; when the interview writes the first request, the hook sends `studio_entry_request_written`. Optionally set `inputMode: "interview"` on a follow-up `studio_entry_started` only if that event has not already been sent — **do not double-fire**. Spec: “`studio_entry_started` continua carregando `inputMode`; a entrevista acrescenta o valor `interview` quando o pedido nasceu de chips.” Implement by adding `inputMode` to the **existing** `studio_entry_started` properties when `workflowVariant === "progressive"` as `"text"` by default is wrong (it currently sends no `inputMode`). Change the existing `recordStudioEvent("studio_entry_started")` to:

```ts
recordStudioEvent("studio_entry_started", { inputMode: "text" });
```

and have the hook, when it first writes a request from chips/template, record:

```ts
recordStudioEvent("studio_entry_started", { inputMode: "interview" });
```

That would duplicate `studio_entry_started`. Instead: **do not** emit a second `studio_entry_started`. Emit `studio_entry_request_written` with `requestSource` as the spec’s split between handwritten and inherited requests. Leave `studio_entry_started` as it is today (no `inputMode`) unless a single-line addition of `inputMode: "text"` is already required by another test — then skip `interview` on that event.

Wire:

```ts
const showObjectives = composer.hasEntry
  && !composer.objectiveSelected
  && !interview.pendingProtocol
  && !interview.answeredProtocol;
```

When `interview.answeredProtocol`, render:

```tsx
<button type="button" data-testid="entry-interview-continue" onClick={() => void composer.selectIntent(interview.answeredProtocol!, true)}>
  {t("entryInterview.continue")}
</button>
```

inside the entry section, disabled while `!composer.hasEntry`.

Textarea: `onFocus={() => setRequestFocused(true)}` `onBlur={() => setRequestFocused(false)}`. Programmatic `setRequest` must not steal focus (do not call `.focus()`).

Locale: `useLocale()` from `next-intl` if already used in dashboard; otherwise hardcode `"pt-BR"` and pass `en` when `useLocale()` returns `en`. Check `app/src` for `useLocale()`; if present, use it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm test -- src/components/creative-work/StudioEntryInterview.test.tsx src/components/dashboard/DashboardHomeActions.test.tsx src/components/creative-work/useCreativeComposer.test.tsx`

Expected: PASS (composer tests still pass after exporting `recordStudioEvent`)

- [ ] **Step 5: Commit**

```bash
graphify update .
git add app/src/components/creative-work/StudioEntryInterview.tsx \
  app/src/components/creative-work/StudioEntryInterview.test.tsx \
  app/src/components/dashboard/DashboardHomeActions.tsx \
  app/src/components/dashboard/DashboardHomeActions.test.tsx \
  app/src/components/creative-work/useCreativeComposer.ts \
  app/src/components/creative-work/useCreativeComposer.test.tsx \
  app/messages/pt-BR.json app/messages/en.json
git commit -m "feat: render Studio entry interview chips without unmounting the field"
```

---

### Task 10: Suggested protocol on tool cards

**Files:**
- Modify: `app/src/components/creative-work/CreativeToolCards.tsx`
- Modify: `app/src/components/creative-work/CreativeToolCards.test.tsx`
- Modify: `app/src/components/dashboard/DashboardHomeActions.tsx`
- Modify: `app/messages/pt-BR.json`
- Modify: `app/messages/en.json`

**Interfaces:**
- Consumes: `suggested?: ComposerIntent | null`
- Produces: suggested card with `aria-pressed="false"` and visible “suggested from history” copy

- [ ] **Step 1: Write failing tests**

```ts
it("marks a history suggestion without pressing the card", () => {
  render(<CreativeToolCards selected={null} suggested="single" onSelect={vi.fn()} />);
  const card = screen.getByRole("button", { name: /^peça única/i });
  expect(card).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByText("Sugestão a partir do histórico")).toBeInTheDocument();
});
```

Dashboard: when `interview.suggestedProtocol === "single"` and `showObjectives`, pass `suggested={interview.suggestedProtocol}`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm test -- src/components/creative-work/CreativeToolCards.test.tsx`

Expected: FAIL

- [ ] **Step 3: Implement**

Add optional `suggested?: ComposerIntent | null`. When `suggested === id` and `selected !== id`, show muted hint `t("suggestedFromHistory")` and keep the unselected styles. `aria-pressed={selected === id}`.

Pass `suggested={showObjectives ? interview.suggestedProtocol : null}` from DashboardHomeActions.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm test -- src/components/creative-work/CreativeToolCards.test.tsx src/components/dashboard/DashboardHomeActions.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
graphify update .
git add app/src/components/creative-work/CreativeToolCards.tsx \
  app/src/components/creative-work/CreativeToolCards.test.tsx \
  app/src/components/dashboard/DashboardHomeActions.tsx \
  app/messages/pt-BR.json app/messages/en.json
git commit -m "feat: suggest Studio protocol from brand history without aria-pressed"
```

---

### Task 11: Rollout runbook

**Files:**
- Create: `docs/runbooks/studio-entry-interview-rollout.md`

**Interfaces:** none (ops doc)

- [ ] **Step 1: Write the runbook**

Mirror `docs/runbooks/progressive-studio-rollout.md` with these exact rules from the spec:

- Env: `STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT`, default 0.
- Same `studioRolloutBucket(workspaceId)` as progressive Studio.
- Arms: interview on vs interview off, both inside progressive (already 100%).
- Advance gate: 30 eligible sessions and 20 confirmed generations per arm (same as progressive 10% stage).
- Immediate rollback to 0 if completion drops more than 5 pp, abandonment before generation rises more than 5 pp, or redaction errors become visible on entry.
- Events for analysis: `studio_entry_chips_shown`, `studio_entry_chip_selected`, `studio_entry_request_written` (`requestSource`), `studio_entry_request_preserved`.
- Do not authorize paid generation, secret provisioning, or raising the percent as part of engineering implementation.

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/studio-entry-interview-rollout.md
git commit -m "docs: add Studio entry interview rollout runbook"
```

No `graphify update` required (docs only).

---

## Spec coverage (self-review)

| Spec section | Task |
| --- | --- |
| 5 chips priority, max 3, new-brand fallback | 1, 8, 9 |
| 5.1 no `selectIntent` on chip; hide objectives while protocol pending; suggested ≠ pressed | 8, 9, 10 |
| 6.1 GET brand-scoped | 3, 4 |
| 6.1.1 sourced / inferred-high / overrides; campaign vs work | 2 |
| 6.1.2 repository filter LIMIT 8 | 3 |
| 6.2 detector | 1 |
| 6.3 POST, untrusted body, debounce, rate limit, no credits | 5, 8 |
| 7 consensus | 2 |
| 8 generic catalogs | 1 |
| 9 template | 1, 8 |
| 10 sync chips/textarea, focus discards rewrite, brand switch | 8, 9 |
| 11 authorized generation context unchanged | 4–5 (read-only history) |
| 12 analytics keys | 6, 8 |
| 13 errors | 4, 5, 8, 9 |
| 14 tests | each task |
| 17 a11y | 9 |
| 18 rollout | 7, 11 |
| 19 accepted risks (short editable sentence, telemetry split) | 5, 6, 8 |

`inputMode: "interview"` on `studio_entry_started` is **not** double-emitted; `requestSource` on `studio_entry_request_written` is the measurement split (spec section 19).

## Placeholder scan

No TBD/TODO. `recordStudioEvent` export is an explicit Task 9 step, not a later surprise.
