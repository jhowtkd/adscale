import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactVersionPresentation } from "@/lib/assistant/artifact-version";
import VersionComparisonDialog from "./VersionComparisonDialog";

const mocks = vi.hoisted(() => ({
  comparison: vi.fn(),
  acknowledge: vi.fn(),
  promote: vi.fn(),
}));

vi.mock("@/lib/hooks/use-assistant-artifact-versions", () => ({
  ArtifactPromotionConflictError: class extends Error {},
  useAssistantArtifactComparison: (...args: unknown[]) => mocks.comparison(...args),
  useAcknowledgeLinkedPlanComparison: () => mocks.acknowledge(),
  usePromoteAssistantArtifactVersion: () => mocks.promote(),
}));

const ids = {
  lineage: "00000000-0000-4000-8000-000000000001",
  official: "00000000-0000-4000-8000-000000000002",
  target: "00000000-0000-4000-8000-000000000003",
  artifact: "00000000-0000-4000-8000-000000000004",
};

function version(id: string, versionNumber: number, status: string) {
  return {
    id,
    lineageId: ids.lineage,
    versionNumber,
    sourceVersionId: null,
    status,
    snapshot: {
      type: "plan" as const,
      strategy: "Estratégia",
      angles: [],
      hooks: [],
      ctas: [],
      constraints: null,
    },
    provenance: {
      origin: "revision" as const,
      originalArtifactId: ids.artifact,
      sourceVersionId: null,
      messageId: null,
      actionId: null,
      planVersionId: null,
      format: null,
      generationMode: null,
    },
    feedback: versionNumber === 2 ? "Mais direto" : null,
    createdAt: new Date("2026-06-28T12:00:00.000Z"),
  };
}

const lineage: ArtifactVersionPresentation = {
  lineageId: ids.lineage,
  artifactType: "plan",
  approvedCurrent: version(ids.official, 1, "approved"),
  working: version(ids.target, 2, "ready"),
  versions: [version(ids.official, 1, "approved"), version(ids.target, 2, "ready")],
  pendingProposals: [],
  generationStatus: null,
};

const request = {
  threadId: "thread-1",
  lineageId: ids.lineage,
  artifactType: "plan" as const,
  versionAId: ids.official,
  versionBId: ids.target,
};

describe("VersionComparisonDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.comparison.mockReturnValue({
      data: {
        type: "plan",
        headRevision: 4,
        versionA: { versionNumber: 1, status: "approved", createdAt: new Date(), feedback: null },
        versionB: { versionNumber: 2, status: "ready", createdAt: new Date(), feedback: "Mais direto" },
        fields: [
          {
            field: "hooks",
            label: "Ganchos",
            changed: true,
            changes: [{ kind: "edit", before: "Antes", after: "Depois", beforeIndex: 0, afterIndex: 0 }],
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.acknowledge.mockReturnValue({ mutateAsync: vi.fn(), isPending: false, reset: vi.fn() });
    mocks.promote.mockReturnValue({ mutateAsync: vi.fn(), isPending: false, reset: vi.fn() });
  });

  it("shows semantic changes and requires an explicit no-credit confirmation", async () => {
    const promote = vi.fn().mockResolvedValue({ effect: {}, state: [] });
    mocks.promote.mockReturnValue({ mutateAsync: promote, isPending: false, reset: vi.fn() });

    render(
      <VersionComparisonDialog open request={request} lineages={[lineage]} onOpenChange={vi.fn()} />
    );

    expect(screen.getByText("Editado")).toBeInTheDocument();
    expect(screen.getByText("Antes")).toBeInTheDocument();
    expect(screen.getByText("Depois")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aprovar v2" }));
    expect(screen.getByText(/não usa créditos e não exclui nenhuma versão/i)).toBeInTheDocument();
    expect(promote).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Tornar v2 oficial" }));
    expect(promote).toHaveBeenCalledTimes(1);
  });

  it("confirms the first official version from an empty official head", () => {
    const promote = vi.fn().mockResolvedValue({ effect: {}, state: [] });
    mocks.promote.mockReturnValue({ mutateAsync: promote, isPending: false, reset: vi.fn() });
    const firstApprovalLineage = { ...lineage, approvedCurrent: null };

    render(
      <VersionComparisonDialog
        open
        request={request}
        lineages={[firstApprovalLineage]}
        onOpenChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Aprovar v2" }));
    expect(screen.getByText("A versão oficial muda de nenhuma para v2.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tornar v2 oficial" }));
    expect(promote).toHaveBeenCalledWith(
      expect.objectContaining({ expectedOfficialVersionId: null })
    );
  });

  it("keeps the workspace open and announces a conflict without retrying", async () => {
    const conflict = Object.assign(new Error("conflict"), {
      recovery: {
        previousOfficialLabel: "v1",
        currentOfficialLabel: "v3",
        message: "mudou",
        state: [lineage],
      },
    });
    Object.setPrototypeOf(conflict, (await import("@/lib/hooks/use-assistant-artifact-versions")).ArtifactPromotionConflictError.prototype);
    const promote = vi.fn().mockRejectedValue(conflict);
    mocks.promote.mockReturnValue({ mutateAsync: promote, isPending: false, reset: vi.fn() });
    const onOpenChange = vi.fn();

    render(
      <VersionComparisonDialog open request={request} lineages={[lineage]} onOpenChange={onOpenChange} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Aprovar v2" }));
    fireEvent.click(screen.getByRole("button", { name: "Tornar v2 oficial" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A versão oficial mudou enquanto você comparava"
    );
    expect(screen.getByText(/Antes: v1. Agora: v3/)).toBeInTheDocument();
    expect(promote).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("blocks dismissal and duplicate submission while promotion is pending", () => {
    mocks.promote.mockReturnValue({ mutateAsync: vi.fn(), isPending: true, reset: vi.fn() });
    const onOpenChange = vi.fn();
    render(
      <VersionComparisonDialog open request={request} lineages={[lineage]} onOpenChange={onOpenChange} />
    );

    expect(
      screen.getAllByRole("button", { name: "Fechar comparação" })
    ).toEqual(expect.arrayContaining([expect.objectContaining({ disabled: true })]));
    expect(screen.getByRole("button", { name: "Aprovar v2" })).toBeDisabled();
  });
});
