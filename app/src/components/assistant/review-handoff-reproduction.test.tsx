import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HandoffCard from "./HandoffCard";
import { EquipeCommandError } from "@/lib/equipe/commands";
import ptBR from "../../../messages/pt-BR.json";
import type { HandoffState } from "@/server/equipe/domain/handoff";
import { handoffAttachImageSchema, handoffAttachLogoSchema, handoffConfirmNetworksSchema } from "@/server/equipe/handoff/contract";

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

function renderCard(handoff: Handoff, extraProps: Partial<{ latest: boolean; disabled: boolean }> = {}, viewer?: { canDecideHandoff: boolean }) {
  mockUseEquipeAccountState.mockReturnValue({ data: { handoff, ...(viewer ? { viewer } : {}) }, isLoading: false, error: null, refetch: vi.fn() });
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
    await waitFor(() => expect(mockUploadChatAttachment).toHaveBeenCalledWith(file, { handoffId: "handoff-1" }));
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

  it("does not call the Instagram read a failure when only its palette could not be read (ticket 13, D-2)", () => {
    const run = (status: string, extra: Record<string, unknown> = {}) => ({ runId: "r", taskIntentId: "t", status, ...extra });
    renderCard(baseHandoff({ step: "summary", source: { kind: "instagram", value: "bauducco", normalized: "bauducco" },
      decisions: { networks: [{ id: "ig", value: "bauducco", platform: "instagram", origin: "instagram" }] },
      reading: { name: run("found"), logo: run("found"), colors: run("not_found", { error: "instagram_vision_failed" }), fonts: run("not_found"), networks: run("found"), images: run("found") },
    }));
    expect(screen.queryByText(/A leitura do Instagram confirmado falhou/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "É isso →" })).toBeEnabled();
  });

  it("defaults new profile images to selected while keeping the site's previous removal", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    renderCard(baseHandoff({ step: "images", reading: { images: { runId: "r", taskIntentId: "t", status: "found" } },
      captured: { images: [{ id: "site-kept", value: "/a.png", origin: "site", key: "workspaces/ws-1/a.png" }, { id: "site-removed", value: "/b.png", origin: "site", key: "workspaces/ws-1/b.png" }, { id: "new-ig", value: "/c.png", origin: "instagram", key: "workspaces/ws-1/c.png" }] },
      decisions: { needsConfirmation: ["images"], images: { kept: ["site-kept"], removed: ["site-removed"], uploaded: [] } },
    }));
    expect(screen.getByRole("checkbox", { name: "Remover imagem 3, do Instagram" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Restaurar imagem 2, do site" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar →" }));
    await waitFor(() => expect(mockPostEquipeCommand).toHaveBeenCalled());
    expect(mockPostEquipeCommand.mock.calls[0][1].payload).toMatchObject({ kept: ["site-kept", "new-ig"], removed: ["site-removed"] });
  });

  it.each([false, true])("restores an uploaded image, already removed on reload=%s", async (removed) => {
    mockPostEquipeCommand.mockResolvedValue({});
    renderCard(baseHandoff({
      step: "images", reading: { images: { runId: "r", taskIntentId: "t", status: "not_found" } },
      decisions: { images: { kept: [], removed: removed ? ["upload-1"] : [], uploaded: [{ id: "upload-1", value: "/api/workspace/assets/upload-1/file", origin: "user", key: "workspaces/ws-1/upload-1.png" }] } },
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
    expect(screen.getByRole("button", { name: "Ler o site" })).toBeVisible();
    fireEvent.change(screen.getByPlaceholderText("https://sua-marca.com.br"), { target: { value: "https://correct.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Ler o site" }));
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

const identity = (overrides: Partial<Handoff> = {}) => baseHandoff({
  step: "identity", version: 7, source: { kind: "site", value: "https://acme.com", normalized: "https://acme.com/" },
  reading: Object.fromEntries(["name", "logo", "colors", "fonts"].map(group => [group, { runId: "r", taskIntentId: "t", status: "found" }])),
  captured: { name: [{ id: "name", value: "Acme", origin: "site" }], logo: [{ id: "logo", value: "/logo.png", origin: "site" }] },
  ...overrides,
});

describe("review PR610: an uploaded logo is saved with the handoff and survives a reload", () => {
  const UPLOAD_ID = "0b6f2a54-3c1e-4d7a-9a51-2f0f5d8c7e11";
  const UPLOAD_KEY = "workspaces/ws-1/logo.png";
  const uploadUrl = `/api/workspace/assets/${UPLOAD_ID}/file`;
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

describe("review PR610: images uploaded before confirming are saved with the handoff and survive a reload", () => {
  const IMAGE_ID = "7d9e2c4a-5b1f-4e38-8a06-3c7f1d2b9e55";
  const IMAGE_KEY = "workspaces/ws-1/photo.png";
  const imageUrl = `/api/workspace/assets/${IMAGE_ID}/file`;
  const siteImage = { id: "site-1", value: "/site-1.png", origin: "site" as const, key: "workspaces/ws-1/site-1.png" };
  const saved = { id: IMAGE_ID, value: imageUrl, origin: "user" as const, key: IMAGE_KEY };
  const images = (overrides: Partial<Handoff> = {}) => baseHandoff({
    step: "images", version: 9, source: { kind: "site", value: "https://acme.com", normalized: "https://acme.com/" },
    reading: { images: { runId: "r", taskIntentId: "t", status: "found" } },
    captured: { images: [siteImage] },
    ...overrides,
  });
  const pickImageFile = () => fireEvent.change(screen.getByLabelText("Enviar imagem"), { target: { files: [new File(["image"], "photo.png", { type: "image/png" })] } });

  it("records each upload with the handoff command and, after a reload, shows it selected and confirms it without a new upload", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    mockUploadChatAttachment.mockResolvedValue({ assetId: IMAGE_ID, key: IMAGE_KEY, url: imageUrl });
    const firstVisit = renderCard(images());
    pickImageFile();
    await waitFor(() => expect(sent("handoff_attach_image")).toHaveLength(1));
    const [attach] = sent("handoff_attach_image");
    expect(attach!.payload).toEqual({ image: IMAGE_ID, expectedStep: "images", expectedVersion: 9 });
    expect(handoffAttachImageSchema.safeParse(attach!.payload).success).toBe(true);
    expect(await screen.findByRole("checkbox", { name: "Remover imagem 2, enviada por você" })).toBeChecked();
    expect(sent("handoff_confirm_images")).toHaveLength(0);

    // Reload before confirming: a brand-new card built from what the server stored.
    firstVisit.unmount();
    renderCard(images({ decisions: { uploadedImages: [saved] } }));
    expect(screen.getByRole("checkbox", { name: "Remover imagem 2, enviada por você" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Remover imagem 1, do site" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar →" }));
    await waitFor(() => expect(sent("handoff_confirm_images")).toHaveLength(1));
    expect(sent("handoff_confirm_images")[0]!.payload).toMatchObject({ kept: ["site-1", IMAGE_ID], removed: [], uploaded: [IMAGE_ID] });
    expect(mockUploadChatAttachment).toHaveBeenCalledTimes(1);
  });

  it("shows earlier decided uploads together with the saved ones, each once", () => {
    const decided = { id: "up-1", value: "/api/workspace/assets/up-1/file", origin: "user" as const, key: "workspaces/ws-1/up-1.png" };
    renderCard(images({ decisions: { images: { kept: ["site-1", "up-1"], removed: [], uploaded: [decided] }, uploadedImages: [decided, saved] } }));
    expect(screen.getAllByRole("checkbox", { name: /Remover imagem/ })).toHaveLength(3);
    expect(screen.getByRole("checkbox", { name: "Remover imagem 2, enviada por você" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Remover imagem 3, enviada por você" })).toBeChecked();
  });

  it("does not add an image the server could not store, and says the step changed", async () => {
    mockUploadChatAttachment.mockResolvedValue({ assetId: IMAGE_ID, key: IMAGE_KEY, url: imageUrl });
    mockPostEquipeCommand.mockRejectedValueOnce(new EquipeCommandError("stale_version", 409, "stale_version"));
    renderCard(images());
    pickImageFile();
    expect(await screen.findByRole("alert")).toHaveTextContent("O passo mudou");
    expect(screen.queryByRole("checkbox", { name: "Remover imagem 2, enviada por você" })).not.toBeInTheDocument();
    expect(sent("handoff_confirm_images")).toHaveLength(0);
  });

  it("still lets the person remove a saved upload before confirming", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    renderCard(images({ decisions: { uploadedImages: [saved] } }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Remover imagem 2, enviada por você" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar →" }));
    await waitFor(() => expect(sent("handoff_confirm_images")).toHaveLength(1));
    expect(sent("handoff_confirm_images")[0]!.payload).toMatchObject({ kept: ["site-1"], removed: [IMAGE_ID], uploaded: [IMAGE_ID] });
  });
});

describe("review PR610: a confirmed decision about the logo is never replaced by a default", () => {
  const managed = { id: "logo-managed", value: "/managed.png", origin: "site" as const, key: "workspaces/ws-1/managed.png" };
  const other = { id: "logo-other", value: "/other.png", origin: "site" as const, key: "workspaces/ws-1/other.png" };
  const decidedIdentity = (logo: typeof managed | null) => ({ name: { id: "name", value: "Acme", origin: "site" as const }, logo, colors: [], fonts: [], paletteChoice: "site" as const });

  it("keeps \"no logo\" when coming back to the identity step, even with a managed logo captured", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    renderCard(identity({ captured: { name: [{ id: "name", value: "Acme", origin: "site" }], logo: [managed] }, decisions: { revising: true, identity: decidedIdentity(null) } }));
    expect(screen.queryByRole("img", { name: "Logo" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar →" }));
    await waitFor(() => expect(sent("handoff_confirm_identity")).toHaveLength(1));
    expect(sent("handoff_confirm_identity")[0]!.payload.logo).toBeNull();
  });

  it("keeps the logo the person confirmed instead of the first managed one captured", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    renderCard(identity({ captured: { name: [{ id: "name", value: "Acme", origin: "site" }], logo: [managed, other] }, decisions: { revising: true, identity: decidedIdentity(other) } }));
    expect(screen.getByRole("img", { name: "Logo" })).toHaveAttribute("src", "/other.png");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar →" }));
    await waitFor(() => expect(sent("handoff_confirm_identity")).toHaveLength(1));
    expect(sent("handoff_confirm_identity")[0]!.payload.logo).toBe("logo-other");
  });

  it("a logo uploaded after deciding \"no logo\" is the one shown, because it is the latest act", () => {
    const upload = { id: "0b6f2a54-3c1e-4d7a-9a51-2f0f5d8c7e11", value: "/api/workspace/assets/0b6f2a54-3c1e-4d7a-9a51-2f0f5d8c7e11/file", origin: "user" as const, key: "workspaces/ws-1/logo.png" };
    renderCard(identity({ captured: { name: [{ id: "name", value: "Acme", origin: "site" }], logo: [managed] }, decisions: { revising: true, identity: decidedIdentity(null), uploadedLogo: upload } }));
    expect(screen.getByRole("img", { name: "Logo" })).toHaveAttribute("src", upload.value);
  });

  it("before any decision, the first managed logo captured is still the starting choice", () => {
    renderCard(identity({ captured: { name: [{ id: "name", value: "Acme", origin: "site" }], logo: [managed, other] } }));
    expect(screen.getByRole("img", { name: "Logo" })).toHaveAttribute("src", "/managed.png");
  });
});

describe("review PR608: a failed Instagram read can be retried from the card", () => {
  const site = { kind: "site" as const, value: "https://acme.com", normalized: "https://acme.com/" };
  const found = { runId: "r", taskIntentId: "t", status: "found" as const };
  const withInstagramFailure = { ...found, bySource: { site: found, instagram: { runId: "ig", taskIntentId: "ig", status: "failed" as const } } };
  const failedInstagram = (overrides: Partial<Handoff> = {}) => baseHandoff({
    step: "summary", version: 12, readsUsed: 2, source: site,
    decisions: { networks: [{ id: "ig", value: "acme", platform: "instagram", origin: "user" }] },
    reading: Object.fromEntries(["name", "logo", "colors", "fonts", "networks", "images"].map(group => [group, group === "images" ? withInstagramFailure : found])),
    ...overrides,
  });

  it("offers to read the profile again and sends the retry with the step and version it saw", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    renderCard(failedInstagram());
    expect(screen.getByRole("alert")).toHaveTextContent("A leitura do Instagram confirmado falhou");
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(sent("handoff_retry_reading")).toHaveLength(1));
    expect(sent("handoff_retry_reading")[0]!.payload).toEqual({ expectedStep: "summary", expectedVersion: 12 });
  });

  it("offers it on the images step as well", () => {
    renderCard(failedInstagram({ step: "images" }));
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeEnabled();
  });

  it("does not offer it when nothing failed", () => {
    renderCard(failedInstagram({ reading: Object.fromEntries(["name", "logo", "colors", "fonts", "networks", "images"].map(group => [group, found])) }));
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).not.toBeInTheDocument();
  });

  it("keeps a single retry on the reading step, which already has its own", () => {
    const failedRun = { runId: "r", taskIntentId: "t", status: "failed" as const, error: "reading_failed" };
    renderCard(baseHandoff({
      step: "reading", readsUsed: 1, source: { kind: "instagram", value: "@acme", normalized: "acme" },
      decisions: { networks: [{ id: "ig", value: "acme", platform: "instagram", origin: "user" }] },
      reading: Object.fromEntries(["name", "logo", "colors", "fonts", "networks", "images"].map(group => [group, failedRun])),
    }));
    expect(screen.getAllByRole("button", { name: "Tentar de novo" })).toHaveLength(1);
  });

  it("disables it once the three reads are used, and says so", () => {
    renderCard(failedInstagram({ readsUsed: 3 }));
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeDisabled();
    expect(screen.getByText(/3 leituras|três leituras/i)).toBeInTheDocument();
  });
});

describe("review PR610: a person who cannot decide sees the card read-only", () => {
  const readOnlyLine = "Só o aprovador da marca pode confirmar estes passos. Você acompanha por aqui.";
  const cannot = { canDecideHandoff: false };
  const site = { kind: "site" as const, value: "https://acme.com", normalized: "https://acme.com/" };
  const found = { runId: "r", taskIntentId: "t", status: "found" as const };
  const allFound = Object.fromEntries(["name", "logo", "colors", "fonts", "networks", "images"].map(group => [group, found]));
  const steps: Array<[string, () => Handoff]> = [
    ["source", () => baseHandoff({ step: "source" })],
    ["reading", () => baseHandoff({ step: "reading", source: site, readsUsed: 1, reading: { name: { ...found, status: "failed" }, logo: { ...found, status: "running" } } })],
    ["identity", () => identity()],
    ["networks", () => baseHandoff({ step: "networks", source: site, reading: allFound, captured: { networks: [{ id: "net", value: "acme.oficial", origin: "site", platform: "instagram" }] } })],
    ["images", () => baseHandoff({ step: "images", source: site, reading: allFound, captured: { images: [{ id: "img", value: "/img.png", origin: "site", key: "workspaces/ws-1/img.png" }] } })],
    ["summary", () => baseHandoff({ step: "summary", source: site, reading: allFound, decisions: {
      identity: { name: { id: "n", value: "Acme", origin: "site" }, logo: null, colors: [], fonts: [], paletteChoice: "site" }, networks: [], images: { kept: [], removed: [], uploaded: [] } } })],
  ];
  const controls = () => [...screen.queryAllByRole("button"), ...screen.queryAllByRole("textbox"), ...screen.queryAllByRole("checkbox"), ...screen.queryAllByRole("combobox")];

  it.each(steps)("%s: says who can confirm and leaves every control disabled", (_name, make) => {
    renderCard(make(), {}, cannot);
    expect(screen.getByText(readOnlyLine)).toBeInTheDocument();
    expect(controls().length).toBeGreaterThan(0);
    for (const control of controls()) expect(control).toBeDisabled();
    expect(mockPostEquipeCommand).not.toHaveBeenCalled();
  });

  it("sends nothing even when a form is submitted directly", () => {
    renderCard(identity({ captured: { name: [{ id: "name", value: "Acme", origin: "site" }] } }), {}, cannot);
    fireEvent.submit(screen.getByRole("button", { name: "Confirmar →" }).closest("form")!);
    expect(mockPostEquipeCommand).not.toHaveBeenCalled();
  });

  it("keeps the preview readable: the name is still shown", () => {
    renderCard(identity({ captured: { name: [{ id: "name", value: "Acme", origin: "site" }] } }), {}, cannot);
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });

  it("stays interactive for the approver, and when the account state does not say", () => {
    for (const viewer of [{ canDecideHandoff: true }, undefined]) {
      const view = renderCard(identity({ captured: { name: [{ id: "name", value: "Acme", origin: "site" }] } }), {}, viewer);
      expect(screen.queryByText(readOnlyLine)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Editar Nome" })).toBeEnabled();
      view.unmount();
    }
  });

  it("does not repeat the explanation on a card of a step already left", () => {
    renderCard(identity(), { latest: false }, cannot);
    expect(screen.queryByText(readOnlyLine)).not.toBeInTheDocument();
    expect(screen.getByTestId("handoff-history")).toBeInTheDocument();
  });
});

describe("review PR608: the networks the card starts from can always be confirmed", () => {
  const site = { kind: "site" as const, value: "https://acme.com", normalized: "https://acme.com/" };
  const found = { runId: "r", taskIntentId: "t", status: "found" as const };
  const limitHint = "Dá para manter até 10 redes. Desmarque uma para escolher outra.";
  const net = (id: string, platform: string, value = id) => ({ id, value, origin: "site" as const, platform });
  const networksStep = (networks: ReturnType<typeof net>[], overrides: Partial<Handoff> = {}) => baseHandoff({
    step: "networks", version: 5, source: site, reading: { networks: found }, captured: { networks }, ...overrides,
  });
  const many = (count: number) => Array.from({ length: count }, (_, i) => net(`fb-${i}`, "facebook", `https://facebook.com/marca-${i}`));
  const boxes = () => screen.getAllByRole("checkbox") as HTMLInputElement[];
  const checkedIds = () => boxes().filter(box => box.checked).length;

  it("starts from at most ten networks, so confirming the untouched card is accepted by the command", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    renderCard(networksStep(many(25)));
    expect(boxes()).toHaveLength(25);
    expect(checkedIds()).toBe(10);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar →" }));
    await waitFor(() => expect(sent("handoff_confirm_networks")).toHaveLength(1));
    const payload = sent("handoff_confirm_networks")[0]!.payload;
    expect(payload.kept).toEqual(many(25).slice(0, 10).map(i => i.id));
    expect(handoffConfirmNetworksSchema.safeParse(payload).success).toBe(true);
  });

  it("starts from a single Instagram profile when the site shows several", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    renderCard(networksStep([net("ig-1", "instagram", "acme.oficial"), net("fb", "facebook", "https://facebook.com/acme"), net("ig-2", "instagram", "agencia.rodape")]));
    expect(boxes().map(box => box.checked)).toEqual([true, true, false]);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar →" }));
    await waitFor(() => expect(sent("handoff_confirm_networks")).toHaveLength(1));
    expect(sent("handoff_confirm_networks")[0]!.payload.kept).toEqual(["ig-1", "fb"]);
  });

  it("keeps everything selected when it fits, without any limit notice", () => {
    renderCard(networksStep(many(4)));
    expect(checkedIds()).toBe(4);
    expect(boxes().every(box => !box.disabled)).toBe(true);
    expect(screen.queryByText(limitHint)).not.toBeInTheDocument();
  });

  it("at the limit, the other networks cannot be selected until one is cleared, and the card says why", () => {
    renderCard(networksStep(many(12)));
    expect(screen.getByText(limitHint)).toBeInTheDocument();
    expect(boxes().filter(box => !box.checked).every(box => box.disabled)).toBe(true);
    fireEvent.click(boxes()[0]!);
    expect(checkedIds()).toBe(9);
    expect(boxes().every(box => !box.disabled)).toBe(true);
    fireEvent.click(boxes()[11]!);
    expect(checkedIds()).toBe(10);
    expect(boxes().filter(box => !box.checked).every(box => box.disabled)).toBe(true);
  });

  it("choosing another Instagram profile replaces the selected one", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    renderCard(networksStep([net("ig-1", "instagram", "acme.oficial"), net("ig-2", "instagram", "agencia.rodape")]));
    expect(boxes().map(box => box.checked)).toEqual([true, false]);
    fireEvent.click(boxes()[1]!);
    expect(boxes().map(box => box.checked)).toEqual([false, true]);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar →" }));
    await waitFor(() => expect(sent("handoff_confirm_networks")).toHaveLength(1));
    expect(sent("handoff_confirm_networks")[0]!.payload.kept).toEqual(["ig-2"]);
  });

  it("at the limit, switching to another Instagram profile is still allowed, because it replaces and does not add", () => {
    renderCard(networksStep([net("ig-1", "instagram", "acme.oficial"), ...many(9), net("fb-extra", "facebook", "https://facebook.com/extra"), net("ig-2", "instagram", "agencia.rodape")]));
    expect(checkedIds()).toBe(10);
    const [first, ...rest] = boxes();
    const other = rest[rest.length - 1]!, extra = rest[rest.length - 2]!;
    expect(first!.checked).toBe(true);
    expect(extra.disabled).toBe(true);
    expect(other.disabled).toBe(false);
    fireEvent.click(other);
    expect([first!.checked, other.checked, checkedIds()]).toEqual([false, true, 10]);
  });

  it("a revisit starts from what was confirmed, limit included", () => {
    const confirmed = many(10);
    renderCard(networksStep([...many(10), ...many(15).slice(10).map(i => ({ ...i, id: `more-${i.id}` }))], { decisions: { networks: confirmed } }));
    expect(checkedIds()).toBe(10);
    expect(boxes().filter(box => !box.checked).every(box => box.disabled)).toBe(true);
  });

  describe("a typed profile takes a place of its own in the limit", () => {
    const noRoom = "Você já escolheu 10 redes. Desmarque uma para adicionar o @ digitado.";
    const typeHandle = (value: string) => fireEvent.change(screen.getByLabelText("Adicionar ou corrigir o @"), { target: { value } });
    const confirm = () => screen.getByRole("button", { name: "Confirmar →" });

    it("with ten networks selected, a typed profile has no room: the card says so and sends nothing", () => {
      renderCard(networksStep(many(10)));
      expect(checkedIds()).toBe(10);
      typeHandle("@acme");
      expect(screen.getByText(noRoom)).toBeInTheDocument();
      expect(confirm()).toBeDisabled();
      fireEvent.submit(confirm().closest("form")!);
      expect(mockPostEquipeCommand).not.toHaveBeenCalled();
    });

    it("clearing one network makes room, and nine kept plus the typed profile are what is sent", async () => {
      mockPostEquipeCommand.mockResolvedValue({});
      renderCard(networksStep(many(10)));
      typeHandle("@acme");
      fireEvent.click(boxes()[0]!);
      expect(screen.queryByText(noRoom)).not.toBeInTheDocument();
      expect(confirm()).toBeEnabled();
      fireEvent.click(confirm());
      await waitFor(() => expect(sent("handoff_confirm_networks")).toHaveLength(1));
      const payload = sent("handoff_confirm_networks")[0]!.payload;
      expect(payload.kept).toEqual(many(10).slice(1).map(i => i.id));
      expect(payload.added).toEqual([{ platform: "instagram", value: "@acme" }]);
      expect(handoffConfirmNetworksSchema.safeParse(payload).success).toBe(true);
    });

    it("reserves the place: with a profile typed, nine networks fill the limit and the others wait for one to be cleared", () => {
      renderCard(networksStep(many(12)));
      fireEvent.click(boxes()[0]!);
      expect(boxes().filter(box => !box.checked).every(box => !box.disabled)).toBe(true);
      typeHandle("@acme");
      expect(boxes().filter(box => !box.checked).map(box => box.disabled)).toEqual([true, true, true]);
      expect(screen.queryByText(noRoom)).not.toBeInTheDocument();
      expect(confirm()).toBeEnabled();
      typeHandle("");
      expect(boxes().filter(box => !box.checked).every(box => !box.disabled)).toBe(true);
    });

    it("a typed profile that replaces the selected Instagram one still fits: nine kept plus the typed profile", async () => {
      mockPostEquipeCommand.mockResolvedValue({});
      renderCard(networksStep([net("ig-1", "instagram", "acme.oficial"), ...many(9)]));
      expect(checkedIds()).toBe(10);
      typeHandle("@novo.perfil");
      expect(screen.queryByText(noRoom)).not.toBeInTheDocument();
      expect(confirm()).toBeEnabled();
      fireEvent.click(confirm());
      await waitFor(() => expect(sent("handoff_confirm_networks")).toHaveLength(1));
      const payload = sent("handoff_confirm_networks")[0]!.payload;
      expect(payload.kept).toEqual(many(9).map(i => i.id));
      expect(payload.added).toEqual([{ platform: "instagram", value: "@novo.perfil" }]);
      expect(handoffConfirmNetworksSchema.safeParse(payload).success).toBe(true);
    });

    describe("a brand has a single Instagram profile: the one chosen last replaces the other, with no refusal", () => {
      const handleInput = () => screen.getByLabelText("Adicionar ou corrigir o @") as HTMLInputElement;

      it("ticking a captured Instagram profile after typing one replaces the typed profile, so only one is sent", async () => {
        mockPostEquipeCommand.mockResolvedValue({});
        renderCard(networksStep([net("ig-1", "instagram", "acme.oficial"), net("fb", "facebook", "https://facebook.com/acme")]));
        typeHandle("@");
        expect(boxes().map(box => box.checked)).toEqual([false, true]);
        fireEvent.click(boxes()[0]!);
        expect(handleInput().value).toBe("");
        expect(boxes().map(box => box.checked)).toEqual([true, true]);
        fireEvent.click(confirm());
        await waitFor(() => expect(sent("handoff_confirm_networks")).toHaveLength(1));
        const payload = sent("handoff_confirm_networks")[0]!.payload;
        expect(new Set(payload.kept as string[])).toEqual(new Set(["ig-1", "fb"]));
        expect(payload.added).toEqual([]);
        expect(handoffConfirmNetworksSchema.safeParse(payload).success).toBe(true);
      });

      it("typing again afterwards replaces the ticked profile: the last choice always wins", async () => {
        mockPostEquipeCommand.mockResolvedValue({});
        renderCard(networksStep([net("ig-1", "instagram", "acme.oficial"), net("fb", "facebook", "https://facebook.com/acme")]));
        typeHandle("@primeiro");
        fireEvent.click(boxes()[0]!);
        expect(handleInput().value).toBe("");
        typeHandle("@segundo");
        expect(boxes().map(box => box.checked)).toEqual([false, true]);
        fireEvent.click(confirm());
        await waitFor(() => expect(sent("handoff_confirm_networks")).toHaveLength(1));
        const payload = sent("handoff_confirm_networks")[0]!.payload;
        expect(payload.kept).toEqual(["fb"]);
        expect(payload.added).toEqual([{ platform: "instagram", value: "@segundo" }]);
        expect(handoffConfirmNetworksSchema.safeParse(payload).success).toBe(true);
      });

      it("a captured profile that was already ticked is simply unticked, and the typed one stays", async () => {
        mockPostEquipeCommand.mockResolvedValue({});
        renderCard(networksStep([net("ig-1", "instagram", "acme.oficial")]));
        expect(boxes()[0]!.checked).toBe(true);
        fireEvent.click(boxes()[0]!);
        expect(boxes()[0]!.checked).toBe(false);
        typeHandle("@novo");
        fireEvent.click(confirm());
        await waitFor(() => expect(sent("handoff_confirm_networks")).toHaveLength(1));
        const payload = sent("handoff_confirm_networks")[0]!.payload;
        expect(payload.kept).toEqual([]);
        expect(payload.added).toEqual([{ platform: "instagram", value: "@novo" }]);
      });

      it("with nine other networks and a typed profile, ticking the captured one still has a place, because it takes the typed one's", async () => {
        mockPostEquipeCommand.mockResolvedValue({});
        renderCard(networksStep([net("ig-1", "instagram", "acme.oficial"), ...many(9)]));
        typeHandle("@acme");
        const [captured] = boxes();
        expect(captured!.checked).toBe(false);
        expect(captured!.disabled).toBe(false);
        fireEvent.click(captured!);
        expect(handleInput().value).toBe("");
        expect(checkedIds()).toBe(10);
        expect(confirm()).toBeEnabled();
        fireEvent.click(confirm());
        await waitFor(() => expect(sent("handoff_confirm_networks")).toHaveLength(1));
        const payload = sent("handoff_confirm_networks")[0]!.payload;
        expect(payload.kept).toHaveLength(10);
        expect(payload.added).toEqual([]);
        expect(handoffConfirmNetworksSchema.safeParse(payload).success).toBe(true);
      });

      it("with ten other networks selected, the captured profile cannot be ticked and the typed one is kept, not dropped", () => {
        renderCard(networksStep([...many(10), net("ig-1", "instagram", "acme.oficial")]));
        typeHandle("@acme");
        const captured = boxes()[10]!;
        expect(captured.checked).toBe(false);
        expect(captured.disabled).toBe(true);
        fireEvent.click(captured);
        expect(handleInput().value).toBe("@acme");
        expect(screen.getByText(noRoom)).toBeInTheDocument();
        expect(confirm()).toBeDisabled();
      });
    });
  });
});

describe("review PR608: the summary correction does not offer the source once the three readings are used", () => {
  const site = { kind: "site" as const, value: "https://acme.com", normalized: "https://acme.com/" };
  const found = { runId: "r", taskIntentId: "t", status: "found" as const };
  const sourceLocked = "Você usou as 3 leituras, então não dá mais para trocar o site ou o Instagram. Os outros passos continuam editáveis.";
  const summary = (readsUsed: number) => baseHandoff({ step: "summary", version: 4, readsUsed, source: site,
    reading: Object.fromEntries(["name", "logo", "colors", "fonts", "networks", "images"].map(group => [group, found])),
    decisions: { identity: { name: { id: "n", value: "Acme", origin: "site" }, logo: null, colors: [], fonts: [], paletteChoice: "site" }, networks: [], images: { kept: [], removed: [], uploaded: [] } } });
  const openCorrection = () => fireEvent.click(screen.getByRole("button", { name: "Corrigir algo" }));
  const choices = () => screen.getAllByRole("option").map(option => option.textContent);

  it("offers the source while a reading is left, without any notice", () => {
    renderCard(summary(2)); openCorrection();
    expect(choices()).toEqual(["Fonte", "Identidade", "Redes", "Imagens"]);
    expect(screen.queryByText(sourceLocked)).not.toBeInTheDocument();
  });

  it("with the three readings used, offers only the steps that can still be edited, says why, and sends the one chosen", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    renderCard(summary(3)); openCorrection();
    expect(choices()).toEqual(["Identidade", "Redes", "Imagens"]);
    expect(screen.getByText(sourceLocked)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "images" } });
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    await waitFor(() => expect(sent("handoff_back_to")).toHaveLength(1));
    expect(sent("handoff_back_to")[0]!.payload).toMatchObject({ expectedStep: "summary", step: "images" });
  });

  it("never sends a source that was chosen before the last reading was used", async () => {
    mockPostEquipeCommand.mockResolvedValue({});
    const view = renderCard(summary(2)); openCorrection();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "source" } });
    // A retry elsewhere on the card used the third reading; the card keeps its place and now has no source to offer.
    mockUseEquipeAccountState.mockReturnValue({ data: { handoff: summary(3) }, isLoading: false, error: null, refetch: vi.fn() });
    view.rerender(
      <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
        <QueryClientProvider client={view.client}>
          <HandoffCard accountId="acc-1" handoffId="handoff-1" step="summary" threadId="thread-1" />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );
    expect(choices()).toEqual(["Identidade", "Redes", "Imagens"]);
    expect(screen.getByRole("combobox")).toHaveValue("identity");
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    await waitFor(() => expect(sent("handoff_back_to")).toHaveLength(1));
    expect(sent("handoff_back_to")[0]!.payload).toMatchObject({ step: "identity" });
  });
});
