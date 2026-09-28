import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BatchApprovalDialog from "./BatchApprovalDialog";
import type { PipelineItemJson } from "@/lib/equipe/api";

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = ((key: string, values?: Record<string, unknown>) => {
      let out = key;
      for (const [k, v] of Object.entries(values ?? {})) out = out.replace(`{${k}}`, String(v));
      return out;
    }) as ((key: string, values?: Record<string, unknown>) => string) & {
      has: () => boolean;
    };
    t.has = () => true;
    return t;
  },
  useLocale: () => "pt-BR",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const { approveBatchMock } = vi.hoisted(() => ({ approveBatchMock: vi.fn() }));

vi.mock("@/lib/equipe/commands", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/equipe/commands")>();
  return { ...original, approveEquipeBatch: approveBatchMock };
});

function detailFor(itemId: string, hash: string, caption: string) {
  return {
    data: {
      item: { id: itemId, currentVersionHash: hash },
      batch: { id: "batch-1", title: "Batch 1" },
      versions: [{ versionHash: hash, caption }],
    },
  };
}

vi.mock("@/lib/equipe/use-equipe", () => ({
  useEquipeItemDetail: (_accountId: string, itemId: string | null) =>
    itemId ? detailFor(itemId, `hash-${itemId}`, `Caption ${itemId}`) : { data: undefined },
  useInvalidateEquipe: () => () => {},
}));

function view(itemId: string, displayState: string): PipelineItemJson {
  return {
    item: {
      id: itemId,
      frontId: "front-1",
      batchId: "batch-1",
      creativeWorkId: null,
      status: "awaiting_approval",
      scheduledFor: "2026-11-23T12:00:00.000Z",
      deadlineAt: null,
      destination: "@cafeaurora",
      currentVersionHash: `hash-${itemId}`,
      publishedOutputId: null,
      createdAt: "2026-11-16T00:00:00.000Z",
      updatedAt: "2026-11-16T00:00:00.000Z",
    },
    batch: null,
    displayState,
    review: {
      flags: { blocked: false, editedInReview: false, editWarning: false, needsConfirmation: false },
      status: displayState,
      batchApprovable: displayState === "ready",
      triage: null,
    },
  };
}

function renderDialog(items: PipelineItemJson[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BatchApprovalDialog accountId="acc-1" items={items} open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe("BatchApprovalDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts only ready items and excludes the rest with reasons", () => {
    renderDialog([view("a", "ready"), view("b", "ready"), view("c", "blocked")]);
    expect(screen.getByTestId("batch-approve-ready")).toHaveTextContent("approveReady");
    fireEvent.click(screen.getByTestId("batch-approve-ready"));
    expect(screen.getByTestId("batch-excluded")).toBeInTheDocument();
    expect(screen.getByTestId("batch-excluded-c")).toHaveTextContent("blocked");
    expect(screen.queryByTestId("batch-excluded-a")).not.toBeInTheDocument();
  });

  it("confirms the closed list of {itemId, versionHash} and shows per-item results", async () => {
    approveBatchMock.mockResolvedValueOnce({
      results: [
        { itemId: "a", outcome: "approved", receiptId: "r1" },
        { itemId: "b", outcome: "changed_since_opened" },
      ],
    });
    renderDialog([view("a", "ready"), view("b", "ready"), view("c", "needs_confirmation")]);

    fireEvent.click(screen.getByTestId("batch-approve-ready"));
    fireEvent.click(screen.getByTestId("batch-confirm"));

    await waitFor(() => {
      expect(approveBatchMock).toHaveBeenCalledWith("acc-1", [
        { itemId: "a", versionHash: "hash-a" },
        { itemId: "b", versionHash: "hash-b" },
      ]);
    });
    expect(screen.getByTestId("batch-result-a")).toHaveAttribute("data-outcome", "approved");
    expect(screen.getByTestId("batch-result-b")).toHaveAttribute(
      "data-outcome",
      "changed_since_opened",
    );
    // The stale item goes back to individual review; the approved one does not.
    expect(screen.getByTestId("batch-rereview-b")).toHaveAttribute(
      "href",
      "/pipeline?account=acc-1&item=b",
    );
    expect(screen.queryByTestId("batch-rereview-a")).not.toBeInTheDocument();
  });

  it("disables batch approval when nothing is ready", () => {
    renderDialog([view("c", "blocked")]);
    expect(screen.getByTestId("batch-approve-ready")).toBeDisabled();
  });
});
