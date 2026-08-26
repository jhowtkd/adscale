import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST, OPTIONS } from "./route";

const mockFindByEmail = vi.fn();
const mockCreateSignup = vi.fn();
const mockUpdateResendContactId = vi.fn();
const mockSyncContact = vi.fn();
const mockSendConfirmation = vi.fn();
const mockRateLimit = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

vi.mock("@/server/repositories/waitlist", () => ({
  findWaitlistSignupByEmail: (...args: unknown[]) => mockFindByEmail(...args),
  createWaitlistSignup: (...args: unknown[]) => mockCreateSignup(...args),
  updateWaitlistResendContactId: (...args: unknown[]) => mockUpdateResendContactId(...args),
}));

vi.mock("@/server/services/resend-contacts", () => ({
  syncWaitlistContact: (...args: unknown[]) => mockSyncContact(...args),
}));

vi.mock("@/server/services/email", () => ({
  sendWaitlistConfirmationEmail: (...args: unknown[]) => mockSendConfirmation(...args),
}));

function postRequest(body: unknown, origin?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin) {
    headers.origin = origin;
  }
  return new Request("http://localhost/api/waitlist", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function optionsRequest(origin?: string) {
  const headers: Record<string, string> = {};
  if (origin) {
    headers.origin = origin;
  }
  return new Request("http://localhost/api/waitlist", {
    method: "OPTIONS",
    headers,
  });
}

describe("POST and OPTIONS /api/waitlist (closed)", () => {
  const originalEnv = process.env.MARKETING_ALLOWED_ORIGINS;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MARKETING_ALLOWED_ORIGINS = "https://example.com,https://adscale.app";
  });

  it("returns 410 Gone with error waitlist_closed on POST", async () => {
    const res = await POST(
      postRequest({
        name: "Ana Silva",
        email: "ana@empresa.com",
        sector: "saas",
        whatsapp: "+5511999999999",
      })
    );
    const json = await res.json();

    expect(res.status).toBe(410);
    expect(json).toEqual({ error: "waitlist_closed" });

    // Verify no side-effects occur
    expect(mockRateLimit).not.toHaveBeenCalled();
    expect(mockFindByEmail).not.toHaveBeenCalled();
    expect(mockCreateSignup).not.toHaveBeenCalled();
    expect(mockUpdateResendContactId).not.toHaveBeenCalled();
    expect(mockSyncContact).not.toHaveBeenCalled();
    expect(mockSendConfirmation).not.toHaveBeenCalled();
  });

  it("includes CORS headers on POST when allowed origin is provided", async () => {
    const res = await POST(
      postRequest({ email: "ana@empresa.com" }, "https://example.com")
    );
    expect(res.status).toBe(410);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
  });

  it("returns 204 with CORS headers on OPTIONS", async () => {
    const res = await OPTIONS(optionsRequest("https://example.com"));

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});
