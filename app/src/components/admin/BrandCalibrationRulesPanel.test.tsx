import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
      contentHash: "a".repeat(64),
      confirmedMetadata: null,
      metadataConfirmedBy: null,
      metadataConfirmedAt: null,
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

  it("shows unconfirmed state and records an explicit category, nature, roles and scope", async () => {
    const metadata = { category: "brand_nuance", nature: "text", roles: ["copy", "image_prompt"],
      generationModes: ["single"], formats: ["4:5"], contentHash: "a".repeat(64) };
    mockApiFetch.mockImplementation(async (_url, options) => ({
      ok: true, status: 200,
      json: async () => options?.method === "PATCH" ? { rule: { ...rulesFixture.approved[0],
        confirmedMetadata: metadata, metadataConfirmedBy: "owner-1", metadataConfirmedAt: "2026-10-12T12:00:00Z" } } : rulesFixture,
    } as Response));
    renderPanel();
    expect(await screen.findByText("Não conferida")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Conferir regra" }));
    expect(screen.getByRole("button", { name: "Confirmar conferência" })).toBeDisabled();
    fireEvent.click(screen.getByRole("combobox", { name: "Categoria de conteúdo" }));
    fireEvent.focus(await screen.findByRole("option", { name: "Nuance de marca" }));
    fireEvent.click(await screen.findByRole("option", { name: "Nuance de marca" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Natureza" }));
    fireEvent.focus(await screen.findByRole("option", { name: "Textual" }));
    fireEvent.click(await screen.findByRole("option", { name: "Textual" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Redação" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Prompt de imagem" }));
    fireEvent.change(screen.getByLabelText("Modos de geração"), { target: { value: "single" } });
    fireEvent.change(screen.getByLabelText("Formatos"), { target: { value: "4:5" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar conferência" }));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith(`/api/admin/quality/brands/${CLIENT_PROFILE_ID}/rules`,
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "confirm_metadata", ruleId: "rule-approved-1", metadata }) })));
    expect(await screen.findByText(/Conferida por owner-1/)).toBeInTheDocument();
    expect(screen.getByText(/Textual · Redação, Prompt de imagem/)).toBeInTheDocument();
  });

  it("shows owner-restricted message on 403", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 403 } as Response);

    renderPanel();

    expect(
      await screen.findByText(/restritas a proprietários da plataforma/i)
    ).toBeInTheDocument();
  });

  it("keeps a failed confirmation unconfirmed and displays the server refusal", async () => {
    mockApiFetch.mockImplementation(async (_url, options) => ({
      ok: options?.method !== "PATCH", status: options?.method === "PATCH" ? 403 : 200,
      json: async () => options?.method === "PATCH" ? { code: "forbidden" } : { ...rulesFixture,
        approved: [{ ...rulesFixture.approved[0], confirmedMetadata: { category: "voice", nature: "text", roles: ["copy"],
          generationModes: ["single"], formats: ["4:5"], contentHash: "b".repeat(64) },
          metadataConfirmedBy: "owner-old", metadataConfirmedAt: "2026-10-01T00:00:00Z" }] },
    } as Response));
    renderPanel();
    expect(await screen.findByText("Não conferida")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Conferir regra" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar conferência" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Somente o Dono da plataforma pode conferir regras.");
    expect(screen.getByText("Não conferida")).toBeInTheDocument();
    expect(screen.queryByText(/Conferida por/)).not.toBeInTheDocument();
  });

  it("displays the confirmed visual nature and keeps candidates without confirmation actions", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ...rulesFixture,
      approved: [{ ...rulesFixture.approved[0], confirmedMetadata: { category: "brand_nuance", nature: "visual", roles: ["image_prompt"],
        generationModes: ["single"], formats: ["4:5"], contentHash: "a".repeat(64) },
        metadataConfirmedBy: "owner-1", metadataConfirmedAt: "2026-10-12T12:00:00Z" }] }),
    } as Response);
    renderPanel();
    expect(await screen.findByText(/Conferida por owner-1/)).toBeInTheDocument();
    expect(screen.getByText(/Visual · Prompt de imagem/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Revisar conferência" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Conferir regra" })).not.toBeInTheDocument();
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
