import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OwnerCalibrationPanel } from "./OwnerCalibrationPanel";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("./BrandVoiceInspectPanel", () => ({
  BrandVoiceInspectPanel: ({ clientProfileId }: { clientProfileId: string }) => (
    <div data-testid="brand-voice-inspect">Voice panel for {clientProfileId}</div>
  ),
}));

vi.mock("./BrandTasteProfilePanel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./BrandTasteProfilePanel")>();
  return {
    ...actual,
    BrandTasteProfilePanel: ({ clientProfileId }: { clientProfileId: string }) => (
      <div data-testid="brand-taste-profile">Profile panel for {clientProfileId}</div>
    ),
  };
});

vi.mock("./BrandCalibrationRulesPanel", () => ({
  BrandCalibrationRulesPanel: ({ clientProfileId }: { clientProfileId: string }) => (
    <div data-testid="brand-calibration-rules">Rules panel for {clientProfileId}</div>
  ),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

const CLIENT_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440003";
const OTHER_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440004";

const brandsFixture = {
  brands: [
    {
      id: CLIENT_PROFILE_ID,
      name: "Cenbrap",
      workspaceId: "550e8400-e29b-41d4-a716-446655440002",
      workspaceName: "Workspace A",
    },
    {
      id: OTHER_PROFILE_ID,
      name: "Outra Marca",
      workspaceId: "550e8400-e29b-41d4-a716-446655440005",
      workspaceName: "Workspace B",
    },
  ],
};

const profileFixture = {
  clientProfileId: CLIENT_PROFILE_ID,
  workspaceId: "550e8400-e29b-41d4-a716-446655440002",
  evidenceLevel: "seed_calibrated" as const,
  sourceComposition: {
    synthetic_fixture: 5,
    operator_imported: 0,
    real_customer: 0,
  },
  positivePatterns: [],
  rejectionPatterns: [],
  quasePatterns: [],
  decisionCount: 5,
  comparableCount: 4,
  generatedAt: "2026-06-24T00:00:00.000Z",
  caveats: [],
  fixtureOnly: true,
  corpusSignalsNote: null,
};

function renderPanel(props?: Partial<Parameters<typeof OwnerCalibrationPanel>[0]>) {
  const onBrandChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <OwnerCalibrationPanel
        clientProfileId={CLIENT_PROFILE_ID}
        onBrandChange={onBrandChange}
        {...props}
      />
    </QueryClientProvider>
  );
  return { ...view, onBrandChange };
}

function mockApis(options?: { profileForbidden?: boolean }) {
  mockApiFetch.mockImplementation(async (url: string | RequestInfo | URL) => {
    const path = String(url);

    if (path.includes("/profile")) {
      if (options?.profileForbidden) {
        return { ok: false, status: 403 } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => profileFixture,
      } as Response;
    }

    if (path.endsWith("/api/admin/quality/brands")) {
      return {
        ok: true,
        status: 200,
        json: async () => brandsFixture,
      } as Response;
    }

    return { ok: false, status: 404 } as Response;
  });
}

describe("OwnerCalibrationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders ResponsiveTabs with Perfil, Voz, Regras labels", async () => {
    mockApis();
    renderPanel();

    expect(await screen.findByRole("tab", { name: "Perfil" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Voz" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Regras" })).toBeInTheDocument();
  });

  it("calls onBrandChange when brand selection changes", async () => {
    mockApis();
    const { onBrandChange } = renderPanel();

    const select = (await screen.findByLabelText(/Selecionar marca/i)) as HTMLSelectElement;
    await vi.waitFor(() => expect(select.options.length).toBeGreaterThan(1));

    select.value = OTHER_PROFILE_ID;
    fireEvent.change(select);

    expect(onBrandChange).toHaveBeenCalledWith(OTHER_PROFILE_ID);
  });

  it("shows panel-level restricted message when profile fetch is forbidden", async () => {
    mockApis({ profileForbidden: true });
    renderPanel();

    expect(
      await screen.findByText(/Painel restrito a proprietários da plataforma/i)
    ).toBeInTheDocument();
  });

  it("mounts BrandVoiceInspectPanel on Voice tab with clientProfileId", async () => {
    mockApis();
    renderPanel();

    fireEvent.click(await screen.findByRole("tab", { name: "Voz" }));

    expect(await screen.findByTestId("brand-voice-inspect")).toHaveTextContent(
      `Voice panel for ${CLIENT_PROFILE_ID}`
    );
  });
});
