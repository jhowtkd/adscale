import { describe, expect, it, vi, afterEach } from "vitest";

import { REDACTED } from "../../lib/redact-telemetry";
import { DIAGNOSTIC_CONTENT_POLICY_VERSION } from "./content-policy";
import type { ContentAvailabilityState } from "./contract";
import {
  CONTENT_NOT_VERBATIM_NOTICE,
  DIAGNOSTIC_CONTENT_MAX_BYTES,
  buildExpiredContentRef,
  isContentExpired,
  resolveContentAvailability,
  sanitizeDiagnosticContent,
} from "./content-sanitize";

function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  if (Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const key of Object.keys(value)) {
    try {
      deepFreeze((value as Record<string, unknown>)[key]);
    } catch {
      // Ignore unreadable members.
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sanitizeDiagnosticContent (#391)", () => {
  it("labels sanitized content as not a verbatim reproduction", () => {
    const result = sanitizeDiagnosticContent("summarize this launch");
    expect(result).not.toBeNull();
    expect(result?.availability).toBe("redacted");
    expect(result?.policyVersion).toBe(DIAGNOSTIC_CONTENT_POLICY_VERSION);
    expect(result?.verbatim).toBe(false);
    expect(result?.notice).toBe(CONTENT_NOT_VERBATIM_NOTICE);
    expect(result?.payload).toBe("summarize this launch");
  });

  it("drops unauthorized top-level free text but keeps content keys", () => {
    const result = sanitizeDiagnosticContent({
      prompt: "write a headline",
      sessionNotes: "internal free text nobody authorized",
      internalScore: 0.9,
    });
    expect(result?.payload).toEqual({ prompt: "write a headline" });
  });

  it("strips secrets in nested values and arrays via the shared redaction", () => {
    const result = sanitizeDiagnosticContent({
      messages: [
        { role: "user", content: "my key" },
        { role: "assistant", content: [{ text: "Bearer abc123" }] },
      ],
      attributes: { access_token: "sek-1", attempt: 2 },
    });
    const payload = result?.payload as Record<string, unknown>;
    expect(JSON.stringify(payload)).not.toContain("abc123");
    expect(JSON.stringify(payload)).not.toContain("sek-1");
    expect((payload.attributes as Record<string, unknown>)["attempt"]).toBe(2);
  });

  it("keeps inputTokens/outputTokens valid; access_token, cookies and keys do not survive", () => {
    const result = sanitizeDiagnosticContent({
      text: "ok",
      inputTokens: 12,
      outputTokens: 34,
      access_token: "sek",
      cookie: "sid=1",
      api_key: "k",
    });
    expect(result?.payload).toEqual({
      text: "ok",
      inputTokens: 12,
      outputTokens: 34,
    });
  });

  it("redacts exception messages and causes without mutating the input", () => {
    const cause = new Error("nested Bearer cause-9");
    const error = new Error("failed with api_key=hunter2") as Error & {
      cause: unknown;
    };
    error.cause = cause;
    const input = { error, response: "none" };
    const snapshot = "failed with api_key=hunter2";
    const result = sanitizeDiagnosticContent(input);
    expect(error.message).toBe(snapshot);
    expect(cause.message).toBe("nested Bearer cause-9");
    expect(JSON.stringify(result?.payload)).not.toContain("hunter2");
    expect(JSON.stringify(result?.payload)).not.toContain("cause-9");
  });

  it("redacts secrets inside breadcrumbs and span attributes", () => {
    const result = sanitizeDiagnosticContent({
      breadcrumbs: [
        { message: "calling with token=sek-breadcrumb" },
        { message: "plain crumb" },
      ],
      attributes: {
        "http.cookie": "sid=sek-cookie",
        "adscale.stage": "copy",
      },
    });
    const text = JSON.stringify(result?.payload);
    expect(text).not.toContain("sek-breadcrumb");
    expect(text).not.toContain("sek-cookie");
    expect(text).toContain("plain crumb");
    expect(text).toContain("copy");
  });

  it("strips signed-URL query strings and credentials from URLs", () => {
    const result = sanitizeDiagnosticContent({
      text: "see https://files.example.com/a.png?X-Amz-Signature=abc&Expires=9 and https://u:p@files.example.com/b",
    });
    const payload = String(
      (result?.payload as Record<string, unknown>)["text"],
    );
    expect(payload).not.toContain("X-Amz-Signature");
    expect(payload).not.toContain("Expires=9");
    expect(payload).not.toContain("u:p@");
    expect(payload).toContain("https://files.example.com/a.png");
  });

  it("drops image and base64 payloads by key and by data-URL value", () => {
    const result = sanitizeDiagnosticContent({
      text: "caption",
      b64_json: "aGVsbG8td29ybGQ=",
      image: { url: "https://cdn.example.com/i.png" },
      output: "data:image/png;base64,iVBORw0KGgo=",
    });
    const payload = result?.payload as Record<string, unknown>;
    expect(payload["text"]).toBe("caption");
    expect(payload).not.toHaveProperty("b64_json");
    expect(payload).not.toHaveProperty("image");
    expect(JSON.stringify(payload)).not.toContain("iVBORw0KGgo");
  });

  it("drops binary buffers instead of capturing them", () => {
    const result = sanitizeDiagnosticContent({
      text: "has binary",
      output: Buffer.from([1, 2, 3, 4]),
    });
    const payload = result?.payload as Record<string, unknown>;
    expect(payload["text"]).toBe("has binary");
    expect(payload["output"]).toBe(REDACTED);
  });

  it("drops hidden chain-of-thought keys at any depth", () => {
    const result = sanitizeDiagnosticContent({
      response: "final answer",
      reasoning: "secret plan",
      output: {
        text: "visible",
        chainOfThought: ["step 1", "step 2"],
        thinking: "hmm",
      },
    });
    const text = JSON.stringify(result?.payload);
    expect(text).toContain("final answer");
    expect(text).toContain("visible");
    expect(text).not.toContain("secret plan");
    expect(text).not.toContain("step 1");
    expect(text).not.toContain("hmm");
    expect(text).not.toMatch(/reasoning|chainOfThought|thinking/);
  });

  it("never fetches media URLs: no network I/O during sanitization", () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error("must not fetch");
    });
    vi.stubGlobal("fetch", fetchSpy);
    sanitizeDiagnosticContent({
      text: "see https://cdn.example.com/a.png and https://cdn.example.com/b.mp4",
      output: "https://files.example.com/signed?sig=1",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("scrubs personal data but leaves plain numeric identifiers alone", () => {
    const result = sanitizeDiagnosticContent({
      text: "contact joe@example.com or +55 11 98765-4321; ref 123456789; cpf 123.456.789-09",
      attributes: { phone: "+1 (415) 555-0132" },
    });
    const payload = result?.payload as Record<string, unknown>;
    const text = String(payload["text"]);
    expect(text).not.toContain("joe@example.com");
    expect(text).not.toContain("+55 11 98765-4321");
    expect(text).not.toContain("123.456.789-09");
    expect(text).toContain("123456789");
    expect((payload.attributes as Record<string, unknown>)["phone"]).toBe(
      REDACTED,
    );
  });

  it("truncates oversize content and reports truncated, never verbatim", () => {
    const big = "x".repeat(DIAGNOSTIC_CONTENT_MAX_BYTES + 1024);
    const result = sanitizeDiagnosticContent({ text: big });
    expect(result?.availability).toBe("truncated");
    expect(result?.verbatim).toBe(false);
    expect(result?.notice).toBe(CONTENT_NOT_VERBATIM_NOTICE);
    expect(JSON.stringify(result?.payload).length).toBeLessThanOrEqual(
      DIAGNOSTIC_CONTENT_MAX_BYTES,
    );
  });

  it("never mutates the model-bound object, even frozen ones", () => {
    const input = {
      messages: [{ role: "user", content: "Bearer deep-freeze" }],
      attributes: { access_token: "sek" },
    };
    deepFreeze(input);
    const result = sanitizeDiagnosticContent(input);
    expect(result).not.toBeNull();
    expect(input.messages[0].content).toBe("Bearer deep-freeze");
    expect(input.attributes.access_token).toBe("sek");
  });

  it("replaces class instances instead of capturing their internals", () => {
    class Hostile {
      blob = 10n;
    }
    const result = sanitizeDiagnosticContent({ text: new Hostile() });
    expect(result).not.toBeNull();
    expect((result?.payload as Record<string, unknown>)["text"]).toBe(
      REDACTED,
    );
  });

  it("drops content and returns null when sanitization fails", () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("prototype boom");
        },
      },
    );
    expect(sanitizeDiagnosticContent(hostile)).toBeNull();
  });

  it("never throws on hostile inputs", () => {
    const cyclic: Record<string, unknown> = { text: "cycle" };
    cyclic["self"] = cyclic;
    const throwing = {
      get text(): string {
        throw new Error("getter boom");
      },
    };
    expect(() =>
      sanitizeDiagnosticContent(cyclic),
    ).not.toThrow();
    expect(() => sanitizeDiagnosticContent(throwing)).not.toThrow();
    expect(() => sanitizeDiagnosticContent(10n)).not.toThrow();
    expect(() => sanitizeDiagnosticContent(Symbol("s"))).not.toThrow();
    expect(
      sanitizeDiagnosticContent("x".repeat(100_000)),
    ).not.toBeNull();
  });
});

describe("content availability labeling (#391)", () => {
  const base = {
    mode: "redacted" as const,
    collected: true,
    truncated: false,
    expired: false,
    remoteReachable: true,
  };

  it("always returns a frozen state plus the policy version", () => {
    const states: ContentAvailabilityState[] = [
      "not_collected",
      "redacted",
      "truncated",
      "expired",
      "unavailable",
    ];
    const ref = resolveContentAvailability(base);
    expect(states).toContain(ref.availability);
    expect(ref.policyVersion).toBe(DIAGNOSTIC_CONTENT_POLICY_VERSION);
  });

  it("reports redacted for collected content in redacted mode", () => {
    expect(resolveContentAvailability(base).availability).toBe("redacted");
  });

  it("reports not_collected for metadata_only mode or uncollected content", () => {
    expect(
      resolveContentAvailability({ ...base, mode: "metadata_only" })
        .availability,
    ).toBe("not_collected");
    expect(
      resolveContentAvailability({ ...base, collected: false }).availability,
    ).toBe("not_collected");
  });

  it("reports unavailable on remote outage while content exists", () => {
    expect(
      resolveContentAvailability({ ...base, remoteReachable: false })
        .availability,
    ).toBe("unavailable");
  });

  it("reports truncated for masked/truncated payloads", () => {
    expect(
      resolveContentAvailability({ ...base, truncated: true }).availability,
    ).toBe("truncated");
  });

  it("reports expired, never reconstructs, when content expired", () => {
    expect(
      resolveContentAvailability({ ...base, expired: true }).availability,
    ).toBe("expired");
    const ref = buildExpiredContentRef();
    expect(ref).toEqual({
      availability: "expired",
      policyVersion: DIAGNOSTIC_CONTENT_POLICY_VERSION,
    });
    expect("payload" in ref).toBe(false);
  });

  it("prefers expired over outage, and outage over truncation", () => {
    expect(
      resolveContentAvailability({
        ...base,
        expired: true,
        remoteReachable: false,
        truncated: true,
      }).availability,
    ).toBe("expired");
    expect(
      resolveContentAvailability({
        ...base,
        remoteReachable: false,
        truncated: true,
      }).availability,
    ).toBe("unavailable");
  });
});

describe("isContentExpired (#391)", () => {
  const now = new Date("2026-09-17T12:00:00.000Z");

  it("expires content older than the retention window", () => {
    expect(
      isContentExpired("2026-09-09T11:59:59.000Z", now, 7),
    ).toBe(true);
    expect(
      isContentExpired("2026-09-10T12:00:01.000Z", now, 7),
    ).toBe(false);
  });

  it("fails closed on invalid timestamps or windows", () => {
    expect(isContentExpired("not-a-date", now, 7)).toBe(true);
    expect(isContentExpired("", now, 7)).toBe(true);
    expect(
      isContentExpired("2026-09-10T12:00:01.000Z", new Date("bad"), 7),
    ).toBe(true);
    expect(
      isContentExpired("2026-09-10T12:00:01.000Z", now, 0),
    ).toBe(true);
    expect(
      isContentExpired("2026-09-10T12:00:01.000Z", now, -3),
    ).toBe(true);
  });
});
