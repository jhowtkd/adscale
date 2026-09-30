import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HandoffCard from "./HandoffCard";
import { EquipeCommandError } from "@/lib/equipe/commands";
import ptBR from "../../../messages/pt-BR.json";
import type { HandoffState } from "@/server/equipe/domain/handoff";
import { handoffAttachLogoSchema } from "@/server/equipe/handoff/contract";

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

/** The commands the card posted, in order, optionally narrowed to one type. */
const sent = (type?: string) => mockPostEquipeCommand.mock.calls
  .map(([, command]) => command as { type: string; payload: Record<string, unknown> })
  .filter(command => !type || command.type === type);

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
  it("offers upload and disables an unmanaged captured logo, then confirms the managed upload with handoff context", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    mockUploadChatAttachment.mockResolvedValue({ assetId: "managed-upload", key: "workspaces/logo.png", url: "/logo.png" });
    renderCard(baseHandoff({ step: "identity", source: { kind: "site", value: "https://acme.com", normalized: "https://acme.com/" },
      reading: Object.fromEntries(["name", "logo", "colors", "fonts"].map(group => [group, { runId: "r", taskIntentId: "t", status: "found" }])),
      captured: { name: [{ id: "name", value: "Acme", origin: "site" }], logo: [{ id: "logo", value: "/logo.png", origin: "site" }] },
    }));
    expect(screen.getByText(/O logo encontrado ainda não tem uma cópia salva/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar Logo" }));
    expect(screen.getByRole("option", { name: "Do site" })).toBeDisabled();
    const file = new File(["image"], "logo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Enviar logo"), { target: { files: [file] } });
    await waitFor(() => expect(mockUploadChatAttachment).toHaveBeenCalledWith(file, "handoff-1"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar →" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Confirmar →" }));
    await waitFor(() => expect(sent("handoff_confirm_identity")).toHaveLength(1));
    expect(sent("handoff_confirm_identity")[0]!.payload.logo).toBe("managed-upload");
  });

  it("blocks finishing and displays the fixed message when the confirmed Instagram failed", () => {
    renderCard(baseHandoff({ step: "summary", decisions: { networks: [{ id: "ig", value: "private", platform: "instagram", origin: "user" }] },
      reading: Object.fromEntries(["name", "logo", "colors", "fonts", "networks", "images"].map(group => [group, { runId: "r", taskIntentId: "t", status: "found", ...(group === "images" ? { bySource: { site: { runId: "r", taskIntentId: "t", status: "found" }, instagram: { runId: "ig", taskIntentId: "ig", status: "failed" } } } : {}) }])),
    }));
    expect(screen.getByRole("alert")).toHaveTextContent("A leitura do Instagram confirmado falhou");
    expect(screen.getByRole("button", { name: "É isso →" })).toBeDisabled();
  });

  it("defaults new profile images to selected while keeping the site's previous removal", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    renderCard(baseHandoff({ step: "images", reading: { images: { runId: "r", taskIntentId: "t", status: "found" } },
      captured: { images: [{ id: "site-kept", value: "/a.png", origin: "site" }, { id: "site-removed", value: "/b.png", origin: "site" }, { id: "new-ig", value: "/c.png", origin: "instagram" }] },
      decisions: { needsConfirmation: ["images"], images: { kept: ["site-kept"], removed: ["site-removed"], uploaded: [] } },
    }));
    expect(screen.getByRole("checkbox", { name: /Remover imagem new-ig/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Restaurar imagem site-removed/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar →" }));
    await waitFor(() => expect(mockPostEquipeCommand).toHaveBeenCalled());
    expect(mockPostEquipeCommand.mock.calls[0][1].payload).toMatchObject({ kept: ["site-kept", "new-ig"], removed: ["site-removed"] });
  });

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

describe("review PR610: an uploaded logo is saved with the handoff and survives a reload", () => {
  const UPLOAD_ID = "0b6f2a54-3c1e-4d7a-9a51-2f0f5d8c7e11";
  const UPLOAD_KEY = "workspaces/ws-1/logo.png";
  const uploadUrl = `/api/workspace/assets/${UPLOAD_ID}/file`;
  const identity = (overrides: Partial<Handoff> = {}) => baseHandoff({
    step: "identity", version: 7, source: { kind: "site", value: "https://acme.com", normalized: "https://acme.com/" },
    reading: Object.fromEntries(["name", "logo", "colors", "fonts"].map(group => [group, { runId: "r", taskIntentId: "t", status: "found" }])),
    captured: { name: [{ id: "name", value: "Acme", origin: "site" }], logo: [{ id: "logo", value: "/logo.png", origin: "site" }] },
    ...overrides,
  });
  function pickLogoFile() {
    fireEvent.click(screen.getByRole("button", { name: "Editar Logo" }));
    fireEvent.change(screen.getByLabelText("Enviar logo"), { target: { files: [new File(["image"], "logo.png", { type: "image/png" })] } });
  }

  it("records the upload with the handoff command and, after a reload, shows it again and confirms it without a new upload", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    mockUploadChatAttachment.mockResolvedValue({ assetId: UPLOAD_ID, key: UPLOAD_KEY, url: "/logo.png" });
    const firstVisit = renderCard(identity());
    pickLogoFile();
    await waitFor(() => expect(sent("handoff_attach_logo")).toHaveLength(1));
    const [attach] = sent("handoff_attach_logo");
    expect(attach!.payload).toEqual({ logo: UPLOAD_ID, expectedStep: "identity", expectedVersion: 7 });
    expect(handoffAttachLogoSchema.safeParse(attach!.payload).success).toBe(true);
    expect(await screen.findByRole("option", { name: "Enviado por você" })).toBeInTheDocument();
    expect(sent("handoff_confirm_identity")).toHaveLength(0);

    // Reload before confirming: a brand-new card built from what the server stored.
    firstVisit.unmount();
    renderCard(identity({ decisions: { uploadedLogo: { id: UPLOAD_ID, value: uploadUrl, origin: "user", key: UPLOAD_KEY } } }));
    expect(screen.getByRole("img", { name: "Logo" })).toHaveAttribute("src", uploadUrl);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar →" }));
    await waitFor(() => expect(sent("handoff_confirm_identity")).toHaveLength(1));
    expect(sent("handoff_confirm_identity")[0]!.payload.logo).toBe(UPLOAD_ID);
    expect(mockUploadChatAttachment).toHaveBeenCalledTimes(1);
  });

  it("keeps the saved upload selectable in the logo editor after a reload", () => {
    renderCard(identity({ decisions: { uploadedLogo: { id: UPLOAD_ID, value: uploadUrl, origin: "user", key: UPLOAD_KEY } } }));
    fireEvent.click(screen.getByRole("button", { name: "Editar Logo" }));
    const select = screen.getByRole("combobox", { name: "Logo" }) as HTMLSelectElement;
    expect(select.value).toBe(UPLOAD_ID);
    expect(screen.getByRole("option", { name: "Enviado por você" })).toBeEnabled();
  });

  it("does not select a logo the server could not store, and says the step changed", async () => {
    mockUploadChatAttachment.mockResolvedValue({ assetId: UPLOAD_ID, key: UPLOAD_KEY, url: "/logo.png" });
    mockPostEquipeCommand.mockRejectedValueOnce(new EquipeCommandError("stale_version", 409, "stale_version"));
    renderCard(identity());
    pickLogoFile();
    expect(await screen.findByRole("alert")).toHaveTextContent("O passo mudou");
    expect(screen.queryByRole("option", { name: "Enviado por você" })).not.toBeInTheDocument();
    expect(sent("handoff_confirm_identity")).toHaveLength(0);
  });

  it("without a saved upload, a reload still starts from the reader's logo choices", () => {
    renderCard(identity({ captured: { name: [{ id: "name", value: "Acme", origin: "site" }], logo: [{ id: "logo", value: "/logo.png", origin: "site", key: "workspaces/ws-1/site-logo.png" }] } }));
    expect(screen.getByRole("img", { name: "Logo" })).toHaveAttribute("src", "/logo.png");
  });
});
