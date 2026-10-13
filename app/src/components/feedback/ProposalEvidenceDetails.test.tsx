import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api-client";
import { ProposalEvidenceDetails } from "./ProposalEvidenceDetails";
vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));
afterEach(() => vi.resetAllMocks());
it("shows frozen role, references and version while distinguishing historical unknown", async () => {
  vi.mocked(apiFetch).mockResolvedValue({ ok: true, json: async () => ({ proposal: { id: "proposal", kind: "rule", caveats: [], support: [
    { kind: "output_decision", id: "current", availability: "available", label: "Decisão", summary: "Aprovação", pieceHref: null,
      generationIdentity: { state: "recorded", applications: [{ role: "art_direction", fixedPromptVersion: "frozen-v2", setHash: "b".repeat(64), appliedRefs: [{ ruleId: "rule-id", revision: "legacy", contentHash: "a".repeat(64) }] }] } },
    { kind: "output_decision", id: "historical", availability: "available", label: "Decisão histórica", summary: "Aprovação", pieceHref: null, generationIdentity: { state: "unknown", applications: [] } },
  ] } }) } as Response);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ProposalEvidenceDetails clientProfileId="brand" proposalId="proposal" proposalKind="rule" /></QueryClientProvider>);
  fireEvent.click(screen.getByText("Ver evidências"));
  expect(await screen.findByText("Direção de arte")).toBeInTheDocument();
  expect(screen.getByText(/Versão fixa: frozen-v2/)).toBeInTheDocument();
  expect(screen.getByText(/rule-id/)).toBeInTheDocument();
  expect(screen.getByText(/Hash do conjunto/)).toHaveTextContent("b".repeat(64));
  expect(screen.getByText(/Rastreio da geração desconhecido/)).toBeInTheDocument();
});
