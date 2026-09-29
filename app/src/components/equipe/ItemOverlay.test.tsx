import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ItemOverlay from "./ItemOverlay";
import { EquipeCommandError } from "@/lib/equipe/commands";
import type { ItemDetailJson } from "@/lib/equipe/api";

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

const { commandMocks } = vi.hoisted(() => ({
  commandMocks: {
    approveEquipeItem: vi.fn(),
    cancelEquipeScheduled: vi.fn(),
    confirmEquipeBusinessFact: vi.fn(),
    declineEquipePublish: vi.fn(),
    editEquipeCaption: vi.fn(),
    reportEquipeItemProblem: vi.fn(),
    requestEquipeAdjustment: vi.fn(),
  },
}));

vi.mock("@/lib/equipe/commands", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/equipe/commands")>();
  return { ...original, ...commandMocks };
});

let detailFixture: ItemDetailJson;

vi.mock("@/lib/equipe/use-equipe", () => ({
  useEquipeItemDetail: () => ({ data: detailFixture, isLoading: false, error: null, refetch: vi.fn() }),
  useInvalidateEquipe: () => () => {},
}));

function baseDetail(overrides: Partial<ItemDetailJson> = {}): ItemDetailJson {
  return {
    workspaceId: "ws-1",
    accountId: "acc-1",
    item: {
      id: "item-1",
      frontId: "front-1",
      batchId: "batch-1",
      creativeWorkId: "work-1",
      status: "awaiting_approval",
      scheduledFor: "2026-11-25T12:00:00.000Z",
      deadlineAt: null,
      destination: "@cafeaurora",
      currentVersionHash: "hash-v2",
      publishedOutputId: null,
      createdAt: "2026-11-16T00:00:00.000Z",
      updatedAt: "2026-11-16T00:00:00.000Z",
    },
    batch: {
      id: "batch-1",
      frontId: "front-1",
      title: "Batch 1",
      status: "delivered",
      approveByAt: "2026-11-19T17:00:00.000Z",
      deliveredAt: null,
      createdAt: "2026-11-16T00:00:00.000Z",
      updatedAt: "2026-11-16T00:00:00.000Z",
    },
    versions: [
      {
        id: "ver-1",
        itemId: "item-1",
        versionHash: "hash-v1",
        creativeWorkOutputId: "out-1",
        caption: "First caption",
        scheduledFor: "2026-11-25T12:00:00.000Z",
        destination: "@cafeaurora",
        authorRole: "agent",
        authorId: null,
        reviewerFindings: null,
        createdAt: "2026-11-16T00:00:00.000Z",
      },
      {
        id: "ver-2",
        itemId: "item-1",
        versionHash: "hash-v2",
        creativeWorkOutputId: "out-1",
        caption: "Full caption text here",
        scheduledFor: "2026-11-25T12:00:00.000Z",
        destination: "@cafeaurora",
        authorRole: "client_person",
        authorId: "person-1",
        reviewerFindings: null,
        createdAt: "2026-11-17T00:00:00.000Z",
      },
    ],
    receipts: [
      {
        id: "rc-1",
        personKind: "client_person",
        personId: "person-1",
        personRole: "approver",
        objectType: "item",
        objectId: "item-1",
        objectVersion: "hash-v2",
        action: "confirm_business_fact",
        detail: null,
        createdAt: "2026-11-17T01:00:00.000Z",
      },
    ],
    review: {
      flags: { blocked: false, editedInReview: false, editWarning: false, needsConfirmation: false },
      status: "ready",
      batchApprovable: true,
      triage: null,
    },
    destinationAccount: "@cafeaurora",
    findings: [
      { versionHash: "hash-v1", findings: {} },
      { versionHash: "hash-v2", findings: {} },
    ],
    triage: [],
    activeIntent: null,
    ...overrides,
  };
}

function renderOverlay() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ItemOverlay accountId="acc-1" itemId="item-1" open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe("ItemOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    detailFixture = baseDetail();
    for (const mock of Object.values(commandMocks)) mock.mockResolvedValue({});
  });

  it("shows image, caption, destination, version and receipts", () => {
    renderOverlay();
    expect(screen.getByTestId("item-overlay-image")).toHaveAttribute(
      "src",
      "/api/creative-work/work-1/outputs/out-1/download",
    );
    expect(screen.getByTestId("item-overlay-caption")).toHaveTextContent("Full caption text here");
    expect(screen.getByTestId("item-overlay-caption")).toBeInTheDocument();
    expect(screen.getByText("@cafeaurora")).toBeInTheDocument();
    expect(screen.getByTestId("receipt-rc-1")).toBeInTheDocument();
    expect(screen.getByTestId("item-overlay-history")).toHaveTextContent("history");
  });

  it("shows the reconnect and reapproval warning for a changed Instagram destination", () => {
    detailFixture = baseDetail({
      activeIntent: {
        id: "intent-1", status: "held", versionHash: "hash-v2", scheduledFor: null,
        lastError: "instagram_destination_changed",
      },
    });
    renderOverlay();
    expect(screen.getByText("instagramDestinationChanged")).toBeInTheDocument();
  });

  it("approves the exact version seen", async () => {
    renderOverlay();
    fireEvent.click(screen.getByTestId("item-approve"));
    await waitFor(() => {
      expect(commandMocks.approveEquipeItem).toHaveBeenCalledWith("acc-1", {
        itemId: "item-1",
        versionHash: "hash-v2",
      });
    });
  });

  it.each([null, "ig-brand"])("explains manual publication only for a version without a destination pin (%s)", (pin) => {
    detailFixture.item.status = "awaiting_approval";
    detailFixture.versions = detailFixture.versions.map((version) => ({
      ...version, destination: "instagram:@brand", destinationIgUserId: pin,
    }));
    renderOverlay();
    if (pin) expect(screen.queryByTestId("item-prepared-before-connection")).not.toBeInTheDocument();
    else expect(screen.getByTestId("item-prepared-before-connection")).toHaveTextContent("preparedBeforeConnection");
  });

  it("tells the client to review again on a stale version", async () => {
    commandMocks.approveEquipeItem.mockRejectedValueOnce(
      new EquipeCommandError("stale", 409, "version_mismatch"),
    );
    renderOverlay();
    fireEvent.click(screen.getByTestId("item-approve"));
    await waitFor(() => {
      expect(screen.getByTestId("item-action-error")).toHaveTextContent("versionMismatch");
    });
  });

  it("edits the caption as a new version", async () => {
    const view = renderOverlay();
    fireEvent.click(screen.getByTestId("item-edit-toggle"));
    detailFixture = baseDetail({
      item: { ...baseDetail().item, status: "scheduled", currentVersionHash: "hash-v3" },
    });
    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ItemOverlay accountId="acc-1" itemId="item-1" open onOpenChange={() => {}} />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByTestId("item-edit-caption"), {
      target: { value: "Edited caption" },
    });
    fireEvent.click(screen.getByTestId("item-edit-save"));
    await waitFor(() => {
      expect(commandMocks.editEquipeCaption).toHaveBeenCalledWith("acc-1", {
        itemId: "item-1",
        expectedVersionHash: "hash-v2",
        expectedStatus: "awaiting_approval",
        caption: "Edited caption",
      });
    });
  });

  it("requests adjustments with a category", async () => {
    renderOverlay();
    fireEvent.click(screen.getByTestId("item-adjust-toggle"));
    fireEvent.change(screen.getByTestId("item-adjust-category"), { target: { value: "brand" } });
    fireEvent.change(screen.getByTestId("item-adjust-note"), { target: { value: "off-voice" } });
    fireEvent.click(screen.getByTestId("item-adjust-send"));
    await waitFor(() => {
      expect(commandMocks.requestEquipeAdjustment).toHaveBeenCalledWith("acc-1", {
        itemId: "item-1",
        expectedVersionHash: "hash-v2",
        expectedStatus: "awaiting_approval",
        category: "brand",
        note: "off-voice",
      });
    });
  });

  it("declines with a reason and cancels scheduled items", async () => {
    const view = renderOverlay();
    fireEvent.click(screen.getByTestId("item-decline-toggle"));
    expect(screen.getByTestId("item-decline-send")).toBeDisabled();
    fireEvent.change(screen.getByTestId("item-decline-reason"), { target: { value: "off-topic" } });
    fireEvent.click(screen.getByTestId("item-decline-send"));
    await waitFor(() => {
      expect(commandMocks.declineEquipePublish).toHaveBeenCalledWith("acc-1", {
        itemId: "item-1",
        expectedVersionHash: "hash-v2",
        expectedStatus: "awaiting_approval",
        reason: "off-topic",
      });
    });
    detailFixture = baseDetail({
      item: { ...baseDetail().item, status: "scheduled" },
    });
    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ItemOverlay accountId="acc-1" itemId="item-1" open onOpenChange={() => {}} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId("item-cancel-toggle"));
    fireEvent.click(screen.getByTestId("item-cancel-send"));
    await waitFor(() => {
      expect(commandMocks.cancelEquipeScheduled).toHaveBeenCalledWith("acc-1", {
        itemId: "item-1",
        expectedVersionHash: "hash-v2",
        expectedStatus: "scheduled",
      });
    });
  });

  it("confirms a permanent fact before approving", async () => {
    detailFixture = baseDetail({
      review: {
        flags: { blocked: false, editedInReview: false, editWarning: false, needsConfirmation: true },
        status: "needs_confirmation",
        batchApprovable: false,
        triage: {
          versionHash: "hash-v2",
          natures: ["permanent_fact"],
          path: "confirm_as_business_fact",
          warnings: ["Store hours changed"],
          qualityRecheckPending: false,
        },
      },
    });
    renderOverlay();
    expect(screen.getByTestId("item-overlay-warnings")).toHaveTextContent("Store hours changed");
    fireEvent.click(screen.getByTestId("item-confirm-fact"));
    await waitFor(() => {
      expect(commandMocks.confirmEquipeBusinessFact).toHaveBeenCalledWith("acc-1", {
        itemId: "item-1",
        expectedVersionHash: "hash-v2",
      });
    });
  });

  it("hides approval for blocked items but keeps reporting", () => {
    detailFixture = baseDetail({
      review: {
        flags: { blocked: true, editedInReview: false, editWarning: false, needsConfirmation: false },
        status: "blocked",
        batchApprovable: false,
        triage: null,
      },
    });
    renderOverlay();
    expect(screen.queryByTestId("item-approve")).not.toBeInTheDocument();
    expect(screen.getByTestId("item-report-toggle")).toBeInTheDocument();
  });
});
