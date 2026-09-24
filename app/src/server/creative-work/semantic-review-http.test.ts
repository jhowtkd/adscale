import { afterEach, describe, expect, it, vi } from "vitest";
import { SYNTHETIC_CASES } from "../../../scripts/run-jev-offline";
import { projectSemanticReviewOffline, SEMANTIC_MODEL, SEMANTIC_OPTIONS, SEMANTIC_QUESTIONS } from "./semantic-review-offline";
import {
  buildJevRequest,
  evaluateJev,
  JEV_ENDPOINT,
  JEV_REQUEST_LIMIT,
  JEV_RESPONSE_LIMIT,
  parseJevResponse,
} from "./semantic-review-http";

const projected = projectSemanticReviewOffline(SYNTHETIC_CASES[8].work);
if (!projected.ok) throw new Error("synthetic fixture must project");
const projection = projected.projection;

function response() {
  return {
    model: SEMANTIC_MODEL,
    answers: Object.fromEntries(SEMANTIC_QUESTIONS.map((question) => {
      const options = SEMANTIC_OPTIONS[question];
      return [question, {
        type: "choice",
        choice: options[0],
        confidence: 0.9,
        probabilities: Object.fromEntries(options.map((option, index) => [option, index === 0 ? 1 : 0])),
      }];
    })) as Record<string, { type: string; choice: string; confidence: number; probabilities: Record<string, number> }>,
    usage: { input_tokens: 120, output_tokens: 6 },
  };
}

function mockFetch(value: Response | Error) {
  return vi.fn(async () => {
    if (value instanceof Error) throw value;
    return value;
  }) as unknown as typeof fetch;
}

afterEach(() => vi.useRealTimers());

describe("Jev controlled HTTP adapter", () => {
  it("sends only frozen text, six choice questions and the pinned model to the fixed host", async () => {
    const fetchImpl = mockFetch(new Response(JSON.stringify(response()), { status: 200 }));
    const result = await evaluateJev(projection, "controlled-key", fetchImpl);
    expect(result).toMatchObject({ ok: true, usage: { input_tokens: 120, output_tokens: 6 } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetchImpl).mock.calls[0];
    expect(url).toBe(JEV_ENDPOINT);
    expect(options).toMatchObject({ method: "POST", redirect: "manual", cache: "no-store" });
    const body = String(options?.body);
    expect(body).not.toMatch(/synthetic-workspace|synthetic-brand|synthetic-source|art-1|assetKey|updatedAt|synthetic-only|controlled-key/);
    const request = JSON.parse(body);
    expect(request).toEqual(buildJevRequest(projection));
    expect(Object.keys(request.questions)).toEqual([...SEMANTIC_QUESTIONS]);
    expect(request.model).toBe("jev-1.13.0");
    for (const question of SEMANTIC_QUESTIONS) {
      expect(request.questions[question].type).toBe("choice");
      expect(Object.keys(request.questions[question].criteria)).toEqual([...SEMANTIC_OPTIONS[question]]);
    }
  });

  it("validates the full answer matrix and preserves missing usage as null", () => {
    const valid = response();
    expect(parseJevResponse({ ...valid, usage: undefined })).toMatchObject({ ok: true, usage: null });
    expect(parseJevResponse({ ...valid, model: "jev-latest" })).toEqual({ ok: false, reason: "invalid_response" });
    expect(parseJevResponse({ ...valid, answers: { ...valid.answers, extra: valid.answers.body_claims } })).toEqual({ ok: false, reason: "invalid_response" });
    const incomplete = response();
    delete incomplete.answers.body_claims;
    expect(parseJevResponse(incomplete)).toEqual({ ok: false, reason: "invalid_response" });
    const badSum = response();
    badSum.answers.headline_claims.probabilities.supported = 0.4;
    expect(parseJevResponse(badSum)).toEqual({ ok: false, reason: "invalid_response" });
    const wrongWinner = response();
    wrongWinner.answers.headline_claims.choice = "unsupported";
    expect(parseJevResponse(wrongWinner)).toEqual({ ok: false, reason: "invalid_response" });
    const badUsage = response();
    badUsage.usage.input_tokens = -1;
    expect(parseJevResponse(badUsage)).toEqual({ ok: false, reason: "invalid_response" });
    const infinite = response();
    infinite.answers.cta_claims.confidence = Number.POSITIVE_INFINITY;
    expect(parseJevResponse(infinite)).toEqual({ ok: false, reason: "invalid_response" });
  });

  it("does not send an oversized UTF-8 request", async () => {
    const fetchImpl = mockFetch(new Response(JSON.stringify(response())));
    const huge = { ...projection, copy: { ...projection.copy, body: "é".repeat(JEV_REQUEST_LIMIT / 2) } };
    expect(await evaluateJev(huge, "controlled-key", fetchImpl)).toEqual({ ok: false, reason: "request_too_large" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("bounds streamed response bytes despite a false Content-Length", async () => {
    const fetchImpl = mockFetch(new Response("x".repeat(JEV_RESPONSE_LIMIT + 1), { headers: { "content-length": "1" } }));
    expect(await evaluateJev(projection, "controlled-key", fetchImpl)).toEqual({ ok: false, reason: "response_too_large" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects redirect, 429, reset and incomplete responses without exposing bodies", async () => {
    expect(await evaluateJev(projection, "secret-value", mockFetch(new Response("private", { status: 302 })))).toEqual({ ok: false, reason: "redirect", status: 302 });
    expect(await evaluateJev(projection, "secret-value", mockFetch(new Response("private", { status: 429 })))).toEqual({ ok: false, reason: "http_status", status: 429 });
    expect(await evaluateJev(projection, "secret-value", mockFetch(new Error("secret-value private reset")))).toEqual({ ok: false, reason: "network_error" });
    expect(await evaluateJev(projection, "secret-value", mockFetch(new Response("{")))).toEqual({ ok: false, reason: "invalid_response" });
    expect(await evaluateJev(projection, "secret-value", mockFetch(new Response("")))).toEqual({ ok: false, reason: "empty_response" });
  });

  it("times out while the response stream is still open", async () => {
    vi.useFakeTimers();
    const fetchImpl = mockFetch(new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode("{")); },
      pull() { return new Promise<void>(() => {}); },
    })));
    const pending = evaluateJev(projection, "controlled-key", fetchImpl);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toEqual({ ok: false, reason: "timeout" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
