import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useReviewDerivation,
  validateReviewDerivationInput,
  type ReviewDerivationVariables,
} from "./use-review";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, string>) => {
    if (values?.min) return `${key}:${values.min}`;
    if (namespace === "toast") {
      const toastMessages: Record<string, string> = {
        derivationApproved: "approved",
        derivationRejected: "rejected",
        derivationQuaseRegenerar: "quase",
        statusUpdateFailed: "failed",
      };
      return toastMessages[key] ?? key;
    }
    return key;
  },
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/store", () => ({
  useAppStore: (selector: (state: { addToast: typeof addToast }) => unknown) =>
    selector({ addToast }),
}));

import { apiFetch } from "@/lib/api-client";

const addToast = vi.fn();
const mockApiFetch = vi.mocked(apiFetch);

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("validateReviewDerivationInput", () => {
  const translate = (key: string, values?: Record<string, string>) =>
    values?.min ? `${key}:${values.min}` : key;

  it("requires direction reason for nao_entra and quase_regenerar", () => {
    expect(() =>
      validateReviewDerivationInput({ decision: "nao_entra" }, translate)
    ).toThrow("directionReasonRequired:8");
    expect(() =>
      validateReviewDerivationInput(
        { decision: "quase_regenerar", directionReason: "short" },
        translate
      )
    ).toThrow("directionReasonRequired:8");
  });

  it("allows entra without direction reason", () => {
    expect(() =>
      validateReviewDerivationInput({ decision: "entra" }, translate)
    ).not.toThrow();
  });
});

describe("useReviewDerivation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ derivation: { campaignId: "campaign-1" } }),
    } as Response);
  });

  it("sends legacy status payload for existing callers", async () => {
    const { result } = renderHook(() => useReviewDerivation("derivation-1"), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ status: "approved" });
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/derivations/derivation-1/review",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "approved" }),
      })
    );
    expect(addToast).toHaveBeenCalledWith("success", "approved");
  });

  it("maps entra decision to approved payload", async () => {
    const { result } = renderHook(() => useReviewDerivation(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "derivation-2", decision: "entra" });
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/derivations/derivation-2/review",
      expect.objectContaining({
        body: JSON.stringify({ status: "approved", decision: "entra" }),
      })
    );
  });

  it("maps nao_entra with direction reason to rejected payload", async () => {
    const { result } = renderHook(() => useReviewDerivation(), {
      wrapper: createWrapper(),
    });

    const variables: ReviewDerivationVariables = {
      id: "derivation-3",
      decision: "nao_entra",
      directionReason: "Simplify the lower third and strengthen the invite.",
    };

    await act(async () => {
      await result.current.mutateAsync(variables);
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/derivations/derivation-3/review",
      expect.objectContaining({
        body: JSON.stringify({
          status: "rejected",
          decision: "nao_entra",
          directionReason: "Simplify the lower third and strengthen the invite.",
        }),
      })
    );
    expect(addToast).toHaveBeenCalledWith("success", "rejected");
  });

  it("maps quase_regenerar to rejected payload with direction reason", async () => {
    const { result } = renderHook(() => useReviewDerivation(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: "derivation-4",
        decision: "quase_regenerar",
        directionReason: "Push the figure larger and calm the lower third.",
      });
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/derivations/derivation-4/review",
      expect.objectContaining({
        body: JSON.stringify({
          status: "rejected",
          decision: "quase_regenerar",
          directionReason: "Push the figure larger and calm the lower third.",
        }),
      })
    );
    expect(addToast).toHaveBeenCalledWith("success", "quase");
  });

  it("surfaces validation errors before calling the API", async () => {
    const { result } = renderHook(() => useReviewDerivation("derivation-5"), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ decision: "nao_entra" })
      ).rejects.toThrow("directionReasonRequired:8");
    });

    await waitFor(() => {
      expect(mockApiFetch).not.toHaveBeenCalled();
      expect(addToast).toHaveBeenCalledWith("error", "directionReasonRequired:8");
    });
  });
});
