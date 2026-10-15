import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { GuidanceImpactGroup, GuidanceImpactReport } from "@/server/human-quality/guidance-impact/types";
import { BrandGuidanceImpactPanel } from "./BrandGuidanceImpactPanel";
vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));
const emptyRate = { numerator: 0, denominator: 0, value: null };
const report: GuidanceImpactReport = { schemaVersion: 1, mechanism: "guidance_revisions", capturedAt: "2026-10-15", decisionDenominator: "explicit_human_decision_events", groups: (["applied", "control", "omitted", "unknown"] as const).map(situation => ({ workspaceId: "workspace", clientProfileId: "brand", contextId: "work", contextKind: "creative_work", generationMode: "single", format: "4:5", role: "copy", situation, setHash: situation === "applied" ? "a".repeat(64) : null, appliedRefs: situation === "applied" ? [{ ruleId: "rule", revision: 2, contentHash: "b".repeat(64) }] : [], fixedPromptVersion: "copy/v1", generationCount: 2, humanApproval: { numerator: 1, denominator: 2, value: 0.5 }, rejection: { numerator: 1, denominator: 2, value: 0.5 }, adjustment: { numerator: 0, denominator: 2, value: 0 }, humanVisualScore: { value: null, denominator: 0 }, factualPass: emptyRate } satisfies GuidanceImpactGroup)) };
function renderPanel(id = "brand") {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BrandGuidanceImpactPanel clientProfileId={id} /></QueryClientProvider>);
}
describe("brand guidance impact presentation", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("shows all situations, exact set/revision/version and absent metrics with denominators", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ok: true, json: async () => ({ report }) } as Response);
    renderPanel();
    const table = await screen.findByRole("table");
    for (const label of ["Aplicado", "Controle", "Omitido", "Desconhecido"]) expect(within(table).getByText(label)).toBeInTheDocument();
    expect(within(table).getByText("a".repeat(64))).toBeInTheDocument();
    expect(within(table).getByText("rule · revisão 2")).toBeInTheDocument();
    expect(within(table).getAllByText("50% (1/2)")).toHaveLength(8);
    expect(within(table).getAllByText("Ausente (n=0)")).toHaveLength(8);
    expect(screen.getByText(/client_output_learnings/)).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/feedback/learning-impact?mechanism=guidance_revisions&clientProfileId=brand");
  });
  it("shows access restrictions without replacing missing data with zeroes", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ok: false, status: 403 } as Response);
    renderPanel();
    expect(await screen.findByText(/restrito a proprietários da plataforma/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it("shows an empty report without manufacturing a control", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ok: true, json: async () => ({ report: { ...report, groups: [] } }) } as Response);
    renderPanel();
    expect(await screen.findByText(/Nenhum registro de geração/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it("shows a load failure without displaying another mechanism's data", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ok: false, status: 500 } as Response);
    renderPanel();
    expect(await screen.findByText("Não foi possível carregar o impacto da orientação.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

});
