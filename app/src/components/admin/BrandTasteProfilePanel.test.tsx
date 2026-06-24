import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrandTasteProfilePanel } from "./BrandTasteProfilePanel";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

const CLIENT_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440003";

const profileFixture = {
  clientProfileId: CLIENT_PROFILE_ID,
  workspaceId: "550e8400-e29b-41d4-a716-446655440002",
  evidenceLevel: "seed_calibrated" as const,
  sourceComposition: {
    synthetic_fixture: 5,
    operator_imported: 2,
    real_customer: 0,
  },
  positivePatterns: [
    {
      verdict: "entra" as const,
      mismatchBucket: null,
      count: 3,
      sampleDerivationIds: ["d1"],
      rationale: "Padrão positivo de entrada",
    },
  ],
  rejectionPatterns: [
    {
      verdict: "nao_entra" as const,
      mismatchBucket: "system_too_permissive" as const,
      count: 2,
      sampleDerivationIds: ["d2"],
      rationale: "Rejeição por permissividade",
    },
  ],
  quasePatterns: [
    {
      verdict: "quase" as const,
      mismatchBucket: "voice_nuance" as const,
      count: 1,
      sampleDerivationIds: ["d3"],
      rationale: "Quase acerto de voz",
    },
  ],
  decisionCount: 8,
  comparableCount: 7,
  generatedAt: "2026-06-24T00:00:00.000Z",
  caveats: ["Apenas fixture — sem cliente real"],
  fixtureOnly: true,
  corpusSignalsNote: null,
};

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BrandTasteProfilePanel clientProfileId={CLIENT_PROFILE_ID} />
    </QueryClientProvider>
  );
}

describe("BrandTasteProfilePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders source composition counts and caveats from profile API", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => profileFixture,
    } as Response);

    renderPanel();

    expect(await screen.findByText("Composição de fontes")).toBeInTheDocument();
    expect(screen.getByText("Fixture sintético")).toBeInTheDocument();
    expect(screen.getByText("Importado pelo operador")).toBeInTheDocument();
    expect(screen.getByText("Cliente real")).toBeInTheDocument();
    expect(screen.getByText("Apenas fixture — sem cliente real")).toBeInTheDocument();
  });

  it("renders pattern groups with headings and rows when data exists", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => profileFixture,
    } as Response);

    renderPanel();

    expect(await screen.findByText("Padrões positivos")).toBeInTheDocument();
    expect(screen.getByText("Padrões de rejeição")).toBeInTheDocument();
    expect(screen.getByText("Quase acertos")).toBeInTheDocument();
    expect(screen.getByText("Padrão positivo de entrada")).toBeInTheDocument();
    expect(screen.getByText("Rejeição por permissividade")).toBeInTheDocument();
    expect(screen.getByText("Quase acerto de voz")).toBeInTheDocument();
  });

  it("shows neutral empty state for empty pattern arrays", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...profileFixture,
        positivePatterns: [],
        rejectionPatterns: [],
        quasePatterns: [],
      }),
    } as Response);

    renderPanel();

    expect(await screen.findByText("Padrões positivos")).toBeInTheDocument();
    const emptyMessages = screen.getAllByText(/Nenhum padrão registrado/i);
    expect(emptyMessages.length).toBeGreaterThanOrEqual(3);
  });

  it("shows forbidden message on 403", async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 403 } as Response);

    renderPanel();

    expect(
      await screen.findByText(/restrito a proprietários da plataforma/i)
    ).toBeInTheDocument();
  });
});
