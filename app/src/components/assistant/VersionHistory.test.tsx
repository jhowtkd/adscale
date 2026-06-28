import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactVersionPresentation } from "@/lib/assistant/artifact-version";
import { AssistantSurfaceProvider, useAssistantSurface } from "./AssistantSurfaceContext";
import AssistantContextPanel from "./AssistantContextPanel";
import VersionHistory from "./VersionHistory";

const hookMocks = vi.hoisted(() => ({ useAssistantThread: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/lib/hooks/use-assistant-threads", () => ({
  useAssistantThread: hookMocks.useAssistantThread,
}));
vi.mock("./AssistantReviewPanel", () => ({
  default: () => <section data-testid="assistant-review-panel" />,
}));

const ids = {
  planLineage: "00000000-0000-4000-8000-000000000001",
  official: "00000000-0000-4000-8000-000000000002",
  working: "00000000-0000-4000-8000-000000000003",
  previous: "00000000-0000-4000-8000-000000000004",
  artifact: "00000000-0000-4000-8000-000000000005",
  creativeLineage: "00000000-0000-4000-8000-000000000006",
  creativeOfficial: "00000000-0000-4000-8000-000000000007",
  creativeWorking: "00000000-0000-4000-8000-000000000008",
};

function planVersion(
  id: string,
  versionNumber: number,
  status = "ready",
  feedback: string | null = null
) {
  return {
    id,
    lineageId: ids.planLineage,
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
    feedback,
    createdAt: new Date(`2026-06-2${versionNumber}T12:00:00.000Z`),
  };
}

const planLineage: ArtifactVersionPresentation = {
  lineageId: ids.planLineage,
  artifactType: "plan",
  approvedCurrent: planVersion(ids.official, 2, "approved"),
  working: planVersion(ids.working, 3, "ready", "Mais direto"),
  versions: [
    {
      ...planVersion(ids.previous, 1, "ready", "Primeira direção"),
      previouslyApproved: true,
    },
    planVersion(ids.official, 2, "approved"),
    planVersion(ids.working, 3, "ready", "Mais direto"),
  ],
  pendingProposals: [],
  generationStatus: null,
};

const creativeLineage: ArtifactVersionPresentation = {
  lineageId: ids.creativeLineage,
  artifactType: "creative",
  approvedCurrent: {
    ...planVersion(ids.creativeOfficial, 1, "approved"),
    lineageId: ids.creativeLineage,
  },
  working: {
    ...planVersion(ids.creativeWorking, 2),
    lineageId: ids.creativeLineage,
  },
  versions: [
    { ...planVersion(ids.creativeOfficial, 1, "approved"), lineageId: ids.creativeLineage },
    { ...planVersion(ids.creativeWorking, 2), lineageId: ids.creativeLineage },
  ],
  pendingProposals: [],
  generationStatus: null,
};

function RequestProbe() {
  const { versionComparisonRequest } = useAssistantSurface();
  if (!versionComparisonRequest) return null;
  return (
    <output data-testid="comparison-request">
      {JSON.stringify(versionComparisonRequest)}
    </output>
  );
}

function renderHistory(
  lineages: ArtifactVersionPresentation[],
  isLoading = false,
  withProbe = false
) {
  return render(
    <AssistantSurfaceProvider>
      <VersionHistory threadId="thread-1" lineages={lineages} isLoading={isLoading} />
      {withProbe ? <RequestProbe /> : null}
    </AssistantSurfaceProvider>
  );
}

describe("VersionHistory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses stable skeleton rows and approved empty copy", () => {
    const { rerender } = render(
      <AssistantSurfaceProvider>
        <VersionHistory threadId="thread-1" lineages={[]} isLoading />
      </AssistantSurfaceProvider>
    );
    expect(screen.getAllByTestId("version-history-skeleton")).toHaveLength(3);

    rerender(
      <AssistantSurfaceProvider>
        <VersionHistory threadId="thread-1" lineages={[]} isLoading={false} />
      </AssistantSurfaceProvider>
    );
    expect(screen.getByText("Ainda não há versões para comparar")).toBeInTheDocument();
    expect(screen.getByText(/As revisões confirmadas aparecerão aqui/)).toBeInTheDocument();
  });

  it("renders newest-first semantic labels without internal ids", () => {
    renderHistory([planLineage]);
    const rows = screen.getAllByRole("listitem");

    expect(within(rows[0]!).getByText("v3")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Em trabalho")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Oficial")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Oficial anteriormente")).toBeInTheDocument();
    expect(screen.getByText("Mais direto")).toBeInTheDocument();
    expect(screen.queryByText(ids.planLineage)).not.toBeInTheDocument();
    expect(screen.queryByText(ids.working)).not.toBeInTheDocument();
  });

  it("opens only the distinct official and working pair", () => {
    renderHistory([planLineage], false, true);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Comparar oficial e versão em trabalho",
      })
    );

    expect(screen.getByTestId("comparison-request")).toHaveTextContent(
      JSON.stringify({
        threadId: "thread-1",
        lineageId: ids.planLineage,
        artifactType: "plan",
        versionAId: ids.official,
        versionBId: ids.working,
      })
    );
  });

  it("keeps lineage options isolated", () => {
    renderHistory([planLineage, creativeLineage], false, true);
    fireEvent.change(screen.getByRole("combobox", { name: "Linha do artefato" }), {
      target: { value: ids.creativeLineage },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Comparar oficial e versão em trabalho",
      })
    );

    const request = screen.getByTestId("comparison-request");
    expect(request).toHaveTextContent(ids.creativeLineage);
    expect(request).toHaveTextContent(ids.creativeOfficial);
    expect(request).toHaveTextContent(ids.creativeWorking);
    expect(request).not.toHaveTextContent(ids.working);
  });

  it("disables comparison and explains a one-version state", () => {
    renderHistory([
      {
        ...planLineage,
        working: planLineage.approvedCurrent,
        versions: [planLineage.approvedCurrent!],
      },
    ]);

    expect(
      screen.getByRole("button", {
        name: "Comparar oficial e versão em trabalho",
      })
    ).toBeDisabled();
    expect(
      screen.getByText("Crie ou selecione outra versão para comparar.")
    ).toBeInTheDocument();
  });

  it("mounts history after review and before job status without another fetch", () => {
    hookMocks.useAssistantThread.mockReturnValue({
      data: {
        thread: { campaignId: "campaign-1" },
        messages: [],
        artifactVersionState: { lineages: [planLineage] },
      },
      isLoading: false,
    });
    render(
      <AssistantSurfaceProvider>
        <AssistantContextPanel threadId="thread-1" />
      </AssistantSurfaceProvider>
    );

    const review = screen.getByTestId("assistant-review-panel");
    const history = screen.getByTestId("version-history");
    const jobs = screen.getByTestId("context-job-status");
    expect(review.compareDocumentPosition(history)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(history.compareDocumentPosition(jobs)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(hookMocks.useAssistantThread).toHaveBeenCalledTimes(1);
  });
});
