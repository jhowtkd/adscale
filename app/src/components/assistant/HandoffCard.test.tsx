import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HandoffCard from "./HandoffCard";
import { EquipeCommandError } from "@/lib/equipe/commands";
import ptBR from "../../../messages/pt-BR.json";
import type { HandoffState } from "@/server/equipe/domain/handoff";

const mockUseEquipeAccountState = vi.fn();
vi.mock("@/lib/equipe/use-equipe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/equipe/use-equipe")>();
  return { ...actual, useEquipeAccountState: (...args: unknown[]) => mockUseEquipeAccountState(...args) };
});

const mockPostEquipeCommand = vi.fn();
vi.mock("@/lib/equipe/commands", () => {
  class MockEquipeCommandError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    postEquipeCommand: (...args: unknown[]) => mockPostEquipeCommand(...args),
    EquipeCommandError: MockEquipeCommandError,
  };
});

const mockUploadChatAttachment = vi.fn();
vi.mock("@/lib/assistant/chat-attachments", () => ({
  uploadChatAttachment: (...args: unknown[]) => mockUploadChatAttachment(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

type Handoff = HandoffState & { id: string };

function baseHandoff(overrides: Partial<Handoff>): Handoff {
  return {
    id: "handoff-1", step: "source", version: 3, source: null, readingId: null, readsUsed: 0,
    reading: {}, captured: {}, decisions: {},
    ...overrides,
  };
}

function renderCard(handoff: Handoff, extraProps: Partial<{ latest: boolean; disabled: boolean }> = {}) {
  mockUseEquipeAccountState.mockReturnValue({ data: { handoff }, isLoading: false, error: null, refetch: vi.fn() });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    ...render(
      <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
        <QueryClientProvider client={client}>
          <HandoffCard accountId="acc-1" handoffId={handoff.id} step={handoff.step} threadId="thread-1" {...extraProps} />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    ),
  };
}

/** v4: identity fields are preview text by default; clicking "Editar X" swaps in a native input. */
function clickEditField(groupLabel: string) {
  fireEvent.click(screen.getByRole("button", { name: `Editar ${groupLabel}` }));
}

describe("HandoffCard: all six interactive steps render with synthetic data", () => {
  it("source: shows the source form with a required website field", () => {
    renderCard(baseHandoff({ step: "source" }));
    expect(screen.getByText("Vamos conhecer sua marca")).toBeInTheDocument();
    const input = screen.getByPlaceholderText("https://sua-marca.com.br");
    expect(input).toBeRequired();
    expect(screen.getByRole("button", { name: "Ler minha marca" })).toBeInTheDocument();
  });

  it("source: \"Não tenho site\" swaps to the Instagram handle field and clears what was typed", () => {
    renderCard(baseHandoff({ step: "source" }));
    fireEvent.change(screen.getByPlaceholderText("https://sua-marca.com.br"), { target: { value: "https://acme.com" } });

    fireEvent.click(screen.getByRole("button", { name: "Não tenho site" }));

    expect(screen.queryByPlaceholderText("https://sua-marca.com.br")).not.toBeInTheDocument();
    const handleInput = screen.getByPlaceholderText("@sua_marca") as HTMLInputElement;
    expect(handleInput.value).toBe("");
    expect(screen.getByRole("button", { name: "Usar o site" })).toBeInTheDocument();
  });

  it("reading: lists every group with its status", () => {
    renderCard(baseHandoff({
      step: "reading", source: { kind: "site", value: "https://acme.com", normalized: "https://acme.com/" }, readsUsed: 1,
      reading: {
        name: { runId: "r1", taskIntentId: "t1", status: "found" },
        logo: { runId: "r1", taskIntentId: "t1", status: "running" },
        colors: { runId: "r1", taskIntentId: "t1", status: "pending" },
      },
    }));
    expect(screen.getByText("Lendo sua marca")).toBeInTheDocument();
    // The "name" row appends " · <value>" to its status, so match by prefix.
    expect(screen.getByText(/^Encontrado/)).toBeInTheDocument();
    expect(screen.getByText("Lendo…")).toBeInTheDocument();
    // colors was set to pending explicitly; networks/images default to pending too.
    expect(screen.getAllByText("Na fila").length).toBeGreaterThanOrEqual(1);
  });

  it("identity: shows a read-only preview of the captured name until \"Editar\" is clicked", () => {
    renderCard(baseHandoff({
      step: "identity",
      captured: { name: [{ id: "n1", value: "Acme", origin: "site" }], colors: [{ id: "c1", value: "#112233", origin: "site" }, { id: "c2", value: "#334455", origin: "instagram" }] },
    }));
    expect(screen.getByText("Nome, logo, cores e fontes")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    // No field is in edit mode yet (the collapsed "correct the source" details
    // below always keeps its own hidden textbox in the DOM under jsdom).
    expect(screen.queryByRole("textbox", { name: "Nome" })).not.toBeInTheDocument();

    clickEditField("Nome");
    const input = screen.getByRole("textbox", { name: "Nome" }) as HTMLInputElement;
    expect(input.value).toBe("Acme");
    expect(screen.getByRole("button", { name: "Confirmar →" })).toBeInTheDocument();
  });

  it("networks: lists the captured profile and marks it provisional when unconfirmed", () => {
    renderCard(baseHandoff({
      step: "networks",
      source: { kind: "site", value: "https://acme.com", normalized: "https://acme.com/" },
      reading: { networks: { runId: "r1", taskIntentId: "t1", status: "found" } },
      captured: { networks: [{ id: "net1", value: "acme.oficial", origin: "site", platform: "instagram" }] },
    }));
    expect(screen.getByText("Essas são suas redes?")).toBeInTheDocument();
    expect(screen.getByText("@acme.oficial")).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === "Do site · Provisório — ainda não foi lido")).toBeInTheDocument();
  });

  it("images: shows the captured gallery as role=checkbox toggle buttons, sr-only restore hint", () => {
    renderCard(baseHandoff({
      step: "images",
      reading: { images: { runId: "r1", taskIntentId: "t1", status: "found" } },
      captured: { images: [{ id: "img1", value: "https://cdn/img1.png", origin: "site", key: "workspaces/ws/img1.png" }] },
    }));
    expect(screen.getByText("Quais imagens ficam?")).toBeInTheDocument();
    expect(screen.getByText("Desmarque para remover. Você pode restaurar a imagem até confirmar o resumo.")).toBeInTheDocument();
    const toggle = screen.getByRole("checkbox", { name: "Remover imagem img1" });
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle).toBeChecked();
  });

  it("summary: shows the review and only enables \"É isso\" once every group finished", () => {
    renderCard(baseHandoff({
      step: "summary",
      source: { kind: "site", value: "https://acme.com", normalized: "https://acme.com/" },
      reading: {
        name: { runId: "r", taskIntentId: "t", status: "found" }, logo: { runId: "r", taskIntentId: "t", status: "not_found" },
        colors: { runId: "r", taskIntentId: "t", status: "found" }, fonts: { runId: "r", taskIntentId: "t", status: "found" },
        networks: { runId: "r", taskIntentId: "t", status: "not_found" }, images: { runId: "r", taskIntentId: "t", status: "pending" },
      },
      decisions: {
        identity: { name: { id: "n1", value: "Acme", origin: "site" }, logo: null, colors: [], fonts: [], paletteChoice: "site" },
        networks: [], images: { kept: [], removed: [], uploaded: [] },
      },
    }));
    expect(screen.getByText("Essa é a sua marca?")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    // Images is still pending: the finish button stays disabled.
    expect(screen.getByRole("button", { name: "É isso →" })).toBeDisabled();
  });

  it("images: a captured image without a managed key renders unavailable — dimmed, unchecked and disabled", () => {
    renderCard(baseHandoff({
      step: "images",
      reading: { images: { runId: "r1", taskIntentId: "t1", status: "found" } },
      captured: { images: [{ id: "img-keyless", value: "https://cdn/keyless.png", origin: "site" }] },
    }));

    const toggle = screen.getByRole("checkbox", { name: "Imagem indisponível — envie o arquivo para usá-la. img-keyless" });
    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();
    expect(screen.getByText("Imagem indisponível — envie o arquivo para usá-la.")).toBeInTheDocument();
  });

  it("summary: \"É isso\" stays disabled when a kept image has no managed key, even with every group finished", () => {
    renderCard(baseHandoff({
      step: "summary",
      source: { kind: "site", value: "https://acme.com", normalized: "https://acme.com/" },
      reading: {
        name: { runId: "r", taskIntentId: "t", status: "found" }, logo: { runId: "r", taskIntentId: "t", status: "not_found" },
        colors: { runId: "r", taskIntentId: "t", status: "found" }, fonts: { runId: "r", taskIntentId: "t", status: "found" },
        networks: { runId: "r", taskIntentId: "t", status: "not_found" }, images: { runId: "r", taskIntentId: "t", status: "found" },
      },
      captured: { images: [{ id: "img-keyless", value: "https://cdn/keyless.png", origin: "site" }] },
      decisions: {
        identity: { name: { id: "n1", value: "Acme", origin: "site" }, logo: null, colors: [], fonts: [], paletteChoice: "site" },
        networks: [], images: { kept: ["img-keyless"], removed: [], uploaded: [] },
      },
    }));
    expect(screen.getByRole("button", { name: "É isso →" })).toBeDisabled();
  });
});

describe("HandoffCard: correcting the source stays collapsed by default (identity/networks/images)", () => {
  it("reveals the source form only after opening the disclosure", () => {
    renderCard(baseHandoff({
      step: "identity",
      captured: { name: [{ id: "n1", value: "Acme", origin: "site" }] },
    }));
    // jsdom keeps a closed <details>'s content in the tree; jest-dom's
    // visibility check is what actually respects the missing `open` attribute.
    expect(screen.getByPlaceholderText("https://sua-marca.com.br")).not.toBeVisible();

    fireEvent.click(screen.getByText("Corrigir a fonte (refaz a leitura)"));
    expect(screen.getByPlaceholderText("https://sua-marca.com.br")).toBeVisible();
  });
});

describe("HandoffCard: history rendering (past steps are read-only, no button)", () => {
  it("shows a one-line summary and no interactive controls when the card is not the latest of its step", () => {
    renderCard(baseHandoff({ step: "source" }), { latest: false });
    expect(screen.getByTestId("handoff-history")).toHaveTextContent("Fonte");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows the same read-only summary when the card's own step no longer matches the live state", () => {
    mockUseEquipeAccountState.mockReturnValue({ data: { handoff: baseHandoff({ step: "identity" }) }, isLoading: false, error: null, refetch: vi.fn() });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
        <QueryClientProvider client={client}>
          <HandoffCard accountId="acc-1" handoffId="handoff-1" step="source" threadId="thread-1" />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("handoff-history")).toHaveTextContent("Fonte");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("HandoffCard: submitting a command", () => {
  it("double-click guard: a second click before the first request settles never sends a second command", async () => {
    let resolveCommand!: () => void;
    mockPostEquipeCommand.mockReturnValue(new Promise<void>((resolve) => { resolveCommand = resolve; }));
    renderCard(baseHandoff({ step: "source" }));

    fireEvent.change(screen.getByPlaceholderText("https://sua-marca.com.br"), { target: { value: "https://acme.com" } });
    const button = screen.getByRole("button", { name: "Ler minha marca" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(mockPostEquipeCommand).toHaveBeenCalledTimes(1);
    resolveCommand();
    await waitFor(() => expect(mockPostEquipeCommand).toHaveBeenCalledTimes(1));
  });

  it("a stale_version error shows the reload copy and refreshes the account state", async () => {
    mockPostEquipeCommand.mockRejectedValue(new EquipeCommandError("stale_version"));
    renderCard(baseHandoff({ step: "source" }));

    fireEvent.change(screen.getByPlaceholderText("https://sua-marca.com.br"), { target: { value: "https://acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Ler minha marca" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("O passo mudou. Recarreguei o card; confira antes de confirmar."));
  });

  it("a reading_limit error shows the fixed limit copy instead of the generic error", async () => {
    mockPostEquipeCommand.mockRejectedValue(new EquipeCommandError("reading_limit"));
    renderCard(baseHandoff({ step: "source" }));

    fireEvent.change(screen.getByPlaceholderText("https://sua-marca.com.br"), { target: { value: "https://acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Ler minha marca" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Você usou as 3 leituras. Sua conta e o que já foi lido continuam disponíveis."));
  });

  it("identity: \"Pular opcionais\" confirms with the typed name only, no colors/fonts/logo — never touching the source", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    renderCard(baseHandoff({
      step: "identity",
      captured: { name: [{ id: "n1", value: "Acme", origin: "site" }] },
      reading: {
        name: { runId: "r", taskIntentId: "t", status: "found" }, logo: { runId: "r", taskIntentId: "t", status: "not_found" },
        colors: { runId: "r", taskIntentId: "t", status: "not_found" }, fonts: { runId: "r", taskIntentId: "t", status: "not_found" },
      },
    }));

    fireEvent.click(screen.getByRole("button", { name: "Pular opcionais" }));
    await waitFor(() => expect(mockPostEquipeCommand).toHaveBeenCalledTimes(1));
    const [, command] = mockPostEquipeCommand.mock.calls[0]!;
    expect((command as { type: string; payload: Record<string, unknown> })).toMatchObject({
      type: "handoff_confirm_identity",
      payload: { name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "user" },
    });
    expect((command as { payload: Record<string, unknown> }).payload).not.toHaveProperty("source");
  });

  it("identity: \"Pular opcionais\" stays disabled without a name", () => {
    renderCard(baseHandoff({ step: "identity", captured: {} }));
    expect(screen.getByRole("button", { name: "Pular opcionais" })).toBeDisabled();
  });

  it("images: \"Pular imagens\" removes every captured image explicitly, keeping none", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    renderCard(baseHandoff({
      step: "images",
      reading: { images: { runId: "r1", taskIntentId: "t1", status: "found" } },
      captured: { images: [{ id: "img-1", value: "https://cdn/1.png", origin: "site" }, { id: "img-2", value: "https://cdn/2.png", origin: "site" }] },
    }));

    fireEvent.click(screen.getByRole("button", { name: "Pular imagens" }));
    await waitFor(() => expect(mockPostEquipeCommand).toHaveBeenCalledTimes(1));
    const [, command] = mockPostEquipeCommand.mock.calls[0]!;
    expect((command as { type: string; payload: Record<string, unknown> })).toMatchObject({
      type: "handoff_confirm_images",
      payload: { kept: [], removed: ["img-1", "img-2"], uploaded: [] },
    });
  });
});

describe("HandoffCard: a background group finishing (images/networks) refreshes its own selection without resetting identity edits", () => {
  /** Re-renders the SAME tree (same QueryClient) with an updated handoff snapshot, as a poll refetch would. */
  function refetch(rerender: (ui: ReactElement) => void, client: QueryClient, handoff: Handoff) {
    mockUseEquipeAccountState.mockReturnValue({ data: { handoff }, isLoading: false, error: null, refetch: vi.fn() });
    rerender(
      <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
        <QueryClientProvider client={client}>
          <HandoffCard accountId="acc-1" handoffId={handoff.id} step={handoff.step} threadId="thread-1" />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );
  }

  it("images: newly captured images from a background refetch (pending -> found, same version) start selected", () => {
    const pending = baseHandoff({
      step: "images", version: 9,
      reading: { images: { runId: "r1", taskIntentId: "t1", status: "pending" } },
      captured: {},
    });
    const { client, rerender } = renderCard(pending);
    expect(screen.getByText("Na fila — a leitura continua em segundo plano.")).toBeInTheDocument();

    const found = baseHandoff({
      step: "images", version: 9, // same version: background progress never bumps it
      reading: { images: { runId: "r1", taskIntentId: "t1", status: "found" } },
      captured: { images: [{ id: "img-new", value: "https://cdn/new.png", origin: "site", key: "workspaces/ws/img-new.png" }] },
    });
    refetch(rerender, client, found);

    const toggle = screen.getByRole("checkbox");
    expect(toggle).toBeChecked();
  });

  it("networks: the same holds for a captured profile that arrives via a background refetch", () => {
    const pending = baseHandoff({
      step: "networks", version: 9,
      source: { kind: "site", value: "https://acme.com", normalized: "https://acme.com/" },
      reading: { networks: { runId: "r1", taskIntentId: "t1", status: "pending" } },
      captured: {},
    });
    const { client, rerender } = renderCard(pending);
    expect(screen.getByText("Na fila — a leitura continua em segundo plano.")).toBeInTheDocument();

    const found = baseHandoff({
      step: "networks", version: 9,
      source: { kind: "site", value: "https://acme.com", normalized: "https://acme.com/" },
      reading: { networks: { runId: "r1", taskIntentId: "t1", status: "found" } },
      captured: { networks: [{ id: "net-new", value: "acme.oficial", origin: "site", platform: "instagram" }] },
    });
    refetch(rerender, client, found);

    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByText("@acme.oficial")).toBeInTheDocument();
  });

  it("identity: an in-progress edit survives a background refetch of an UNRELATED group (networks/images still pending)", () => {
    const initial = baseHandoff({
      step: "identity", version: 9,
      captured: { name: [{ id: "n1", value: "Acme", origin: "site" }] },
    });
    const { client, rerender } = renderCard(initial);
    clickEditField("Nome");
    const nameInput = screen.getByRole("textbox", { name: "Nome" });
    fireEvent.change(nameInput, { target: { value: "Acme Corrigido" } });
    expect(screen.getByDisplayValue("Acme Corrigido")).toBeInTheDocument();

    // A background reconciliation refetch: still on identity, same version, only
    // the networks/images statuses (irrelevant to this step) moved along.
    const refetched = baseHandoff({
      step: "identity", version: 9,
      captured: { name: [{ id: "n1", value: "Acme", origin: "site" }] },
      reading: { networks: { runId: "r1", taskIntentId: "t1", status: "found" } },
    });
    refetch(rerender, client, refetched);

    // The person's edit — AND the fact the name field was left open for editing — survived.
    expect(screen.getByDisplayValue("Acme Corrigido")).toBeInTheDocument();
  });
});

describe("HandoffCard: images restoration", () => {
  it("re-checking a previously removed image restores it into the confirm_images kept list", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    renderCard(baseHandoff({
      step: "images",
      reading: { images: { runId: "r1", taskIntentId: "t1", status: "found" } },
      captured: { images: [
        { id: "img-1", value: "https://cdn/1.png", origin: "site", key: "workspaces/ws/1.png" },
        { id: "img-2", value: "https://cdn/2.png", origin: "site", key: "workspaces/ws/2.png" },
      ] },
      decisions: { images: { kept: ["img-1"], removed: ["img-2"], uploaded: [] } },
    }));

    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toBeChecked();
    expect(boxes[1]).not.toBeChecked();
    expect(boxes[1]).toHaveAccessibleName(/^Restaurar imagem/);

    fireEvent.click(boxes[1]!);
    expect(boxes[1]).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar →" }));
    await waitFor(() => expect(mockPostEquipeCommand).toHaveBeenCalledTimes(1));
    const [, command] = mockPostEquipeCommand.mock.calls[0]!;
    expect((command as { payload: { kept: string[]; removed: string[] } }).payload).toMatchObject({ kept: ["img-1", "img-2"], removed: [] });
  });
});

describe("HandoffCard: swapping the confirmed Instagram handle warns about the reread cost", () => {
  it("shows the reread warning only when the source itself is Instagram", () => {
    renderCard(baseHandoff({
      step: "networks",
      source: { kind: "instagram", value: "acme.oficial", normalized: "acme.oficial" },
      reading: { networks: { runId: "r1", taskIntentId: "t1", status: "found" } },
      captured: { networks: [{ id: "net1", value: "acme.oficial", origin: "instagram", platform: "instagram" }] },
      decisions: { networks: [{ id: "net1", value: "acme.oficial", origin: "instagram", platform: "instagram" }] },
    }));
    expect(screen.getByText("Trocar o @ refaz a leitura e pede a identidade de novo. Isso usa 1 das 3 leituras.")).toBeInTheDocument();
  });

  it("does not show the warning for a site source, even with a captured Instagram profile", () => {
    renderCard(baseHandoff({
      step: "networks",
      source: { kind: "site", value: "https://acme.com", normalized: "https://acme.com/" },
      reading: { networks: { runId: "r1", taskIntentId: "t1", status: "found" } },
      captured: { networks: [{ id: "net1", value: "acme.oficial", origin: "site", platform: "instagram" }] },
    }));
    expect(screen.queryByText("Trocar o @ refaz a leitura e pede a identidade de novo. Isso usa 1 das 3 leituras.")).not.toBeInTheDocument();
  });
});

describe("HandoffCard: reconfirming identity after the Instagram profile was removed/rejected (v4 palette pills)", () => {
  function revisionHandoff(overrides: Partial<HandoffState> = {}) {
    return baseHandoff({
      step: "identity",
      version: 12,
      source: { kind: "site", value: "https://acme.com", normalized: "https://acme.com/" },
      reading: {
        name: { runId: "r", taskIntentId: "t", status: "found" }, logo: { runId: "r", taskIntentId: "t", status: "not_found" },
        colors: { runId: "r", taskIntentId: "t", status: "found" }, fonts: { runId: "r", taskIntentId: "t", status: "found" },
      },
      // Only the site color survives; the rejected Instagram color was purged from captured.
      captured: { colors: [{ id: "site-color", value: "#111111", origin: "site" }] },
      decisions: {
        needsConfirmation: ["identity"],
        // The rejected Instagram palette was cleared, not left dangling.
        identity: { name: { id: "n1", value: "Acme", origin: "site" }, logo: null, colors: [], fonts: [], paletteChoice: "instagram" },
        // No Instagram profile confirmed anymore.
        networks: [],
      },
      ...overrides,
    });
  }

  it("shows the palette pills because of needsConfirmation, even without a second (Instagram) captured palette", () => {
    renderCard(revisionHandoff());
    expect(screen.getByText("O Instagram anterior foi retirado. Confira novamente as escolhas que dependiam dele.")).toBeInTheDocument();
    expect(screen.getByText("Qual paleta vale?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Do site" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Do Instagram" })).toBeInTheDocument();
  });

  it("disables the Instagram pill since no Instagram profile is confirmed — even though it's still the stale, disabled selection", () => {
    renderCard(revisionHandoff());
    const instagramPill = screen.getByRole("button", { name: "Do Instagram" });
    expect(instagramPill).toBeDisabled();
    // The stale decision (paletteChoice: "instagram") is still what's selected;
    // disabling the pill is what stops the person from resubmitting it.
    expect(instagramPill).toHaveAttribute("aria-pressed", "true");
  });

  it("also disables the Instagram pill when a profile IS confirmed but its colors were never captured", () => {
    renderCard(revisionHandoff({
      decisions: {
        needsConfirmation: ["identity"],
        identity: { name: { id: "n1", value: "Acme", origin: "site" }, logo: null, colors: [], fonts: [], paletteChoice: "site" },
        // Confirmed again, but this render never captured an Instagram color for it.
        networks: [{ id: "net-new", value: "novo.perfil", origin: "user", platform: "instagram" }],
      },
    }));
    expect(screen.getByRole("button", { name: "Do Instagram" })).toBeDisabled();
  });

  it("clicking the site pill marks it pressed and fills the colors preview from captured data — never retyped", () => {
    renderCard(revisionHandoff());
    const sitePill = screen.getByRole("button", { name: "Do site" });
    fireEvent.click(sitePill);
    expect(sitePill).toHaveAttribute("aria-pressed", "true");

    // Colors render as swatches in preview mode; opening the edit field shows the filled value.
    clickEditField("Cores");
    const colorsInput = screen.getByRole("textbox", { name: "Cores" }) as HTMLInputElement;
    expect(colorsInput.value).toBe("#111111");
  });

  it("sends the captured Instagram palette once the profile is confirmed again", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    renderCard(revisionHandoff({
      captured: { colors: [{ id: "site-color", value: "#111111", origin: "site" }, { id: "ig-color", value: "#222222", origin: "instagram" }] },
      decisions: {
        needsConfirmation: ["identity"],
        identity: { name: { id: "n1", value: "Acme", origin: "site" }, logo: null, colors: [], fonts: [], paletteChoice: "site" },
        networks: [{ id: "net-new", value: "novo.perfil", origin: "user", platform: "instagram" }],
      },
    }));
    expect(screen.getByRole("button", { name: "Do Instagram" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Do Instagram" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar →" }));
    await waitFor(() => expect(mockPostEquipeCommand).toHaveBeenCalledWith("acc-1", expect.objectContaining({ type: "handoff_confirm_identity", payload: expect.objectContaining({ paletteChoice: "instagram", colors: ["#222222"] }) })));
  });
});

it("summary only exposes the correction selector after the person asks, then sends the chosen step", async () => {
  mockPostEquipeCommand.mockResolvedValue({});
  renderCard(baseHandoff({ step: "summary" }));
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Corrigir algo" }));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "networks" } });
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  await waitFor(() => expect(mockPostEquipeCommand).toHaveBeenCalledWith("acc-1", { type: "handoff_back_to", payload: { expectedStep: "summary", expectedVersion: 3, step: "networks" } }));
});
