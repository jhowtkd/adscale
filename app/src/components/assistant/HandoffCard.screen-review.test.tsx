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
vi.mock("@/lib/assistant/chat-attachments", () => ({ uploadChatAttachment: vi.fn() }));
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
