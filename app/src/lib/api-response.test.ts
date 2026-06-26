import { afterEach, describe, expect, it, vi } from "vitest";

// Mock next-intl/server so we can simulate the "missing key" behaviour
// (next-intl returns the raw key path when a key is absent) without pulling
// in the real i18n runtime.
const translateMock = vi.fn<(key: string) => string>();

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => translateMock),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/server/auth/errors", () => ({
  AUTH_ERROR_CODES: {
    unauthorized: "unauthorized",
    noWorkspace: "noWorkspace",
    forbidden: "forbidden",
  },
  isWorkspaceAuthError: () => false,
}));

import { apiError } from "@/lib/api-response";

afterEach(() => {
  translateMock.mockReset();
});

describe("apiError fallback hardening", () => {
  it("returns the translated message when the key exists", async () => {
    translateMock.mockImplementation((key: string) =>
      key === "campaignNotFound" ? "Campanha não encontrada" : key
    );

    const res = await apiError("campaignNotFound", 404);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Campanha não encontrada");
    expect(body.code).toBe("campaignNotFound");
  });

  it("falls back to errors.generic when the key is missing (raw key path returned)", async () => {
    // Simulate next-intl's missing-key behaviour: it returns the requested
    // key path verbatim. For a key under the "errors" namespace this would
    // be "errors.<code>" — which must never leak to clients.
    translateMock.mockImplementation((key: string) => {
      if (key === "generic") return "Algo deu errado. Tente novamente.";
      return `errors.${key}`;
    });

    const res = await apiError("thisKeyDoesNotExist", 500);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Algo deu errado. Tente novamente.");
    expect(body.error).not.toContain("thisKeyDoesNotExist");
    expect(body.code).toBe("thisKeyDoesNotExist");
  });

  it("falls back to errors.unknown when both the requested key and errors.generic are missing", async () => {
    translateMock.mockImplementation((key: string) => {
      if (key === "unknown") return "Erro desconhecido. Tente novamente.";
      return `errors.${key}`;
    });

    const res = await apiError("thisKeyDoesNotExist", 500);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Erro desconhecido. Tente novamente.");
  });

  it("returns a static fallback when every i18n lookup fails", async () => {
    translateMock.mockImplementation((key: string) => `errors.${key}`);

    const res = await apiError("thisKeyDoesNotExist", 500);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Unknown error");
  });
});
