// What the person is told when a reading fails (ticket 13, D-10). The real test found four different failures (a profile that does not exist, a 404, an address
// that does not resolve, a free DNS refusal) all saying the same thing, "Tentar de novo usa 1 das suas leituras" even when nothing was charged, and a notice
// plus a retry button flashing for about a second while the other rows still read.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HandoffCard from "./HandoffCard";
import ptBR from "../../../messages/pt-BR.json";
import en from "../../../messages/en.json";
import { HANDOFF_GROUPS, UNBILLED_READING_ERRORS, type HandoffState } from "@/server/equipe/domain/handoff";

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
function failedReading(kind: "site" | "instagram", error: string, overrides: Partial<Handoff> = {}): Handoff {
  return {
    id: "handoff-1", step: "reading", version: 3, readsUsed: 1, readingId: "reading-1", decisions: {}, captured: {},
    source: kind === "site" ? { kind, value: "https://acme.com", normalized: "https://acme.com/" } : { kind, value: "acme", normalized: "acme" },
    reading: Object.fromEntries(HANDOFF_GROUPS.map(g => [g, run("failed", error)])), ...overrides,
  };
}
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

const UNAVAILABLE = "Não consegui abrir essa página: o site respondeu que ela não existe. Confira o endereço.";
const ADDRESS = "Não encontrei esse endereço. Confira se o site está escrito certo.";
const NOT_FOUND = "Não encontrei esse perfil do Instagram. Confira o @.";
const PRIVATE = "Esse perfil do Instagram é privado, então não dá para ler. Use outro @ ou o site.";
const GENERIC = "A leitura não terminou. Confira o site ou o @ público.";
const COST = "Tentar de novo usa 1 das suas leituras.";
const NO_COST = "Tentar de novo não gasta leitura.";
const PRESERVED = "Sua conta continua preservada.";

describe("a failed reading says why, and what trying again costs", () => {
  it.each([
    ["site", "site_unavailable", UNAVAILABLE, COST],
    ["site", "site_dns_or_address", ADDRESS, NO_COST],
    ["site", "site_provider_dns", ADDRESS, NO_COST],
    ["site", "invalid_site", ADDRESS, NO_COST],
    ["site", "reader_unavailable", GENERIC, NO_COST],
    ["site", "reading_not_started", GENERIC, NO_COST],
    ["site", "reading_failed", GENERIC, COST],
    ["site", "something_new", GENERIC, COST],
    ["instagram", "instagram_not_found", NOT_FOUND, COST],
    ["instagram", "instagram_private", PRIVATE, COST],
    ["instagram", "invalid_instagram", NOT_FOUND, NO_COST],
    ["instagram", "reader_unavailable", GENERIC, NO_COST],
    ["instagram", "reading_failed", GENERIC, COST],
  ] as const)("%s source, %s: the cause, the cost of trying again, and that the account is safe", (kind, code, cause, cost) => {
    renderCard(failedReading(kind, code));
    expect(screen.getByRole("alert")).toHaveTextContent(`${cause} ${cost} ${PRESERVED}`);
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeEnabled();
  });

  it("a 404 and a profile that is private are no longer the same message (they used to be)", () => {
    const first = renderCard(failedReading("site", "site_unavailable"));
    const notFoundText = screen.getByRole("alert").textContent;
    first.unmount();
    renderCard(failedReading("instagram", "instagram_private"));
    expect(screen.getByRole("alert").textContent).not.toBe(notFoundText);
  });

  it("a read that was not charged says so only for the errors the module gives the read back for", () => {
    for (const code of UNBILLED_READING_ERRORS.site) { const { unmount } = renderCard(failedReading("site", code)); expect(screen.getByRole("alert")).toHaveTextContent(NO_COST); unmount(); }
    for (const code of UNBILLED_READING_ERRORS.instagram) { const { unmount } = renderCard(failedReading("instagram", code)); expect(screen.getByRole("alert")).toHaveTextContent(NO_COST); unmount(); }
    // The same code under the other source is not free there: reading_not_started is a site preflight.
    renderCard(failedReading("instagram", "site_dns_or_address"));
    expect(screen.getByRole("alert")).toHaveTextContent(COST);
  });

  it("uses the first failed group's reason, whichever group it is", () => {
    const reading = { ...failedReading("site", "reading_failed").reading, name: run("found"), logo: run("failed", "site_unavailable") };
    renderCard(failedReading("site", "reading_failed", { reading }));
    expect(screen.getByRole("alert")).toHaveTextContent(UNAVAILABLE);
  });

  it("tells it in English too", () => {
    renderCard(failedReading("site", "site_dns_or_address"), "en");
    expect(screen.getByRole("alert")).toHaveTextContent("I could not find that address. Check that the website is spelled right. Trying again does not use a reading. Your account is preserved.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("with all three readings used it says so instead, and retry stays disabled", () => {
    renderCard(failedReading("site", "site_unavailable", { readsUsed: 3 }));
    expect(screen.getByRole("alert")).toHaveTextContent("Você usou as 3 leituras. Sua conta e o que já foi lido continuam disponíveis.");
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeDisabled();
  });
});

describe("the failure is told only when the reading is over (no notice that flashes while other rows still read)", () => {
  const profileFailing = (rest: "running" | "pending" | "found") => {
    const reading = Object.fromEntries(HANDOFF_GROUPS.map(g => [g, g === "name" || g === "networks" ? run("failed", "instagram_not_found") : run(rest)]));
    return failedReading("instagram", "instagram_not_found", { reading });
  };

  it.each(["running", "pending"] as const)("while the other groups are %s there is no alert and no retry, only the rows", (rest) => {
    renderCard(profileFailing(rest));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).not.toBeInTheDocument();
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]!).getByText("Falhou")).toBeInTheDocument();
    expect(within(rows[1]!).getByText(rest === "running" ? "Lendo…" : "Na fila")).toBeInTheDocument();
  });

  it("once the last group has finished, the notice and the retry appear", () => {
    renderCard(profileFailing("found"));
    expect(screen.getByRole("alert")).toHaveTextContent(NOT_FOUND);
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
  });

  it("a reading that finished without any failure shows neither", () => {
    renderCard(failedReading("site", "x", { reading: Object.fromEntries(HANDOFF_GROUPS.map(g => [g, run("found")])) }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
