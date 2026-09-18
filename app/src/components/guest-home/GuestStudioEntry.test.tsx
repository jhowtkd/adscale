import {
  fireEvent,
  render,
  screen,
  waitFor,
  type RenderOptions,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientProfile } from "@/lib/hooks/use-client-profiles";
import { GuestStudioEntry } from "./GuestStudioEntry";
import { createDraft } from "./guest-core.mjs";
import type { GuestDraft } from "./guest-core.mjs";

const GUEST_ID = "dd111111-1111-4111-8111-111111111111";
const NOW = 1789680000000;

const draftFixture = (request = "Pedido público de teste"): GuestDraft =>
  createDraft({ request, intent: "single", files: [] }, GUEST_ID, NOW);

const brand = (id: string, name: string): ClientProfile =>
  ({
    id,
    workspaceId: "ws-1",
    name,
    description: null,
    visualNotes: null,
    toneNotes: null,
    constraints: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as ClientProfile;

const storeMocks = vi.hoisted(() => ({
  loadDraft: vi.fn<(id: string) => Promise<GuestDraft | null>>(),
  removeDraft: vi.fn<(id: string) => Promise<void>>(),
}));

vi.mock("./guest-store.mjs", () => ({
  loadDraft: (...args: unknown[]) => storeMocks.loadDraft(...(args as [string])),
  removeDraft: (...args: unknown[]) =>
    storeMocks.removeDraft(...(args as [string])),
  saveDraft: vi.fn(),
  loadLastDraft: vi.fn(async () => null),
  pruneExpiredDrafts: vi.fn(async () => {}),
}));

const profileState = vi.hoisted(() => ({
  profiles: [] as ClientProfile[],
  activeClientProfileId: null as string | null,
  isLoading: false,
  isError: false,
}));

vi.mock("@/lib/hooks/use-active-client-profile", () => ({
  useActiveClientProfile: () => ({
    profiles: profileState.profiles,
    activeProfile:
      profileState.profiles.find(
        (p) => p.id === profileState.activeClientProfileId,
      ) ?? null,
    activeClientProfileId: profileState.activeClientProfileId,
    requiresSelection:
      profileState.profiles.length > 1 &&
      profileState.activeClientProfileId === null,
    isLoading: profileState.isLoading,
    isError: profileState.isError,
    selectProfile: (id: string) => {
      profileState.activeClientProfileId = id;
    },
  }),
}));

const refetchSpy = vi.fn(async () => ({}));

vi.mock("@/lib/hooks/use-client-profiles", () => ({
  useClientProfiles: () => ({ refetch: refetchSpy }),
}));

vi.mock("@/components/assistant/AssistantCreateClientDialog", () => ({
  default: (props: { open: boolean; onSuccess?: (id: string) => void }) =>
    props.open ? (
      <button
        data-testid="mock-create-brand"
        onClick={() => props.onSuccess?.("brand-new")}
      >
        mock create
      </button>
    ) : null,
}));

const entryProps = {
  userId: "user-1",
  workspaceId: "ws-1",
  importEnabled: true,
  attachmentsEnabled: false,
} as const;

function setBrands(profiles: ClientProfile[], activeId: string | null = null) {
  profileState.profiles = profiles;
  profileState.activeClientProfileId = activeId;
  profileState.isLoading = false;
  profileState.isError = false;
}

function renderEntry(ui: ReactElement, options?: RenderOptions) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
    options,
  );
  return {
    ...result,
    rerenderEntry: (next: ReactElement) =>
      result.rerender(
        <QueryClientProvider client={client}>{next}</QueryClientProvider>,
      ),
    unmountEntry: () => {
      result.unmount();
      client.clear();
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  storeMocks.loadDraft.mockReset();
  storeMocks.removeDraft.mockReset();
  refetchSpy.mockReset();
  storeMocks.loadDraft.mockResolvedValue(draftFixture());
  storeMocks.removeDraft.mockResolvedValue(undefined);
  setBrands([brand("brand-1", "Café Moka")], "brand-1");
});

describe("GuestStudioEntry", () => {
  it("reviews the draft with the real brand name and an enabled confirm", async () => {
    renderEntry(
      <GuestStudioEntry
        {...entryProps}
        handoff={{ kind: "guest", id: GUEST_ID }}
      />,
    );
    await screen.findByText("Pedido público de teste");
    expect(screen.getAllByText(/Café Moka/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Usar este pedido" }),
    ).toBeEnabled();
    expect(storeMocks.loadDraft).toHaveBeenCalledWith(GUEST_ID);
  });

  it("applies no data for invalid handoffs", () => {
    renderEntry(
      <GuestStudioEntry {...entryProps} handoff={{ kind: "invalid" }} />,
    );
    expect(screen.getByText(/link de continuação é inválido/i)).toBeInTheDocument();
    expect(storeMocks.loadDraft).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /página inicial/i })).toHaveAttribute(
      "href",
      "/hi",
    );
  });

  it("offers both conflict choices without overlaying data", () => {
    renderEntry(
      <GuestStudioEntry
        {...entryProps}
        handoff={{ kind: "conflict", id: GUEST_ID }}
        conflictHrefs={{
          openExisting: "/?workId=w-1",
          continueWithGuest: `/?guestDraft=${GUEST_ID}`,
        }}
      />,
    );
    expect(storeMocks.loadDraft).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: /trabalho existente/i }),
    ).toHaveAttribute("href", "/?workId=w-1");
    expect(
      screen.getByRole("link", { name: /pedido da página inicial/i }),
    ).toHaveAttribute("href", `/?guestDraft=${GUEST_ID}`);
  });

  it("explains missing drafts honestly without promising sync", async () => {
    storeMocks.loadDraft.mockResolvedValue(null);
    renderEntry(
      <GuestStudioEntry
        {...entryProps}
        handoff={{ kind: "guest", id: GUEST_ID }}
      />,
    );
    await screen.findByText(/não está disponível aqui/i);
    expect(screen.getByText(/outro navegador ou dispositivo/i)).toBeInTheDocument();
    expect(screen.getByText(/não sincronizam/i)).toBeInTheDocument();
  });

  it("recovery mode offers copy and confirmed discard, never import", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderEntry(
      <GuestStudioEntry
        {...entryProps}
        importEnabled={false}
        handoff={{ kind: "guest", id: GUEST_ID }}
      />,
    );
    await screen.findByText(/importação está desligada/i);
    expect(
      screen.queryByRole("button", { name: "Usar este pedido" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Copiar texto" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("Pedido público de teste");
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Descartar cópia local" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirmar descarte" }));
    await waitFor(() => {
      expect(storeMocks.removeDraft).toHaveBeenCalledWith(GUEST_ID);
    });
    await screen.findByText(/cópia local descartada/i);
  });

  it("zero brands offers creation and keeps the draft", async () => {
    setBrands([]);
    const { rerenderEntry } = renderEntry(
      <GuestStudioEntry
        {...entryProps}
        handoff={{ kind: "guest", id: GUEST_ID }}
      />,
    );
    await screen.findByText(/ainda não tem uma marca/i);
    expect(
      screen.getByRole("button", { name: "Usar este pedido" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Criar marca" }));
    fireEvent.click(screen.getByTestId("mock-create-brand"));
    setBrands([brand("brand-new", "Nova Marca")], "brand-new");
    rerenderEntry(
      <GuestStudioEntry
        {...entryProps}
        handoff={{ kind: "guest", id: GUEST_ID }}
      />,
    );
    await screen.findByText("Pedido público de teste");
    expect(
      screen.getByRole("button", { name: "Usar este pedido" }),
    ).toBeEnabled();
  });

  it("many brands require a real choice, never the first by convenience", async () => {
    setBrands([brand("brand-1", "Moka"), brand("brand-2", "Runclub")], null);
    const { rerenderEntry } = renderEntry(
      <GuestStudioEntry
        {...entryProps}
        handoff={{ kind: "guest", id: GUEST_ID }}
      />,
    );
    await screen.findByLabelText("Marca do pedido");
    expect(
      screen.getByRole("button", { name: "Usar este pedido" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Marca do pedido"), {
      target: { value: "brand-2" },
    });
    rerenderEntry(
      <GuestStudioEntry
        {...entryProps}
        handoff={{ kind: "guest", id: GUEST_ID }}
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Usar este pedido" }),
      ).toBeEnabled();
    });
    expect(screen.getAllByText(/Runclub/).length).toBeGreaterThan(0);
  });

  it("brand list failure shows error with retry", async () => {
    profileState.isLoading = false;
    profileState.isError = true;
    profileState.profiles = [];
    renderEntry(
      <GuestStudioEntry
        {...entryProps}
        handoff={{ kind: "guest", id: GUEST_ID }}
      />,
    );
    await screen.findByText(/não foi possível carregar suas marcas/i);
    fireEvent.click(screen.getByRole("button", { name: /tentar novamente/i }));
    expect(refetchSpy).toHaveBeenCalled();
  });

  it("confirm freezes context and reconciles when the draft vanishes", async () => {
    storeMocks.loadDraft
      .mockResolvedValueOnce(draftFixture())
      .mockResolvedValueOnce(null);
    renderEntry(
      <GuestStudioEntry
        {...entryProps}
        handoff={{ kind: "guest", id: GUEST_ID }}
      />,
    );
    await screen.findByText("Pedido público de teste");
    fireEvent.click(screen.getByRole("button", { name: "Usar este pedido" }));
    await screen.findByText(/mudou durante a confirmação/i);
    expect(
      screen.queryByText(/nada foi criado ainda/i),
    ).not.toBeInTheDocument();
  });

  it("mid-operation brand change cancels and asks for reconciliation", async () => {
    setBrands([brand("brand-1", "Moka"), brand("brand-2", "Runclub")], "brand-1");
    let resolveConfirmRead!: (value: GuestDraft | null) => void;
    storeMocks.loadDraft
      .mockResolvedValueOnce(draftFixture())
      .mockImplementationOnce(
        () => new Promise((resolve) => { resolveConfirmRead = resolve; }),
      );
    const { rerenderEntry } = renderEntry(
      <GuestStudioEntry
        {...entryProps}
        handoff={{ kind: "guest", id: GUEST_ID }}
      />,
    );
    await screen.findByText("Pedido público de teste");
    fireEvent.click(screen.getByRole("button", { name: "Usar este pedido" }));
    await screen.findByText(/confirmando/i);
    setBrands([brand("brand-1", "Moka"), brand("brand-2", "Runclub")], "brand-2");
    rerenderEntry(
      <GuestStudioEntry
        {...entryProps}
        handoff={{ kind: "guest", id: GUEST_ID }}
      />,
    );
    resolveConfirmRead(draftFixture());
    await screen.findByText(/mudou durante a confirmação|mudou neste navegador/i);
  });

  it("new guestDraftId starts a new read and ignores stale responses", async () => {
    let resolveFirst!: (value: GuestDraft | null) => void;
    const secondId = "ee222222-2222-4222-8222-222222222222";
    storeMocks.loadDraft.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve; }),
    );
    const { rerenderEntry } = renderEntry(
      <GuestStudioEntry
        {...entryProps}
        handoff={{ kind: "guest", id: GUEST_ID }}
      />,
    );
    rerenderEntry(
      <GuestStudioEntry
        {...entryProps}
        handoff={{ kind: "guest", id: secondId }}
      />,
    );
    resolveFirst(draftFixture("Pedido antigo"));
    await screen.findByText("Pedido público de teste");
    expect(screen.queryByText("Pedido antigo")).not.toBeInTheDocument();
  });

  it("confirmed state claims no creation", async () => {
    renderEntry(
      <GuestStudioEntry
        {...entryProps}
        handoff={{ kind: "guest", id: GUEST_ID }}
      />,
    );
    await screen.findByText("Pedido público de teste");
    fireEvent.click(screen.getByRole("button", { name: "Usar este pedido" }));
    await screen.findByText(/nada foi criado ainda/i);
  });

  it("renders visitor markup as literal text", async () => {
    storeMocks.loadDraft.mockResolvedValue(
      draftFixture("<img src=x onerror=alert(1)>"),
    );
    const { container } = renderEntry(
      <GuestStudioEntry
        {...entryProps}
        handoff={{ kind: "guest", id: GUEST_ID }}
      />,
    );
    await screen.findByText("<img src=x onerror=alert(1)>");
    expect(container.querySelector("img")).toBeNull();
  });

  it("mount, brand selection, and confirm issue zero mutations", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    setBrands([brand("brand-1", "Moka"), brand("brand-2", "Runclub")], null);
    const { rerenderEntry } = renderEntry(
      <GuestStudioEntry
        {...entryProps}
        handoff={{ kind: "guest", id: GUEST_ID }}
      />,
    );
    await screen.findByLabelText("Marca do pedido");
    fireEvent.change(screen.getByLabelText("Marca do pedido"), {
      target: { value: "brand-1" },
    });
    rerenderEntry(
      <GuestStudioEntry
        {...entryProps}
        handoff={{ kind: "guest", id: GUEST_ID }}
      />,
    );
    await screen.findByText("Pedido público de teste");
    fireEvent.click(screen.getByRole("button", { name: "Usar este pedido" }));
    await screen.findByText(/nada foi criado ainda/i);
    const mutations = fetchSpy.mock.calls.filter(([, init]) =>
      ["POST", "PUT", "PATCH", "DELETE"].includes(
        String((init as RequestInit | undefined)?.method ?? "GET").toUpperCase(),
      ),
    );
    expect(mutations).toEqual([]);
  });
});
