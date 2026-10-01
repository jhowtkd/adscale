// A palette the vision could not read reaches the person as "Não encontrado", never as a failure, and they can type the colors themselves
// (ticket 13, D-2). The server side of this (the group is `not_found`, with the cause kept) is covered by agents/vision-chain.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HandoffCard from "./HandoffCard";
import ptBR from "../../../messages/pt-BR.json";
import type { HandoffState } from "@/server/equipe/domain/handoff";

const mockUseEquipeAccountState = vi.fn();
vi.mock("@/lib/equipe/use-equipe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/equipe/use-equipe")>();
  return { ...actual, useEquipeAccountState: (...args: unknown[]) => mockUseEquipeAccountState(...args) };
});
const mockPostEquipeCommand = vi.fn();
vi.mock("@/lib/equipe/commands", () => {
  class MockEquipeCommandError extends Error { code: string; constructor(code: string) { super(code); this.code = code; } }
  return { postEquipeCommand: (...args: unknown[]) => mockPostEquipeCommand(...args), EquipeCommandError: MockEquipeCommandError };
});
vi.mock("@/lib/assistant/chat-attachments", () => ({ uploadChatAttachment: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

type Handoff = HandoffState & { id: string };
const run = (status: string, extra: Record<string, unknown> = {}) => ({ runId: "r", taskIntentId: "t", status, ...extra });
function instagramOnly(overrides: Partial<Handoff>): Handoff {
  return {
    id: "handoff-1", step: "identity", version: 5, source: { kind: "instagram", value: "bauducco", normalized: "bauducco" }, readingId: "reading-1", readsUsed: 1,
    reading: { name: run("found"), logo: run("found"), colors: run("not_found", { error: "instagram_vision_failed" }), fonts: run("not_found"), networks: run("found"), images: run("found") },
    captured: { name: [{ id: "n1", value: "Bauducco", origin: "instagram" }], logo: [{ id: "l1", value: "https://cdn/avatar.jpg", origin: "instagram", key: "workspaces/w/avatar.jpg" }] },
    // An Instagram-only source is already the person's explicit choice: the server records the profile as a confirmed network when the group is read.
    decisions: { networks: [{ id: "net-ig", value: "bauducco", platform: "instagram", origin: "instagram" }] }, ...overrides,
  };
}
function renderCard(handoff: Handoff) {
  mockUseEquipeAccountState.mockReturnValue({ data: { handoff }, isLoading: false, error: null, refetch: vi.fn() });
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <HandoffCard accountId="acc-1" handoffId={handoff.id} step={handoff.step} threadId="thread-1" />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe("the palette the vision could not read (Instagram only)", () => {
  it("the reading list says \"Não encontrado\" for Cores, with no failure, no retry and no Instagram-failed notice", () => {
    renderCard(instagramOnly({ step: "reading" }));
    const row = screen.getByText("Cores").closest("li")!;
    expect(within(row).getByText("Não encontrado")).toBeInTheDocument();
    expect(screen.queryByText("Falhou")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /tentar de novo|ler de novo/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/leitura do Instagram confirmado falhou/)).not.toBeInTheDocument();
  });

  it("identity: the person types the hex colors and confirms them as their own palette", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    renderCard(instagramOnly({}));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar Cores" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Cores" }), { target: { value: "#E30613, #FFD100" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar →" }));
    await waitFor(() => expect(mockPostEquipeCommand).toHaveBeenCalledTimes(1));
    expect(mockPostEquipeCommand.mock.calls[0]![1]).toMatchObject({ type: "handoff_confirm_identity", payload: { name: "Bauducco", colors: ["#E30613", "#FFD100"], paletteChoice: "user" } });
  });

  it("identity: confirming without any color is allowed (a palette is optional), and sends none", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    renderCard(instagramOnly({}));
    expect(screen.getByRole("button", { name: "Confirmar →" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar →" }));
    await waitFor(() => expect(mockPostEquipeCommand).toHaveBeenCalledTimes(1));
    expect(mockPostEquipeCommand.mock.calls[0]![1].payload).toMatchObject({ colors: [] });
  });

  it("control: without the confirmed Instagram profile, the Instagram palette choice keeps \"Confirmar\" disabled", () => {
    renderCard(instagramOnly({ decisions: {} }));
    expect(screen.getByRole("button", { name: "Confirmar →" })).toBeDisabled();
  });

  it("identity: \"Pular opcionais\" is the way out today, and sends no palette", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    renderCard(instagramOnly({}));
    fireEvent.click(screen.getByRole("button", { name: "Pular opcionais" }));
    await waitFor(() => expect(mockPostEquipeCommand).toHaveBeenCalledTimes(1));
    expect(mockPostEquipeCommand.mock.calls[0]![1].payload).toMatchObject({ name: "Bauducco", colors: [], paletteChoice: "user" });
  });

  it("control: a color group that really failed still blocks and offers the retry", () => {
    renderCard(instagramOnly({ step: "reading", reading: { name: run("found"), colors: run("failed", { error: "reading_failed" }) } }));
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Tentar de novo|Ler de novo|Tentar novamente/i }).length).toBeGreaterThan(0);
  });
});
