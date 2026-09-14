# Image worker cutover + auth resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New heavy image jobs run on `adscale-image-worker` (not the 512 MB web dyno), and an unauthenticated Studio deep link or a 401 mid-session returns the operator to the same path after login.

**Architecture:** Track A only changes event routing: API routes already call `heavyImageEventName()`, which suffixes `.v2` when `IMAGE_JOB_TARGET=worker`. The worker already listens to those `.v2` events. Before flipping the web env, pin the carousel job triggers to static names so the web process cannot also subscribe to `.v2`. Track B treats Studio query params on `/` as product resume (login + `callbackUrl`), never as a marketing bounce, and reuses `safeCallbackPath` for `apiFetch` 401.

**Tech Stack:** Inngest (apps `adscale` and `adscale-image-worker`), Render `render.yaml`, Next.js `proxy.ts`, Vitest, `safeCallbackPath` in `app/src/lib/auth-callback.ts`.

**Spec:** ICE sprint 2026-09-06 — M1 (worker) + M2 (deep link / 401). Not in this plan: quality_recovery flag, Brand Cortex, briefing inferido, share de Peça, CSV de mídia.

## File map

| File | Responsibility |
| --- | --- |
| `app/src/server/jobs/creative-work-carousel.ts` | Static Inngest trigger names for v1 vs v2 carousel jobs |
| `app/src/server/jobs/creative-work-carousel-triggers.test.ts` | Assert those trigger names ignore `IMAGE_JOB_TARGET` |
| `app/src/server/jobs/image-routing-blueprint.test.ts` | Parse `render.yaml` and lock the web→worker emit contract |
| `render.yaml` | Web `IMAGE_JOB_TARGET=worker` so API `inngest.send` emits `*.v2` |
| `docs/runbooks/image-worker-cutover.md` | Pre-merge worker liveness, Inngest check, rollback |
| `app/src/lib/studio-resume-query.ts` | `hasStudioResumeQuery` — keys only, no composer imports |
| `app/src/lib/studio-resume-query.test.ts` | Resume-query cases |
| `app/src/proxy.ts` | Unauthenticated `/` with Studio query → `/login?callbackUrl=` |
| `app/src/proxy.test.ts` | Marketing vs resume vs `/campaigns` |
| `app/src/lib/auth-callback.ts` | `unauthorizedLoginHref` |
| `app/src/lib/auth-callback.test.ts` | Open-redirect + 401 href cases |
| `app/src/lib/api-client.ts` | 401 uses `unauthorizedLoginHref` |
| `app/src/lib/api-client.test.ts` | `fetch` 401 assigns `window.location.href` |

Do not modify `createCreativeWorkOutputJobV2` concurrency (already `limit: 2`), `IMAGE_ROUTE_CONCURRENCY` on the worker, settlement, billing, or quality-recovery flags.

## Global Constraints

- ADR 0013: no new primary destination, no unfreeze of Landing Page / Persona Simulation.
- Do not set `CREATIVE_WORK_QUALITY_RECOVERY_ENABLED` or `BRAND_CORTEX_SINGLE_PIECE_ENABLED` to `true`.
- Keep v1 (unsuffixed) functions registered on the web Inngest serve so in-flight `creative-work.generate` events drain on the 512 MB instance.
- Web `IMAGE_ROUTE_CONCURRENCY` stays `"1"` (only v1 drain uses it on web).
- Worker keeps `IMAGE_JOB_TARGET=worker` and `IMAGE_ROUTE_CONCURRENCY=2`.
- Carousel v1 trigger must stay `creative-work.carousel-slide.generate`; v2 must stay `creative-work.carousel-slide.generate.v2`. Never both listen to the same name in one environment.
- Unauthenticated `/` with no Studio query still redirects to `MARKETING_URL` when set.
- Every login callback goes through `safeCallbackPath` (relative path only; reject `//` and absolute URLs).
- Run tests from `app/` with `npm test -- <path>`. After source changes run `graphify update .` from the repo root before the source commit; do not stage unrelated graph files.
- Stage only the files named in the active task.

## Execution map

```text
Track A — image routing (M1)
Task 1 pin carousel triggers (blocker)
  └─ Task 2 render.yaml web IMAGE_JOB_TARGET=worker + blueprint test + runbook

Track B — auth resume (M2), no dependency on Track A
Task 3 hasStudioResumeQuery + proxy
  └─ Task 4 unauthorizedLoginHref + apiFetch 401
```

Ship Track A and Track B as two PRs if useful. Do not merge Task 2 to `main` until the runbook pre-merge checks pass.

---

### Task 1: Pin carousel Inngest triggers off `IMAGE_JOB_TARGET`

**Files:**
- Modify: `app/src/server/jobs/creative-work-carousel.ts:591-614`
- Create: `app/src/server/jobs/creative-work-carousel-triggers.test.ts`

**Interfaces:**
- Consumes: `CAROUSEL_SLIDE_GENERATE_EVENT` (`"creative-work.carousel-slide.generate"`) from `app/src/server/jobs/heavy-image-events.ts`; `heavyImageEventName` remains for **send** only.
- Produces: `creativeWorkCarouselSlideJob` trigger `{ event: "creative-work.carousel-slide.generate" }`; `createCreativeWorkCarouselSlideJobV2` trigger `{ event: "creative-work.carousel-slide.generate.v2" }`.

Today both registrations call `heavyImageEventName(CAROUSEL_SLIDE_GENERATE_EVENT)` at module load. If the web process is later started with `IMAGE_JOB_TARGET=worker`, the web job would subscribe to `.v2` and run in parallel with `adscale-image-worker`.

- [ ] **Step 1: Write the failing trigger tests**

Create `app/src/server/jobs/creative-work-carousel-triggers.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { Inngest } from "inngest";
import {
  createCreativeWorkCarouselSlideJobV2,
  creativeWorkCarouselSlideJob,
} from "./creative-work-carousel";

type JobOpts = {
  id?: string;
  triggers?: Array<{ event?: string }>;
};

function jobOpts(job: unknown): JobOpts {
  return (job as { opts: JobOpts }).opts;
}

describe("carousel slide job triggers", () => {
  it("keeps the web job on the unsuffixed event", () => {
    expect(jobOpts(creativeWorkCarouselSlideJob).triggers).toEqual([
      { event: "creative-work.carousel-slide.generate" },
    ]);
  });

  it("keeps the worker job on the v2 event even if IMAGE_JOB_TARGET is worker", () => {
    const previous = process.env.IMAGE_JOB_TARGET;
    process.env.IMAGE_JOB_TARGET = "worker";
    try {
      const createFunction = vi.fn((opts: JobOpts) => ({ opts }));
      createCreativeWorkCarouselSlideJobV2({ createFunction } as unknown as Inngest);
      expect(createFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "generate-creative-work-carousel-slide-v2",
          triggers: [{ event: "creative-work.carousel-slide.generate.v2" }],
        }),
        expect.anything(),
      );
    } finally {
      if (previous === undefined) delete process.env.IMAGE_JOB_TARGET;
      else process.env.IMAGE_JOB_TARGET = previous;
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/server/jobs/creative-work-carousel-triggers.test.ts`

Expected: FAIL — both jobs currently resolve through `heavyImageEventName`, so the v2 factory follows `IMAGE_JOB_TARGET` instead of a pinned `.v2` name (and/or `createFunction` options do not match).

- [ ] **Step 3: Pin the two trigger strings**

In `app/src/server/jobs/creative-work-carousel.ts`, keep the `heavyImageEventName` import only if send/retry paths in this file still use it. Change the two `createFunction` trigger blocks to literals:

```ts
export const creativeWorkCarouselSlideJob = inngest.createFunction(
  {
    ...carouselSlideJobConfig,
    triggers: [{ event: "creative-work.carousel-slide.generate" }],
  },
  async ({ event, step }: { event: { data: unknown }; step: CarouselSlideJobStep }) =>
    step.run("generate-carousel-slide", () =>
      runCreativeWorkCarouselSlide({ event: event.data as CarouselSlideGenerateEvent }),
    ),
);

export function createCreativeWorkCarouselSlideJobV2(client: Inngest) {
  return client.createFunction(
    {
      ...carouselSlideJobConfig,
      id: "generate-creative-work-carousel-slide-v2",
      triggers: [{ event: "creative-work.carousel-slide.generate.v2" }],
    },
    async ({ event, step }: { event: { data: unknown }; step: CarouselSlideJobStep }) =>
      step.run("generate-carousel-slide", () =>
        runCreativeWorkCarouselSlide({ event: event.data as CarouselSlideGenerateEvent }),
      ),
  );
}
```

Do not change `carouselSlideJobConfig.concurrency` (v1 drain stays `limit: 1` with key `"creative-work-image"`). Dispatchers must continue to call `heavyImageEventName(CAROUSEL_SLIDE_GENERATE_EVENT)` so production send still suffixes when the process target is `worker`.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm test -- src/server/jobs/creative-work-carousel-triggers.test.ts src/server/jobs/heavy-image-events.test.ts src/server/jobs/creative-work-carousel.test.ts`

Expected: PASS on all three.

- [ ] **Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2
graphify update .
git add app/src/server/jobs/creative-work-carousel.ts app/src/server/jobs/creative-work-carousel-triggers.test.ts
git commit -m "$(cat <<'EOF'
fix: pin carousel Inngest triggers off IMAGE_JOB_TARGET

Web and worker must not both subscribe to carousel-slide.generate.v2 when the web dyno starts emitting worker events.
EOF
)"
```

---

### Task 2: Point web `inngest.send` at the image worker

**Files:**
- Create: `app/src/server/jobs/image-routing-blueprint.test.ts`
- Modify: `render.yaml:31-34` (web service `adscale-app` only)
- Create: `docs/runbooks/image-worker-cutover.md`
- Modify (comment only): `app/src/server/jobs/creative-work.ts:305-308`

**Interfaces:**
- Consumes: `heavyImageEventName` / `resolveHeavyEventName` already suffix `.v2` when `process.env.IMAGE_JOB_TARGET === "worker"` (`app/src/server/ai/image-runtime-config.ts`).
- Produces: web service env `IMAGE_JOB_TARGET=worker` so API routes on `adscale-app` emit `creative-work.generate.v2` (and the other heavy bases). Worker service env unchanged.

`IMAGE_JOB_TARGET` on web does **not** mean “run jobs on web”. It only chooses the event name used by `inngest.send` in API/application code. Execution of `.v2` stays on `adscale-image-worker` (`app/src/server/jobs/image-worker.ts`).

- [ ] **Step 1: Write the failing blueprint test**

Create `app/src/server/jobs/image-routing-blueprint.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function renderYaml(): string {
  return readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../render.yaml"),
    "utf8",
  );
}

function serviceBlock(yaml: string, serviceName: string): string {
  const blocks = yaml.split(/\n  - type:/).slice(1);
  const block = blocks.find((candidate) =>
    new RegExp(`name:\\s+${serviceName}\\b`).test(candidate),
  );
  if (!block) throw new Error(`render.yaml missing service ${serviceName}`);
  return block;
}

function envValue(block: string, key: string): string | undefined {
  const match = block.match(
    new RegExp(`- key: ${key}\\n(?:        (?:sync|generateValue|fromDatabase):[^\\n]+\\n)*        value: ("[^"]+"|\\S+)`),
  );
  if (!match) return undefined;
  return match[1].replace(/^"|"$/g, "");
}

describe("render.yaml image routing", () => {
  const yaml = renderYaml();
  const web = serviceBlock(yaml, "adscale-app");
  const worker = serviceBlock(yaml, "adscale-image-worker");

  it("emits worker-suffixed heavy events from the web API process", () => {
    expect(envValue(web, "IMAGE_JOB_TARGET")).toBe("worker");
    expect(envValue(web, "IMAGE_ROUTE_CONCURRENCY")).toBe("1");
  });

  it("runs v2 jobs on the dedicated worker with route concurrency 2", () => {
    expect(envValue(worker, "IMAGE_JOB_TARGET")).toBe("worker");
    expect(envValue(worker, "IMAGE_ROUTE_CONCURRENCY")).toBe("2");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/server/jobs/image-routing-blueprint.test.ts`

Expected: FAIL with `IMAGE_JOB_TARGET` on `adscale-app` equal to `"web"` not `"worker"`.

- [ ] **Step 3: Flip only the web emit target**

In `render.yaml`, on service `adscale-app` (not the worker), replace:

```yaml
      - key: IMAGE_JOB_TARGET
        value: web
```

with:

```yaml
      # Controls the event suffix emitted by API inngest.send (heavyImageEventName).
      # Jobs matching *.v2 run on adscale-image-worker, not this 512 MB web dyno.
      - key: IMAGE_JOB_TARGET
        value: worker
```

Leave `IMAGE_ROUTE_CONCURRENCY: "1"` on web. Leave the worker block unchanged.

In `app/src/server/jobs/creative-work.ts`, replace the v1 concurrency comment:

```ts
      // v1 drain only: serial on the 512 MB web serve for unsuffixed
      // creative-work.generate. New work uses generate-creative-work-output-v2
      // (limit 2, key "openai") on adscale-image-worker.
```

Do not change the v1 `limit: 1` value. Do not change `createCreativeWorkOutputJobV2` (`limit: 2` already).

Create `docs/runbooks/image-worker-cutover.md`:

```markdown
# Cutover: heavy image jobs → adscale-image-worker

Web `IMAGE_JOB_TARGET=worker` makes API processes emit `*.v2` events. The worker Connect app `adscale-image-worker` is the only consumer of those names.

## Pre-merge (required)

1. In Render, service `adscale-image-worker` is live (not suspended).
2. Worker logs contain `image_worker_connected` after the latest deploy.
3. Inngest dashboard: app `adscale-image-worker` shows the eight v2 functions from `buildImageWorkerConnectOptions` as synced.

If any check fails, do not merge the `render.yaml` change. Revert web `IMAGE_JOB_TARGET` to `web`.

## Post-merge

1. Deploy `adscale-app` and `adscale-image-worker` (same commit).
2. Generate one Peça in a non-prod workspace (or the owner workspace if that is the only live tenant).
3. Inngest: the run is `generate-creative-work-output-v2` on app `adscale-image-worker`, not `generate-creative-work-output` on `adscale`.
4. Render metrics: web RAM should not spike for the image call; worker CPU/RAM should.

## Rollback

Set `adscale-app` `IMAGE_JOB_TARGET` back to `web` and deploy. New sends return to unsuffixed names consumed by `/api/inngest`. In-flight `.v2` runs finish on the worker. Do not delete the worker service during rollback.
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm test -- src/server/jobs/image-routing-blueprint.test.ts src/server/ai/image-runtime-config.test.ts src/server/jobs/image-worker.test.ts src/server/jobs/creative-work.test.ts src/server/jobs/creative-work-carousel-triggers.test.ts`

Expected: PASS. Confirm the creative-work test named `has a global single-image-job limit on the 512 MB production instance` still expects v1 `limit: 1` and event `creative-work.generate`.

- [ ] **Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2
graphify update .
git add render.yaml app/src/server/jobs/image-routing-blueprint.test.ts app/src/server/jobs/creative-work.ts docs/runbooks/image-worker-cutover.md
git commit -m "$(cat <<'EOF'
fix: emit heavy image events to the dedicated Inngest worker

Web API send now uses IMAGE_JOB_TARGET=worker so OpenAI image jobs leave the 512 MB dyno. v1 unsuffixed functions stay registered for drain.
EOF
)"
```

Stop and run the runbook pre-merge checks before merging this commit to `main`.

---

### Task 3: Preserve Studio query string on unauthenticated `/`

**Files:**
- Create: `app/src/lib/studio-resume-query.ts`
- Create: `app/src/lib/studio-resume-query.test.ts`
- Modify: `app/src/proxy.ts:62-73`
- Modify: `app/src/proxy.test.ts`

**Interfaces:**
- Consumes: the same query keys `parseDashboardSearchParams` already understands (`workId`, `intent`, `mode`, `fresh`, `compose`, `templateId`, `campaignId`). Do not import `dashboard-search-params.ts` from `proxy.ts` (that file type-imports the composer).
- Produces: `hasStudioResumeQuery(searchParams: URLSearchParams): boolean`; `redirectUnauthenticated` sends those requests to `/login?callbackUrl=` instead of `MARKETING_URL`.

`LoginContent` already reads `callbackUrl` via `safeCallbackPath`. `/?workId=<uuid>` is how `LegacyCreatePostRedirect` and Studio resume work.

- [ ] **Step 1: Write the failing resume-query tests**

Create `app/src/lib/studio-resume-query.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hasStudioResumeQuery } from "./studio-resume-query";

const UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("hasStudioResumeQuery", () => {
  it("is true for workId, compose, intent, mode, fresh, templateId, and campaignId", () => {
    expect(hasStudioResumeQuery(new URLSearchParams("workId=not-validated"))).toBe(true);
    expect(hasStudioResumeQuery(new URLSearchParams("compose=1"))).toBe(true);
    expect(hasStudioResumeQuery(new URLSearchParams("intent=single"))).toBe(true);
    expect(hasStudioResumeQuery(new URLSearchParams("mode=arte"))).toBe(true);
    expect(hasStudioResumeQuery(new URLSearchParams("fresh=1"))).toBe(true);
    expect(hasStudioResumeQuery(new URLSearchParams(`templateId=${UUID}`))).toBe(true);
    expect(hasStudioResumeQuery(new URLSearchParams(`campaignId=${UUID}`))).toBe(true);
  });

  it("is false for empty search, empty values, and marketing UTMs", () => {
    expect(hasStudioResumeQuery(new URLSearchParams(""))).toBe(false);
    expect(hasStudioResumeQuery(new URLSearchParams("workId="))).toBe(false);
    expect(hasStudioResumeQuery(new URLSearchParams("utm_source=ig"))).toBe(false);
  });
});
```

Add to `app/src/proxy.test.ts` inside `describe("proxy auth routing"`:

```ts
  it("sends unauthenticated Studio resume on / to login instead of MARKETING_URL", async () => {
    const res = await proxy(requestFor(`/?workId=${"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}`));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?callbackUrl=%2F%3FworkId%3Daaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
  });

  it("sends unauthenticated /?compose=1 to login with callbackUrl", async () => {
    const res = await proxy(requestFor("/?compose=1"));
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?callbackUrl=%2F%3Fcompose%3D1",
    );
  });

  it("still sends bare unauthenticated / to MARKETING_URL", async () => {
    const res = await proxy(requestFor("/"));
    expect(new URL(res.headers.get("location")!).origin).toBe("https://www.example.com");
  });

  it("preserves query on /campaigns callbackUrl", async () => {
    const res = await proxy(requestFor("/campaigns?tab=review"));
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?callbackUrl=%2Fcampaigns%3Ftab%3Dreview",
    );
  });

  it("sets callbackUrl for / when MARKETING_URL is unset and Studio query is present", async () => {
    delete process.env.MARKETING_URL;
    const res = await proxy(requestFor("/?compose=1"));
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?callbackUrl=%2F%3Fcompose%3D1",
    );
  });
```

Keep the existing tests for `/campaigns` without query and for unset `MARKETING_URL` on bare `/` (`location` `http://localhost:3000/login`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/studio-resume-query.test.ts src/proxy.test.ts`

Expected: FAIL — `hasStudioResumeQuery` is not exported; `/?workId=` still 307s to `MARKETING_URL`; `/` without marketing and with `compose` still goes to `/login` with no `callbackUrl`.

- [ ] **Step 3: Implement the helper and proxy branch**

Create `app/src/lib/studio-resume-query.ts`:

```ts
export const STUDIO_RESUME_QUERY_KEYS = [
  "workId",
  "intent",
  "mode",
  "fresh",
  "compose",
  "templateId",
  "campaignId",
] as const;

export function hasStudioResumeQuery(searchParams: URLSearchParams): boolean {
  return STUDIO_RESUME_QUERY_KEYS.some((key) => {
    const value = searchParams.get(key);
    return Boolean(value && value.trim());
  });
}
```

In `app/src/proxy.ts`, add:

```ts
import { hasStudioResumeQuery } from "@/lib/studio-resume-query";
```

Replace `redirectUnauthenticated` with:

```ts
function redirectUnauthenticated(request: NextRequest, pathname: string) {
  const resumePath = `${pathname}${request.nextUrl.search}`;
  const studioResume = pathname === "/" && hasStudioResumeQuery(request.nextUrl.searchParams);
  const marketingUrl = getMarketingUrl();
  if (pathname === "/" && marketingUrl && !studioResume) {
    return NextResponse.redirect(marketingUrl);
  }

  const loginUrl = new URL("/login", request.url);
  if (resumePath !== "/") {
    loginUrl.searchParams.set("callbackUrl", resumePath);
  }
  return NextResponse.redirect(loginUrl);
}
```

`hasStudioResumeQuery` must stay a pure URLSearchParams helper. Do not import React or composer hooks into `proxy.ts`.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm test -- src/lib/studio-resume-query.test.ts src/proxy.test.ts src/lib/auth-callback.test.ts`

Expected: PASS. Bare `/` + `MARKETING_URL` still hits the marketing origin. `safeCallbackPath("/?workId=…")` remains a relative path.

- [ ] **Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2
graphify update .
git add app/src/lib/studio-resume-query.ts app/src/lib/studio-resume-query.test.ts app/src/proxy.ts app/src/proxy.test.ts
git commit -m "$(cat <<'EOF'
fix: keep Studio query string through unauthenticated home redirect

/?workId and /?compose=1 go to login with callbackUrl instead of the marketing site.
EOF
)"
```

---

### Task 4: Return 401 `apiFetch` to the current Studio path

**Files:**
- Modify: `app/src/lib/auth-callback.ts`
- Modify: `app/src/lib/auth-callback.test.ts`
- Modify: `app/src/lib/api-client.ts`
- Create: `app/src/lib/api-client.test.ts`

**Interfaces:**
- Consumes: `safeCallbackPath(value: string | null): string` (existing).
- Produces: `unauthorizedLoginHref(currentPathWithSearch: string): string`; `apiFetch` assigns `window.location.href` to that href on HTTP 401.

Today `apiFetch` does `window.location.href = "/login"` and drops `/?workId=`. Invite already uses `relativeCallbackPath`.

- [ ] **Step 1: Write the failing href and fetch tests**

Add to `app/src/lib/auth-callback.test.ts`:

```ts
import { relativeCallbackPath, safeCallbackPath, unauthorizedLoginHref } from "./auth-callback";

describe("unauthorizedLoginHref", () => {
  it("preserves a relative Studio resume path", () => {
    expect(unauthorizedLoginHref("/?workId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toBe(
      "/login?callbackUrl=%2F%3FworkId%3Daaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(unauthorizedLoginHref("/campaigns?tab=review")).toBe(
      "/login?callbackUrl=%2Fcampaigns%3Ftab%3Dreview",
    );
  });

  it("does not loop on auth entry or the bare home path", () => {
    expect(unauthorizedLoginHref("/")).toBe("/login");
    expect(unauthorizedLoginHref("/login")).toBe("/login");
    expect(unauthorizedLoginHref("/login?callbackUrl=%2Fsettings")).toBe("/login");
    expect(unauthorizedLoginHref("/signup")).toBe("/login");
  });

  it("rejects open redirects the same way as safeCallbackPath", () => {
    expect(unauthorizedLoginHref("https://evil.example/")).toBe("/login");
    expect(unauthorizedLoginHref("//evil.example")).toBe("/login");
  });
});
```

Create `app/src/lib/api-client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api-client";

describe("apiFetch 401", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", {
      href: "http://localhost:3000/?workId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      pathname: "/",
      search: "?workId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the operator to login with the current path as callbackUrl", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(apiFetch("/api/creative-work/x")).rejects.toThrow("Unauthorized");
    expect(window.location.href).toBe(
      "/login?callbackUrl=%2F%3FworkId%3Daaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
  });

  it("does not replace href when already on /login", async () => {
    vi.stubGlobal("location", {
      href: "http://localhost:3000/login",
      pathname: "/login",
      search: "",
    });
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(apiFetch("/api/creative-work/x")).rejects.toThrow("Unauthorized");
    expect(window.location.href).toBe("http://localhost:3000/login");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/auth-callback.test.ts src/lib/api-client.test.ts`

Expected: FAIL — `unauthorizedLoginHref` is not exported; 401 still sets `href` to `"/login"`.

- [ ] **Step 3: Implement href helper and wire `apiFetch`**

Append to `app/src/lib/auth-callback.ts`:

```ts
export function unauthorizedLoginHref(currentPathWithSearch: string): string {
  const callback = safeCallbackPath(currentPathWithSearch);
  if (
    callback === "/" ||
    callback === "/login" ||
    callback.startsWith("/login?") ||
    callback === "/signup" ||
    callback.startsWith("/signup?")
  ) {
    return "/login";
  }
  return `/login?callbackUrl=${encodeURIComponent(callback)}`;
}
```

Replace the 401 block in `app/src/lib/api-client.ts`:

```ts
import { unauthorizedLoginHref } from "@/lib/auth-callback";

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const { timeoutMs = 15_000, ...fetchInit } = init ?? {};
  const res = await fetch(input, {
    ...fetchInit,
    credentials: "include",
    signal: fetchInit.signal ?? AbortSignal.timeout(timeoutMs),
  });

  if (res.status === 401) {
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = unauthorizedLoginHref(
        `${window.location.pathname}${window.location.search}`,
      );
    }
    throw new Error("Unauthorized");
  }

  return res;
}
```

Leave `isApiRequestUncertain` unchanged. Do not change the 15s default timeout in this task.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npm test -- src/lib/auth-callback.test.ts src/lib/api-client.test.ts src/proxy.test.ts src/app/\(dashboard\)/quick-tools/create-post/LegacyCreatePostRedirect.test.tsx`

Expected: PASS. Invite/open-redirect cases in `auth-callback.test.ts` still reject `https://evil.example`.

- [ ] **Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/ADScale_2
graphify update .
git add app/src/lib/auth-callback.ts app/src/lib/auth-callback.test.ts app/src/lib/api-client.ts app/src/lib/api-client.test.ts
git commit -m "$(cat <<'EOF'
fix: preserve current path on apiFetch 401

Expired session on a Studio deep link returns to login with callbackUrl instead of dropping workId.
EOF
)"
```

---

## Verification (human, after both tracks)

1. Logged-out browser: open `https://adscale.jhonatansoares.com/?workId=<real-uuid>` (or staging). Land on `/login?callbackUrl=…`, sign in, land on Studio with that work — not `/hi`.
2. Logged-in Studio: expire the session cookie, trigger any `apiFetch`; return to the same `/?workId=` after login.
3. Logged-out bare `/`: still marketing `/hi`.
4. After Task 2 is on `main`: one paid or owner generation shows Inngest function `generate-creative-work-output-v2` on app `adscale-image-worker`.
5. Carousel generation (if entitlement on): a single slide run, not duplicated web+worker.

## Out of scope (next ICE plan, not this file)

M3 briefing inferido visível, F1 checklist de compliance no export, M4 alerta de liquidação travada, F2 share de Peça.
