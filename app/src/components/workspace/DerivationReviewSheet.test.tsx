import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ComponentProps } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DerivationReviewSheet from "./DerivationReviewSheet";

const errorMessages: Record<string, string> = {
  missing_client_profile: "Assign a client profile first",
  duplicate_corpus_item: "Already in corpus queue",
  corpusAddFailed: "Could not add to corpus",
  corpusMissingContext: "Missing context",
};

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, string>) => {
    if (namespace === "errors") {
      return errorMessages[key] ?? key;
    }
    if (values?.name) return `${key}:${values.name}`;
    return key;
  },
}));

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <img alt={props.alt} />,
}));

vi.mock("@/components/feedback/ContextualFeedbackButton", () => ({
  default: () => null,
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

const addToast = vi.fn();

vi.mock("@/lib/store", () => ({
  useAppStore: (selector: (state: { addToast: typeof addToast }) => unknown) =>
    selector({ addToast }),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

const derivation = {
  id: "derivation-1",
  campaignId: "campaign-1",
  name: "Test Derivation",
  status: "completed" as const,
  platform: "Meta" as const,
  prompt: "Test prompt",
  creditCost: 2.4,
  imageUrl: "/test.png",
  outputKey: "outputs/test.png",
  format: "4:5",
  generationMode: "format_adaptation" as const,
  qualityVerdict: "invalid" as const,
  hardFailures: [{ code: "cta_drift", message: "CTA not visible" }],
  createdAt: new Date(),
};

function renderSheet(overrides: Partial<ComponentProps<typeof DerivationReviewSheet>> = {}) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DerivationReviewSheet
        open
        derivation={derivation}
        workspaceId="workspace-1"
        campaignId="campaign-1"
        clientProfileId="client-profile-1"
        onOpenChange={vi.fn()}
        onRegenerateWithFixes={vi.fn()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        {...overrides}
      />
    </QueryClientProvider>
  );
}

describe("DerivationReviewSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders contract and quality panels for a derivation", () => {
    renderSheet();

    expect(screen.getByText("reviewTitle:Test Derivation")).toBeInTheDocument();
    expect(screen.getByText("contractPanelTitle")).toBeInTheDocument();
    expect(screen.getByText("qualityPanelTitle")).toBeInTheDocument();
    expect(screen.getByText("hardFailureCodes.cta_drift")).toBeInTheDocument();
    expect(screen.getByText("CTA not visible")).toBeInTheDocument();
    expect(screen.getByText("blockingFailureHint")).toBeInTheDocument();
    expect(screen.getByText("generationMode.format_adaptation")).toBeInTheDocument();
  });

  it("shows add-to-corpus action for completed derivations with workspace context", () => {
    renderSheet();

    expect(screen.getByRole("button", { name: "addToCorpus" })).toBeInTheDocument();
  });

  it("keeps add-to-corpus enabled so the backend can resolve workspace profile context", () => {
    renderSheet({ clientProfileId: null, campaignClient: null });

    const button = screen.getByRole("button", { name: "addToCorpus" });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("title");
  });

  it("confirms corpus selection discreetly on success", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ item: { id: "item-1" } }),
    } as Response);

    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "addToCorpus" }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/feedback/human-quality-corpus",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            workspaceId: "workspace-1",
            campaignId: "campaign-1",
            derivationId: "derivation-1",
          }),
        })
      );
    });

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith("success", "corpusAddSuccess");
    });
  });

  it("surfaces duplicate corpus selection as a discreet error toast", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "duplicate", code: "duplicate_corpus_item" }),
    } as Response);

    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "addToCorpus" }));

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith("error", "Already in corpus queue");
    });
  });

  it("surfaces missing client profile API errors clearly", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: "generic",
        code: "missing_client_profile",
      }),
    } as Response);

    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "addToCorpus" }));

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith("error", "Assign a client profile first");
    });
  });

  it("translates legacy corpus API errors that return the code in error", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "missing_client_profile" }),
    } as Response);

    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "addToCorpus" }));

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith("error", "Assign a client profile first");
    });
  });
});
