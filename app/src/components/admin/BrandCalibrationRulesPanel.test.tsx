import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrandCalibrationRulesPanel } from "./BrandCalibrationRulesPanel";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

const CLIENT_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440003";

const rulesFixture = {
  clientProfileId: CLIENT_PROFILE_ID,
  workspaceId: "550e8400-e29b-41d4-a716-446655440002",
  approved: [
    {
      id: "rule-approved-1",
      clientProfileId: CLIENT_PROFILE_ID,
      category: "voice" as const,
      status: "approved" as const,
      rationale: "Evitar tom promocional agressivo em headlines de marca premium",
      supportingDecisionIds: ["d1"],
      confidence: "high" as const,
      caveats: [],
      version: 1,
      mismatchBucket: null,
      createdAt: "2026-06-20T00:00:00.000Z",
      approvedAt: "2026-06-21T00:00:00.000Z",
      approvedBy: "owner-1",
    },
  ],
  candidate: [
    {
      id: "rule-candidate-1",
      clientProfileId: CLIENT_PROFILE_ID,
      category: "gestalt" as const,
      status: "candidate" as const,
      rationale: "Reforçar hierarquia visual quando o sistema aprova composições planas",
      supportingDecisionIds: ["d2", "d3"],
      confidence: "medium" as const,
      caveats: ["Amostra pequena"],
      version: 1,
      mismatchBucket: "system_too_permissive" as const,
      createdAt: "2026-06-22T00:00:00.000Z",
      approvedAt: null,
      approvedBy: null,
    },
  ],
};

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BrandCalibrationRulesPanel clientProfileId={CLIENT_PROFILE_ID} />
    </QueryClientProvider>
  );
}

describe("BrandCalibrationRulesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders approved rules table when API returns approved array", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => rulesFixture,
    } as Response);

    renderPanel();

    expect(await screen.findByText("Regras aprovadas")).toBeInTheDocument();
    expect(screen.getByText("voice")).toBeInTheDocument();
    expect(
      screen.getByText(/Evitar tom promocional agressivo/)
    ).toBeInTheDocument();
  });

  it("renders candidate section separately from approved", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => rulesFixture,
    } as Response);

    renderPanel();

    expect(await screen.findByText("Regras pendentes (candidatas)")).toBeInTheDocument();
    expect(screen.getByText("gestalt")).toBeInTheDocument();
    expect(
      screen.getByText(/Reforçar hierarquia visual/)
    ).toBeInTheDocument();
  });

  it("shows owner-restricted message on 403", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 403 } as Response);

    renderPanel();

    expect(
      await screen.findByText(/restritas a proprietários da plataforma/i)
    ).toBeInTheDocument();
  });

  it("shows neutral empty states for empty rule arrays", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...rulesFixture, approved: [], candidate: [] }),
    } as Response);

    renderPanel();

    expect(await screen.findByText("Regras aprovadas")).toBeInTheDocument();
    const emptyMessages = screen.getAllByText(/Nenhuma regra/i);
    expect(emptyMessages.length).toBeGreaterThanOrEqual(2);
  });
  it("opens typed proposal support and shows removed evidence as a limitation", async () => {
    mockApiFetch.mockImplementation(async url => ({
      ok: true, status: 200,
      json: async () => String(url).includes("/evidence?") ? { proposal: {
        id: "rule-candidate-1", kind: "rule", caveats: ["Amostra pequena"], support: [
          { kind: "feedback_artifact", id: "artifact-1", availability: "available", label: "Feedback do corpus", summary: "Regenerar: hierarquia fraca", pieceHref: "/api/admin/quality/brands/brand/evidence?view=piece" },
          { kind: "calibration_signal", id: "signal-2", availability: "removed", label: "Sinal de calibração", summary: null, pieceHref: null },
        ],
      } } : rulesFixture,
    } as Response));
    renderPanel();
    await screen.findByText("Regras pendentes (candidatas)");
    fireEvent.click(screen.getAllByRole("button", { name: "Ver evidências" })[1]);
    expect(await screen.findByText("Regenerar: hierarquia fraca")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir Peça" })).toHaveAttribute("href", "/api/admin/quality/brands/brand/evidence?view=piece");
    expect(screen.getByText("Evidência removida — não foi possível conferir.")).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining(`/${CLIENT_PROFILE_ID}/evidence?proposalKind=rule&proposalId=rule-candidate-1`));
  });

});
