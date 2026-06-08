import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mockFindByEmail = vi.fn();
const mockCreateSignup = vi.fn();
const mockUpdateResendContactId = vi.fn();
const mockSyncContact = vi.fn();
const mockSendConfirmation = vi.fn();
const mockRateLimit = vi.fn();

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

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

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

const validPayload = {
  name: "Ana Silva",
  email: "ana@empresa.com",
  sector: "saas",
  whatsapp: "+55 (11) 99999-9999",
  consent: true,
  locale: "pt-BR",
};

function postRequest(body: unknown) {
  return new Request("http://localhost/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/waitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ success: true });
    mockFindByEmail.mockResolvedValue(null);
    mockCreateSignup.mockResolvedValue({
      id: "w1",
      name: "Ana Silva",
      email: "ana@empresa.com",
      sector: "saas",
    });
    mockSyncContact.mockResolvedValue("contact_1");
    mockSendConfirmation.mockResolvedValue(undefined);
  });

  it("returns 201 when signup is created", async () => {
    const res = await POST(postRequest(validPayload));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json).toEqual({ status: "created" });
    expect(mockCreateSignup).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ana@empresa.com",
        whatsapp: "5511999999999",
        consentVersion: "2026-06-08",
      })
    );
    expect(mockSyncContact).toHaveBeenCalled();
    expect(mockSendConfirmation).toHaveBeenCalledWith({
      to: "ana@empresa.com",
      locale: "pt-BR",
    });
  });

  it("returns 409 when email is already registered", async () => {
    mockFindByEmail.mockResolvedValue({ id: "existing", email: "ana@empresa.com" });

    const res = await POST(postRequest(validPayload));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json).toEqual({
      status: "already_registered",
      message: "duplicateEmail",
    });
    expect(mockCreateSignup).not.toHaveBeenCalled();
  });

  it("returns 400 when consent is false", async () => {
    const res = await POST(postRequest({ ...validPayload, consent: false }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("invalidInput");
    expect(mockCreateSignup).not.toHaveBeenCalled();
  });

  it("returns 201 for honeypot without creating signup", async () => {
    const res = await POST(postRequest({ ...validPayload, website: "https://spam.bot" }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json).toEqual({ status: "created" });
    expect(mockCreateSignup).not.toHaveBeenCalled();
    expect(mockFindByEmail).not.toHaveBeenCalled();
    expect(mockSyncContact).not.toHaveBeenCalled();
    expect(mockSendConfirmation).not.toHaveBeenCalled();
  });
});
