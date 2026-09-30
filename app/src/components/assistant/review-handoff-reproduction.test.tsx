import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

describe("review PR608: uploaded-image restoration and late palette", () => {
  it.each([false, true])("restores an uploaded image, already removed on reload=%s", async (removed) => {
    mockPostEquipeCommand.mockResolvedValue({});
    renderCard(baseHandoff({
      step: "images", reading: { images: { runId: "r", taskIntentId: "t", status: "not_found" } },
      decisions: { images: { kept: [], removed: removed ? ["upload-1"] : [], uploaded: [{ id: "upload-1", value: "/api/workspace/assets/upload-1/file", origin: "user" }] } },
    }));
    if (!removed) fireEvent.click(screen.getByRole("checkbox", { name: /Remover imagem/ }));
    expect(screen.getByRole("checkbox", { name: /Restaurar imagem/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Restaurar imagem/ }));
    expect(screen.getByRole("checkbox", { name: /Remover imagem/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar →" }));
    await waitFor(() => expect(mockPostEquipeCommand).toHaveBeenCalled());
    expect(mockPostEquipeCommand.mock.calls[0][1].payload).toMatchObject({ kept: ["upload-1"], removed: [], uploaded: ["upload-1"] });
  });

  it("omits removed uploads from the summary thumbnails", () => {
    renderCard(baseHandoff({ step: "summary", decisions: { images: {
      kept: [], removed: ["upload-1"], uploaded: [{ id: "upload-1", value: "/api/workspace/assets/upload-1/file", origin: "user" }],
    } } }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders a named return-source option while the reading remains pending/running", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    renderCard(baseHandoff({
      step: "reading", readsUsed: 1,
      source: { kind: "site", value: "https://acme.com", normalized: "https://acme.com/" },
      reading: Object.fromEntries(["name", "logo", "colors", "fonts", "networks", "images"].map(g => [g, { runId: "r", taskIntentId: "t", status: "pending" }])),
    }));
    fireEvent.click(screen.getByText("Corrigir a fonte (refaz a leitura)"));
    expect(screen.getByRole("button", { name: "Ler minha marca" })).toBeVisible();
    fireEvent.change(screen.getByPlaceholderText("https://sua-marca.com.br"), { target: { value: "https://correct.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Ler minha marca" }));
    await waitFor(() => expect(mockPostEquipeCommand).toHaveBeenCalled());
    expect(mockPostEquipeCommand.mock.calls[0][1]).toMatchObject({ type: "handoff_set_source", payload: { kind: "site", value: "https://correct.com", expectedStep: "reading", expectedVersion: 3 } });
  });

  it.each([false, true])("reconciles the late IG palette while preserving explicit edits=%s", async (edited) => {
    mockPostEquipeCommand.mockResolvedValue({});
    const initial = baseHandoff({
      step: "identity", version: 10,
      source: { kind: "site", value: "https://acme.com", normalized: "https://acme.com/" },
      reading: {
        name: { runId: "r", taskIntentId: "t", status: "found" }, logo: { runId: "r", taskIntentId: "t", status: "not_found" },
        colors: { runId: "r-ig", taskIntentId: "t-ig", status: "pending" }, fonts: { runId: "r", taskIntentId: "t", status: "not_found" },
      },
      captured: { name: [{ id: "name-site", value: "Acme", origin: "site" }] },
      decisions: {
        needsConfirmation: ["identity"], revising: true,
        identity: { name: { id: "name-site", value: "Acme", origin: "site" }, logo: null, colors: [], fonts: [], paletteChoice: "instagram" },
        networks: [{ id: "new-ig", value: "new.profile", origin: "user", platform: "instagram" }],
      },
    });
    const { client, rerender } = renderCard(initial);
    expect(screen.getByRole("button", { name: "Confirmar →" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Editar Nome" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nome" }), { target: { value: "Nome editado" } });
    if (edited) {
      fireEvent.click(screen.getByRole("button", { name: "Editar Cores" }));
      fireEvent.change(screen.getByRole("textbox", { name: "Cores" }), { target: { value: "#123456" } });
    }
    const found = { ...initial, reading: { ...initial.reading, colors: { runId: "r-ig", taskIntentId: "t-ig", status: "found" as const } }, captured: { ...initial.captured, colors: [{ id: "new-color", value: "#222222", origin: "instagram" as const }] } };
    mockUseEquipeAccountState.mockReturnValue({ data: { handoff: found }, isLoading: false, error: null, refetch: vi.fn() });
    rerender(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><QueryClientProvider client={client}><HandoffCard accountId="acc-1" handoffId={found.id} step="identity" threadId="thread-1" /></QueryClientProvider></NextIntlClientProvider>);
    if (edited) expect(screen.getByText("Nome editado")).toBeInTheDocument();
    else expect(screen.getByRole("textbox", { name: "Nome" })).toHaveValue("Nome editado");
    expect(screen.getByRole("button", { name: "Do Instagram" })).toHaveAttribute("aria-pressed", String(!edited));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar →" }));
    await waitFor(() => expect(mockPostEquipeCommand).toHaveBeenCalled());
    expect(mockPostEquipeCommand.mock.calls[0][1].payload).toMatchObject({ name: "Nome editado", colors: [edited ? "#123456" : "#222222"], paletteChoice: edited ? "user" : "instagram" });
  });
});
