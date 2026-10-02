// What the screen review of PR 614 found in the card of the handoff (ticket 13): a palette that was not found said "Pulado" (T2), the failure notice of the
// reading had no style (T4), the third failed reading did not say why and the limit showed twice (T5), and "Editar Cores" left the focus on its button (T6).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HandoffCard from "./HandoffCard";
import ptBR from "../../../messages/pt-BR.json";
import en from "../../../messages/en.json";
import { HANDOFF_GROUPS, type HandoffState } from "@/server/equipe/domain/handoff";

const mockUseEquipeAccountState = vi.fn();
vi.mock("@/lib/equipe/use-equipe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/equipe/use-equipe")>();
  return { ...actual, useEquipeAccountState: (...args: unknown[]) => mockUseEquipeAccountState(...args) };
});
vi.mock("@/lib/equipe/commands", () => ({ postEquipeCommand: vi.fn(), EquipeCommandError: class extends Error {} }));
vi.mock("@/lib/assistant/chat-attachments", () => {
  class MockChatAttachmentUploadError extends Error { constructor(message: string, readonly code?: string) { super(message); this.name = "ChatAttachmentUploadError"; } }
  return { uploadChatAttachment: vi.fn(), ChatAttachmentUploadError: MockChatAttachmentUploadError };
});
beforeEach(() => vi.clearAllMocks());

type Handoff = HandoffState & { id: string };
const run = (status: string, error?: string) => ({ runId: "r", taskIntentId: "t", status, ...(error ? { error } : {}) });
const SITE = { kind: "site" as const, value: "https://acme.com", normalized: "https://acme.com/" };

function renderCard(handoff: Handoff, locale: "pt-BR" | "en" = "pt-BR") {
  mockUseEquipeAccountState.mockReturnValue({ data: { handoff }, isLoading: false, error: null, refetch: vi.fn() });
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : ptBR}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <HandoffCard accountId="acc-1" handoffId={handoff.id} step={handoff.step} threadId="thread-1" />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

/** The identity step of a site whose reading found everything but, maybe, the colors. */
const identity = (colors: { status: string; error?: string }, extra: Partial<Handoff> = {}): Handoff => ({
  id: "handoff-1", step: "identity", version: 3, readsUsed: 1, readingId: "reading-1", source: SITE, decisions: {},
  reading: { name: run("found"), logo: run("found"), colors: run(colors.status, colors.error), fonts: run("found"), networks: run("found"), images: run("found") },
  captured: { name: [{ id: "n", value: "Acme", origin: "site" }], fonts: [{ id: "f", value: "Inter", origin: "site" }] }, ...extra,
});
const rowOf = (label: string) => screen.getByText(label, { selector: "span" }).closest("div")!;

describe("T2: a palette that was not found is not 'Pulado'", () => {
  it("says 'Não encontrado' and that the colors can be typed, with no alert and a card that can still be confirmed", () => {
    renderCard(identity({ status: "not_found", error: "site_vision_failed" }));
    expect(rowOf("Cores")).toHaveTextContent("Não encontrado");
    expect(rowOf("Cores")).not.toHaveTextContent("Pulado");
    expect(screen.getByTestId("palette-not-found")).toHaveTextContent("Não encontrei as cores da marca. Informe em Editar Cores, ou continue sem.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar →" })).toBeEnabled();
  });

  it("is the same for a palette that was never offered a reason (a plain not-found)", () => {
    renderCard(identity({ status: "not_found" }));
    expect(rowOf("Cores")).toHaveTextContent("Não encontrado");
    expect(screen.getByTestId("palette-not-found")).toBeInTheDocument();
  });

  it("stays quiet when the colors were found, with the colors shown", () => {
    renderCard(identity({ status: "found" }, { captured: { name: [{ id: "n", value: "Acme", origin: "site" }], colors: [{ id: "c", value: "#112233", origin: "site" }] } }));
    expect(rowOf("Cores")).not.toHaveTextContent("Não encontrado");
    expect(screen.queryByTestId("palette-not-found")).not.toBeInTheDocument();
  });

  it("is not claimed for a group that is still being read or that failed: 'Pulado' stays where nothing says better", () => {
    for (const status of ["pending", "running", "failed"]) {
      const { unmount } = renderCard(identity({ status }));
      expect(screen.queryByTestId("palette-not-found"), status).not.toBeInTheDocument();
      expect(rowOf("Cores"), status).toHaveTextContent("Pulado");
      unmount();
    }
  });

  it("goes away once the person types colors, and while the field is open", () => {
    renderCard(identity({ status: "not_found" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar Cores" }));
    expect(screen.queryByTestId("palette-not-found")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Cores" }), { target: { value: "#3b2416, #c8782e" } });
    fireEvent.click(screen.getByRole("button", { name: "Editar Cores" }));
    expect(screen.queryByTestId("palette-not-found")).not.toBeInTheDocument();
    expect(rowOf("Cores")).not.toHaveTextContent("Não encontrado");
  });

  it("closing the field without typing brings the hint back", () => {
    renderCard(identity({ status: "not_found" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar Cores" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar Cores" }));
    expect(screen.getByTestId("palette-not-found")).toBeInTheDocument();
  });

  it("tells it in English too", () => {
    renderCard(identity({ status: "not_found" }), "en");
    expect(screen.getByTestId("palette-not-found")).toHaveTextContent("I could not find the brand's colors. Enter them in Edit Colors, or continue without.");
    expect(rowOf("Colors")).toHaveTextContent("Not found");
  });

  it("a brand that was never given a palette reading says nothing about one (the Summary says what the person did)", () => {
    renderCard({ ...identity({ status: "found" }), reading: {} });
    expect(screen.queryByTestId("palette-not-found")).not.toBeInTheDocument();
  });
});

// Owner decision after the screen review: a row with nothing in it says why. "Não encontrado" when the reading did not find it (the logo and the fonts, like the
// colors), "Pulado" only when the person skipped it.
describe("T2, Logo and Fontes: 'Não encontrado' when the reading did not find it, 'Pulado' only when the person skipped", () => {
  const withGroups = (groups: Record<string, ReturnType<typeof run>>, extra: Partial<Handoff> = {}): Handoff => {
    const base = identity({ status: "found" }, extra);
    return { ...base, reading: { ...base.reading, ...groups } };
  };
  const LOGO = { id: "11111111-1111-4111-8111-111111111111", value: "https://acme.com/logo.png", origin: "site" as const, key: "managed/logo.png" };

  it.each([[undefined], ["logo_too_small"], ["logo_unsupported_format"]])("the logo the reading did not find (%s) says 'Não encontrado'", (error) => {
    renderCard(withGroups({ logo: run("not_found", error) }));
    expect(rowOf("Logo")).toHaveTextContent("Não encontrado");
    expect(rowOf("Logo")).not.toHaveTextContent("Pulado");
  });

  it("a logo the reading did not find with no reason (the vision turned the only candidate down) asks for the file, in one generic sentence and no other", () => {
    renderCard(withGroups({ logo: run("not_found") }));
    expect(rowOf("Logo")).toHaveTextContent("Não encontrado");
    expect(screen.getByTestId("logo-not-found")).toHaveTextContent("Não encontrei o logo da marca. Envie o arquivo em Editar Logo, ou continue sem logo.");
    expect(screen.queryByTestId("logo-too-small")).not.toBeInTheDocument();
    expect(screen.queryByTestId("logo-unsupported")).not.toBeInTheDocument();
  });

  it.each([["logo_too_small", "logo-too-small"], ["logo_unsupported_format", "logo-unsupported"]])("a logo that was not found for a reason (%s) keeps the sentence of that reason, and never the generic one besides", (error, testId) => {
    renderCard(withGroups({ logo: run("not_found", error) }));
    expect(screen.getByTestId(testId)).toBeInTheDocument();
    expect(screen.queryByTestId("logo-not-found")).not.toBeInTheDocument();
  });

  it("the generic sentence is not said for a logo that was found, that the person uploaded, or whose reading failed or is still going", () => {
    const { unmount } = renderCard(withGroups({}, { captured: { name: [{ id: "n", value: "Acme", origin: "site" }], logo: [LOGO] } }));
    expect(screen.queryByTestId("logo-not-found")).not.toBeInTheDocument();
    unmount();
    // not found by the reading, but the person has uploaded a logo: it is chosen, nothing is missing
    const uploaded = renderCard(withGroups({ logo: run("not_found") }, { decisions: { uploadedLogo: LOGO } as Handoff["decisions"] }));
    expect(screen.queryByTestId("logo-not-found")).not.toBeInTheDocument();
    uploaded.unmount();
    for (const status of ["pending", "running", "failed"]) {
      const view = renderCard(withGroups({ logo: run(status) }, { captured: { name: [{ id: "n", value: "Acme", origin: "site" }] } }));
      expect(screen.queryByTestId("logo-not-found"), status).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it("says the generic sentence in English too", () => {
    renderCard(withGroups({ logo: run("not_found") }), "en");
    expect(screen.getByTestId("logo-not-found")).toHaveTextContent("I could not find the brand's logo. Upload the file in Edit Logo, or continue without a logo.");
  });

  it("keeps the hint of its own reason under the row", () => {
    const { unmount } = renderCard(withGroups({ logo: run("not_found", "logo_too_small") }));
    expect(screen.getByTestId("logo-too-small")).toBeInTheDocument();
    unmount();
    renderCard(withGroups({ logo: run("not_found", "logo_unsupported_format") }));
    expect(screen.getByTestId("logo-unsupported")).toBeInTheDocument();
  });

  it("a logo that was found shows the logo, not a word", () => {
    renderCard(withGroups({}, { captured: { name: [{ id: "n", value: "Acme", origin: "site" }], logo: [LOGO] } }));
    expect(rowOf("Logo").querySelector("img")).not.toBeNull();
    expect(rowOf("Logo")).not.toHaveTextContent("Não encontrado");
    expect(rowOf("Logo")).not.toHaveTextContent("Pulado");
  });

  it("a logo the reading found, that the person then took away, says 'Pulado': they skipped it", () => {
    renderCard(withGroups({}, { captured: { name: [{ id: "n", value: "Acme", origin: "site" }], logo: [LOGO] } }));
    fireEvent.click(screen.getByRole("button", { name: "Editar Logo" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Logo" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Editar Logo" }));
    expect(rowOf("Logo")).toHaveTextContent("Pulado");
    expect(rowOf("Logo")).not.toHaveTextContent("Não encontrado");
  });

  it("fonts the reading did not find say 'Não encontrado'; found fonts show themselves", () => {
    const { unmount } = renderCard(withGroups({ fonts: run("not_found") }, { captured: { name: [{ id: "n", value: "Acme", origin: "site" }] } }));
    expect(rowOf("Fontes")).toHaveTextContent("Não encontrado");
    expect(rowOf("Fontes")).not.toHaveTextContent("Pulado");
    unmount();
    renderCard(identity({ status: "found" }));
    expect(rowOf("Fontes")).toHaveTextContent("Inter");
    expect(rowOf("Fontes")).not.toHaveTextContent("Não encontrado");
  });

  it("fonts the person typed show themselves, and fonts they took away say 'Pulado' when the reading had found them", () => {
    const { unmount } = renderCard(withGroups({ fonts: run("not_found") }, { captured: { name: [{ id: "n", value: "Acme", origin: "site" }] } }));
    fireEvent.click(screen.getByRole("button", { name: "Editar Fontes" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Fontes" }), { target: { value: "Fraunces" } });
    fireEvent.click(screen.getByRole("button", { name: "Editar Fontes" }));
    expect(rowOf("Fontes")).toHaveTextContent("Fraunces");
    unmount();
    renderCard(identity({ status: "found" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar Fontes" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Fontes" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Editar Fontes" }));
    expect(rowOf("Fontes")).toHaveTextContent("Pulado");
    expect(rowOf("Fontes")).not.toHaveTextContent("Não encontrado");
  });

  it.each(["logo", "fonts"])("is not claimed for a %s group that is still being read or that failed: 'Pulado' stays where nothing says better", (group) => {
    const label = group === "logo" ? "Logo" : "Fontes";
    for (const status of ["pending", "running", "failed"]) {
      const { unmount } = renderCard(withGroups({ [group]: run(status) }, { captured: { name: [{ id: "n", value: "Acme", origin: "site" }] } }));
      expect(rowOf(label), `${group} ${status}`).toHaveTextContent("Pulado");
      expect(rowOf(label), `${group} ${status}`).not.toHaveTextContent("Não encontrado");
      unmount();
    }
  });

  it("says it in English too", () => {
    renderCard(withGroups({ logo: run("not_found"), fonts: run("not_found") }, { captured: { name: [{ id: "n", value: "Acme", origin: "site" }] } }), "en");
    expect(rowOf("Logo")).toHaveTextContent("Not found");
    expect(rowOf("Fonts")).toHaveTextContent("Not found");
  });

  it("what the person confirmed without stays 'Pulado' in the summary: it is their decision, not the reading's", () => {
    renderCard({ ...withGroups({ logo: run("not_found"), fonts: run("not_found"), colors: run("not_found") }), step: "summary",
      decisions: { identity: { name: { id: "n", value: "Acme", origin: "site" }, logo: null, colors: [], fonts: [], paletteChoice: "user" } } } as Handoff);
    expect(rowOf("Cores")).toHaveTextContent("Pulado");
    expect(rowOf("Fontes")).toHaveTextContent("Pulado");
  });
});

describe("T6: 'Editar' takes the focus to the field it opens", () => {
  it.each([["Cores", "textbox"], ["Fontes", "textbox"], ["Nome", "textbox"], ["Logo", "combobox"]] as const)("Editar %s", (group, role) => {
    renderCard(identity({ status: "found" }));
    fireEvent.click(screen.getByRole("button", { name: `Editar ${group}` }));
    expect(screen.getByRole(role, { name: group })).toHaveFocus();
  });
});

describe("T4 and T5: the notice of a failed reading", () => {
  const failedReading = (readsUsed: number, error = "site_unavailable"): Handoff => ({
    id: "handoff-1", step: "reading", version: 3, readsUsed, readingId: "reading-1", source: SITE, decisions: {}, captured: {},
    reading: Object.fromEntries(HANDOFF_GROUPS.map(group => [group, run("failed", error)])),
  });
  const LIMIT = "Você usou as 3 leituras. Sua conta e o que já foi lido continuam disponíveis.";
  const occurrences = (container: HTMLElement, text: string) => (container.textContent!.match(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;

  it("T4: is as big as the card's own text (14 px), in the warning tone, and 'Tentar de novo' is as wide as its words", () => {
    renderCard(failedReading(1));
    expect(screen.getByRole("alert")).toHaveClass("text-sm");
    expect(screen.getByRole("alert").className).toContain("danger");
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toHaveClass("self-start");
  });

  it("T5: with the third reading failed it says WHY, then the limit, once", () => {
    const { container } = renderCard(failedReading(3));
    expect(screen.getByRole("alert")).toHaveTextContent(`Não consegui abrir essa página: o site respondeu que ela não existe. Confira o endereço. ${LIMIT}`);
    expect(occurrences(container, LIMIT)).toBe(1);
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeDisabled();
  });

  it.each([["site_dns_or_address", "Não encontrei esse endereço."], ["reading_failed", "A leitura não terminou."]])("T5: the cause of the third failure follows the first failed group (%s)", (error, cause) => {
    const { container } = renderCard(failedReading(3, error));
    expect(screen.getByRole("alert")).toHaveTextContent(cause);
    expect(occurrences(container, LIMIT)).toBe(1);
  });

  it("T5: the card's footer still tells the limit on the steps that have no failure notice, once", () => {
    const handoff: Handoff = { ...identity({ status: "found" }), readsUsed: 3 };
    const { container } = renderCard(handoff);
    expect(occurrences(container, LIMIT)).toBe(1);
  });

  it("T5: a group that failed on a step after the reading has no notice (the person moved on), and the footer keeps the limit, once", () => {
    const found = identity({ status: "found" });
    const { container } = renderCard({ ...found, readsUsed: 3, reading: { ...found.reading, logo: run("failed", "logo_download_failed") } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(occurrences(container, LIMIT)).toBe(1);
  });

  it("T5: while the last groups still read there is no notice, and the footer carries the limit alone", () => {
    const reading = { ...failedReading(3).reading, images: run("running") };
    const { container } = renderCard({ ...failedReading(3), reading });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(occurrences(container, LIMIT)).toBe(1);
  });

  it("T5, in English: the cause, then the limit, once", () => {
    const { container } = renderCard(failedReading(3), "en");
    const limit = "You have used all 3 readings. Your account and captured brand remain available.";
    expect(screen.getByRole("alert")).toHaveTextContent(`I could not open that page: the site said it does not exist. Check the address. ${limit}`);
    expect(occurrences(container, limit)).toBe(1);
  });
});
