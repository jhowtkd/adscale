import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "@/lib/api-client";
import { GuidanceProposalEditor } from "./GuidanceProposalEditor";
const metadata = { category: "brand_nuance" as const, nature: "text" as const, roles: ["copy" as const], generationModes: ["single"], formats: ["1:1"], contentHash: "b".repeat(64) };
const draft = { revision: 1, originalText: "Texto proposto", editedText: "Texto lido", editedBy: "owner", editedByName: "Dono simulado", editedAt: "2026-10-13T12:00:00Z", metadata };
const proposal = { id: "p", rationale: "Texto proposto", status: "proposed", expectedRevision: "a".repeat(64) };
const response = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data }) as Response;
beforeEach(() => { vi.clearAllMocks(); });
describe("GuidanceProposalEditor", () => {
  it("requires explicit metadata confirmation/save and approves exactly the saved revision, never unsaved edits", async () => {
    const onChanged = vi.fn();
    vi.mocked(apiFetch).mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      return response({ proposal: { ...proposal, expectedRevision: "c".repeat(64), proposalDraft: { ...draft, editedText: body.text ?? draft.editedText } } });
    });
    render(<GuidanceProposalEditor proposal={proposal} kind="corpus_quality" onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar e conferir orientação" }));
    const approve = screen.getByRole("button", { name: "Aprovar orientação" });
    const save = screen.getByRole("button", { name: "Salvar revisão" });
    expect(approve).toBeDisabled(); expect(save).toBeDisabled();
    const exact = "  Convite 😀  "; fireEvent.change(screen.getByLabelText("Texto editado"), { target: { value: exact } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Redação" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Modos de geração" })).getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("checkbox", { name: "1:1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Conferi o texto/ }));
    fireEvent.click(save);
    await screen.findByText("Revisão salva. Confira o texto antes de aprovar.");
    expect(JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body))).toEqual({ kind: "corpus_quality", expectedRevision: proposal.expectedRevision, text: exact, metadata: { category: "brand_nuance", nature: "text", roles: ["copy"], generationModes: ["single"], formats: ["1:1"] } });
    expect(screen.getByText("Texto proposto")).toBeInTheDocument(); expect(screen.getByText(/Editado por Dono simulado/)).toBeInTheDocument();
    expect(approve).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Texto editado"), { target: { value: "Não salvo" } }); expect(approve).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Texto editado"), { target: { value: exact } }); fireEvent.click(approve);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(vi.mocked(apiFetch).mock.calls[1][1]?.body))).toEqual({ kind: "corpus_quality", expectedRevision: "c".repeat(64), acknowledgeFixtureOnly: false, acknowledgeCaveats: false });
  });
  it.each(["PATCH", "POST"])("%s conflict shows the newer state and cannot retry approval automatically", async method => {
    vi.mocked(apiFetch).mockResolvedValue(response({ current: { ...proposal, expectedRevision: "d".repeat(64), proposalDraft: { ...draft, revision: 2, editedText: "Texto concorrente", editedByName: "Outra pessoa" } } }, 409));
    render(<GuidanceProposalEditor proposal={{ ...proposal, proposalDraft: draft }} kind="corpus_quality" onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar e conferir orientação" }));
    if (method === "PATCH") { fireEvent.change(screen.getByLabelText("Texto editado"), { target: { value: "Minha edição" } }); fireEvent.click(screen.getByRole("checkbox", { name: /Conferi o texto/ })); }
    fireEvent.click(screen.getByRole("button", { name: method === "PATCH" ? "Salvar revisão" : "Aprovar orientação" }));
    await screen.findByText("A proposta mudou. Leia a revisão atual antes de continuar.");
    expect(screen.getByLabelText("Texto editado")).toHaveValue("Texto concorrente"); expect(screen.getByText(/Editado por Outra pessoa/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprovar orientação" })).toBeDisabled(); expect(apiFetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Li a revisão atual" }));
    fireEvent.click(screen.getByRole("button", { name: "Aprovar orientação" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(vi.mocked(apiFetch).mock.calls[1][1]?.body)).expectedRevision).toBe("d".repeat(64));
  });
  it("background refetch cannot silently replace the revision read", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response({ current: { ...proposal, expectedRevision: "d".repeat(64), proposalDraft: { ...draft, editedText: "Newer" } } }, 409));
    const { rerender } = render(<GuidanceProposalEditor proposal={{ ...proposal, proposalDraft: draft }} kind="rule" onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar e conferir orientação" }));
    rerender(<GuidanceProposalEditor proposal={{ ...proposal, expectedRevision: "d".repeat(64), proposalDraft: { ...draft, editedText: "Newer" } }} kind="rule" onChanged={vi.fn()} />);
    expect(screen.getByLabelText("Texto editado")).toHaveValue("Texto lido");
    fireEvent.click(screen.getByRole("button", { name: "Aprovar orientação" }));
    await screen.findByText(/A proposta mudou/);
    expect(JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body)).expectedRevision).toBe("a".repeat(64));
  });
  it("domain budget error leaves full text visible and never implies approval", async () => {
    const long = "😀".repeat(281);
    vi.mocked(apiFetch).mockResolvedValue(response({ error: "budget_exceeded", message: "A orientação excede o limite de 280 caracteres." }, 422));
    render(<GuidanceProposalEditor proposal={{ ...proposal, proposalDraft: { ...draft, editedText: long } }} kind="corpus_quality" onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar e conferir orientação" })); fireEvent.click(screen.getByRole("button", { name: "Aprovar orientação" }));
    await screen.findByText(/excede o limite/); expect(screen.getByLabelText("Texto editado")).toHaveValue(long); expect(screen.queryByText("Orientação aprovada.")).not.toBeInTheDocument();
  });
  it("decided proposals keep original and edited visible with authorship and no review command", () => {
    render(<GuidanceProposalEditor proposal={{ ...proposal, status: "accepted", proposalDraft: draft }} kind="corpus_quality" onChanged={vi.fn()} />);
    expect(screen.getByText("Texto original")).toBeInTheDocument(); expect(screen.getByText("Texto proposto")).toBeInTheDocument(); expect(screen.getByText("Texto lido")).toBeInTheDocument(); expect(screen.getByText(/Editado por Dono simulado/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprovar orientação" })).not.toBeInTheDocument();
  });
});
