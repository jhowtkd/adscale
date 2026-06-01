import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useBootstrapNewCampaign } from "./use-bootstrap-new-campaign";

const mutateMock = vi.fn();
const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    if (key === "new") return "Nova campanha";
    if (key === "bootstrapDraftClient") return "A definir";
    return key;
  },
}));

vi.mock("@/lib/hooks/use-campaigns", () => ({
  useCreateCampaign: () => ({
    mutate: mutateMock,
    isPending: false,
    isError: false,
    isSuccess: false,
  }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient();
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useBootstrapNewCampaign", () => {
  beforeEach(() => {
    mutateMock.mockClear();
    replaceMock.mockClear();
  });

  it("creates a campaign when campaignId is new", async () => {
    renderHook(() => useBootstrapNewCampaign("new"), { wrapper });

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalledTimes(1);
    });

    expect(mutateMock).toHaveBeenCalledWith(
      { name: "Nova campanha", client: "A definir" },
      expect.objectContaining({
        onSuccess: expect.any(Function),
      })
    );
  });

  it("does not create when campaignId is a uuid", () => {
    renderHook(
      () => useBootstrapNewCampaign("550e8400-e29b-41d4-a716-446655440000"),
      { wrapper }
    );

    expect(mutateMock).not.toHaveBeenCalled();
  });
});
