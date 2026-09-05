"use client";

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useCanonicalWorksMock = vi.fn();
const useActiveProfileMock = vi.fn();
const useComposerMock = vi.fn();
const useCreativeWorkMock = vi.fn();
const useStudioEntryInterviewMock = vi.fn();
const selectIntentMock = vi.fn();
const addInspirationMock = vi.fn();
const createCampaignMutationMock = vi.fn();
const protocolButton = (intent: "variations" | "single" | "format_adaptation" | "restyle" | "carousel") =>
  screen.getByRole("radio", { name: new RegExp(`dashboard\\.home\\.${intent}`) });

vi.mock("next-intl", () => ({
  useLocale: () => "pt-BR",
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    key === "continueBrand" && values?.name
      ? `Marca ${values.name}`
      : key === "stageHeadline" && values?.name
        ? `O que a ${values.name} precisa sair hoje?`
      : ({
          createCampaign: "Nova campanha",
          "campaignDialog.open": "Nova campanha",
          "campaignDialog.title": "Nova campanha",
          "campaignDialog.nameLabel": "Nome da campanha",
          "campaignDialog.brandLabel": "Marca",
          "campaignDialog.noBrand": "Selecione uma marca",
          "campaignDialog.cancel": "Cancelar",
          "campaignDialog.submit": "Criar campanha",
          "campaignDialog.createFailed": "Não foi possível criar a campanha.",
          "campaignDialog.linkFailed": "A campanha foi criada, mas não foi possível vinculá-la a esta criação. Tente novamente.",
          continueWhereLeftOff: "Continuar de onde parei",
          continueOriginCampaign: "Campanha",
          continueOriginCreativeWork: "Criação avulsa",
          "continueStates.generating": "Gerando",
          "continueStates.reviewing": "Em revisão",
          "composer.dropTarget": "Pedido criativo e área para soltar imagens",
          "composer.dropHint": "ou arraste e solte aqui",
          "composer.addArt": "Adicionar arte",
          "composer.progressiveAddArtReference": "Adicionar arte ou referência",
          "composer.progressiveBufferedFile": values?.name ? `${values.name} está pronta para usar` : "",
          talkStart: "Começar",
          talkGenerate: "Gerar",
          talkAttach: "Anexar até 3",
          talkAttachReference: "Anexar referência",
          talkRequired: "Obrigatório",
          emptyRequestError: "Escreva o pedido antes de gerar.",
          variationsReferenceError: "Anexe a peça de referência para gerar variações.",
          restylePairError: "Adicione a arte original e a referência de estilo.",
          requestLabel: "dashboard.home.composer.requestLabel",
        }[key] ?? `dashboard.home.${key}`),
}));
vi.mock("@/lib/hooks/use-canonical-works", () => ({
  useCanonicalWorks: (...args: unknown[]) => useCanonicalWorksMock(...args),
}));
vi.mock("@/lib/hooks/use-active-client-profile", () => ({
  useActiveClientProfile: () => useActiveProfileMock(),
}));
vi.mock("@/lib/hooks/use-creative-work", () => ({
  useCreativeWork: (...args: unknown[]) => useCreativeWorkMock(...args),
}));
vi.mock("@/lib/hooks/use-billing", () => ({
  useBillingStatus: () => ({
    data: { access: { hasSpendAccess: true } },
    isLoading: false,
  }),
  useStartCheckout: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));
vi.mock("@/lib/hooks/use-campaigns", () => ({
  useCreateCampaign: () => ({ mutateAsync: createCampaignMutationMock, isPending: false }),
}));
vi.mock("@/lib/hooks/use-studio-entry-interview", () => ({
  useStudioEntryInterview: (...args: unknown[]) => useStudioEntryInterviewMock(...args),
}));
vi.mock("@/lib/hooks/use-creative-inspirations", () => ({
  useCreativeInspirations: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/components/creative-work/useCreativeComposer", () => ({
  useCreativeComposer: (...args: unknown[]) => useComposerMock(...args),
}));
vi.mock("@/components/creative-work/CreativeComposer", () => ({
  CreativeComposer: ({ composer, initialWorkId, resultsOnly, hideSourceUpload }: { composer?: { intent: string; quote: { credits: number }; outputs?: Array<{ status: string }>; preparePlan?: () => void }; initialWorkId?: string; resultsOnly?: boolean; hideSourceUpload?: boolean }) => (
    <div data-testid="creative-composer" data-results-only={resultsOnly ? "true" : "false"} data-hide-source-upload={hideSourceUpload ? "true" : "false"}>{composer ? <>{`${composer.intent}:${composer.quote.credits}:${composer.outputs?.map((output) => output.status).join(",") ?? ""}`}{composer.preparePlan ? <button type="button" onClick={composer.preparePlan}>Continuar</button> : null}</> : initialWorkId}</div>
  ),
}));
vi.mock("@/components/creative-work/CreativePlanReview", () => ({
  CreativePlanReview: ({ plan, onEdit, onConfirm, readOnly }: { plan: { preparedRevision: string; protocol: string; materials: Array<{ label: string }>; preserve: string[]; explore: string[]; formats: string[]; outputCount: number }; onEdit: () => void; onConfirm: (revision: string) => void; readOnly?: boolean }) => (
    <section data-testid="prepared-plan">
      <span>{[plan.preparedRevision, plan.protocol, plan.materials.map((material) => material.label).join(","), plan.preserve.join(","), plan.explore.join(","), plan.formats.join(","), plan.outputCount].join("|")}</span>
      {!readOnly ? <><button type="button" onClick={onEdit}>Editar plano</button><button type="button" onClick={() => onConfirm(plan.preparedRevision)}>Confirmar plano</button></> : null}
    </section>
  ),
}));
vi.mock("@/components/layout/ActiveBrandSwitcher", () => ({
  default: () => (
    <select aria-label="activeBrand" data-testid="active-client-switcher">
      <option>Marca A</option>
    </select>
  ),
}));
vi.mock("@/components/creative-work/BrandInspirations", () => ({
  BrandInspirations: ({ clientProfileId, onAttach }: { clientProfileId: string | null; onAttach: (value: { id: string }) => void }) => (
    <button type="button" onClick={() => onAttach({ id: "inspiration-1" })}>Inspirações {clientProfileId}</button>
  ),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));

import DashboardHomeActions from "./DashboardHomeActions";

describe("DashboardHomeActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createCampaignMutationMock.mockResolvedValue({ id: "campaign-1" });
    useActiveProfileMock.mockReturnValue({ activeProfile: { id: "p1", name: "Marca A" } });
    useCreativeWorkMock.mockReturnValue({ data: undefined, isLoading: false });
    useStudioEntryInterviewMock.mockReturnValue({
      chips: [],
      answers: {},
      pendingProtocol: false,
      answeredProtocol: null,
      suggestedProtocol: null,
      selectChip: vi.fn(),
      usedFallback: false,
    });
    useComposerMock.mockImplementation(({ initialWorkId }: { initialWorkId?: string }) => {
      const [intent, setIntent] = useState<"variations" | "single" | "format_adaptation" | "restyle" | "carousel">("single");
      const [workId, setWorkId] = useState<string | null>(initialWorkId ?? null);
      return {
        intent,
        workId,
        clientProfileId: "p1",
        request: "",
        setRequest: vi.fn(),
        hasEntry: false,
        objectiveSelected: false,
        bufferedFile: null,
        announcement: null,
        error: null,
        sources: [],
        outputs: [],
        stage: "entry",
        actionPhase: "idle",
        recordStudioEvent: vi.fn(),
        addFiles: vi.fn(),
        generateLegacy: vi.fn(),
        preparePlan: vi.fn(),
        quote: intent === "format_adaptation" ? { unitCount: 2, credits: 10 } : intent === "carousel" ? { unitCount: 0, credits: 0 } : { unitCount: 1, credits: 5 },
        selectIntent: (next: typeof intent, immediate?: boolean) => { selectIntentMock(next, immediate); setIntent(next); },
        addInspiration: (inspiration: { id: string }) => {
          addInspirationMock(inspiration);
          setWorkId("created-work");
        },
        linkCampaign: vi.fn().mockResolvedValue(true),
      };
    });
  });

  it("starts with the creation protocols and resumes the exact canonical href", () => {
    useCanonicalWorksMock.mockReturnValue({
      data: [{
        id: "creative_work:w1", originKind: "creative_work", originId: "w1", origin: "quick_tool",
        workspaceId: "ws", name: "Post social", state: "generating", updatedAt: "2026-07-13T12:00:00.000Z",
        resumable: true, resumeHref: "/creative-work/w1", brandName: "Marca A",
      }],
      isLoading: false, isError: false, refetch: vi.fn(),
    });

    render(<DashboardHomeActions workId="opened-work" />);

    const protocols = screen.getByRole("heading", { name: "dashboard.home.title" }).closest("section");
    const continueLink = screen.getByRole("link", { name: /Post social/i });

    expect(screen.getByTestId("creative-composer")).toBeInTheDocument();
    expect(screen.getByTestId("active-client-switcher")).toBeInTheDocument();
    expect(continueLink.compareDocumentPosition(protocols!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(continueLink).toHaveAttribute("href", "/creative-work/w1");
    expect(continueLink).toHaveTextContent("Criação avulsa");
    expect(continueLink).toHaveTextContent("Marca Marca A");
    expect(continueLink).toHaveTextContent("Gerando");
    expect(continueLink).toHaveTextContent("dashboard.home.continueTrackGeneration");
    expect(screen.getByTestId("stage-brand-bar")).toHaveClass("gap-2");
    expect(screen.getByTestId("stage-brand-bar")).toContainElement(screen.getByRole("button", { name: "Nova campanha" }));
    expect(screen.getByTestId("stage-brand-bar")).toContainElement(screen.getByTestId("active-client-switcher"));
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByTestId("brand-inspirations-slot")).toBeInTheDocument();
    expect(screen.queryByText("dashboard.home.chooseIntent")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("creates a campaign from the secondary dialog without extra briefing fields", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    render(<DashboardHomeActions />);
    fireEvent.click(screen.getByRole("button", { name: "Nova campanha" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Nome da campanha");
    expect(dialog).toHaveTextContent("Marca A");
    expect(within(dialog).queryByLabelText(/público|plataforma|formato|objetivo|briefing/i)).not.toBeInTheDocument();
  });

  it("keeps the campaign dialog open with a translated link error when linking fails", async () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    const linkCampaign = vi.fn().mockResolvedValue(false);
    useComposerMock.mockReturnValue({
      intent: "single", quote: { unitCount: 1, credits: 5 }, linkCampaign,
    });
    render(<DashboardHomeActions />);

    fireEvent.click(screen.getByRole("button", { name: "Nova campanha" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Nome da campanha"), { target: { value: "Lançamento" } });
    fireEvent.submit(within(dialog).getByRole("button", { name: "Criar campanha" }).closest("form")!);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("A campanha foi criada, mas não foi possível vinculá-la a esta criação. Tente novamente."));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(linkCampaign).toHaveBeenCalledWith("campaign-1");
    fireEvent.submit(within(dialog).getByRole("button", { name: "Criar campanha" }).closest("form")!);
    await waitFor(() => expect(linkCampaign).toHaveBeenCalledTimes(2));
    expect(createCampaignMutationMock).toHaveBeenCalledTimes(1);
  });

  it("opens the work's own page even when continue targets the work open on Home (#126)", () => {
    useCanonicalWorksMock.mockReturnValue({
      data: [{
        id: "creative_work:w1", originKind: "creative_work", originId: "w1", origin: "quick_tool",
        workspaceId: "ws", name: "Post social", state: "reviewing", updatedAt: "2026-07-13T12:00:00.000Z",
        resumable: true, resumeHref: "/creative-work/w1",
      }],
      isLoading: false, isError: false, refetch: vi.fn(),
    });

    render(<DashboardHomeActions workId="w1" />);

    expect(screen.getByRole("link", { name: /Post social/i })).toHaveAttribute(
      "href",
      "/creative-work/w1",
    );
  });

  it("keeps a linked work's campaign destination instead of intercepting it with the home anchor", () => {
    useCanonicalWorksMock.mockReturnValue({
      data: [{
        id: "creative_work:w1", originKind: "creative_work", originId: "w1", origin: "quick_tool",
        workspaceId: "ws", name: "Post social", state: "reviewing", updatedAt: "2026-07-13T12:00:00.000Z",
        resumable: true, resumeHref: "/campaigns/c1?creativeWork=w1",
      }],
      isLoading: false, isError: false, refetch: vi.fn(),
    });

    render(<DashboardHomeActions workId="w1" />);

    expect(screen.getByRole("link", { name: /Post social/i })).toHaveAttribute(
      "href",
      "/campaigns/c1?creativeWork=w1",
    );
  });

  it("uses the restored composer intent as the cards' single source of truth", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });

    render(<DashboardHomeActions workId="opened-work" />);

    expect(useComposerMock).toHaveBeenCalledWith({
      initialWorkId: "opened-work",
      initialIntent: undefined,
      focusComposer: false,
      initialTemplateId: undefined,
    });
    expect(protocolButton("single")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("creative-composer")).toBeInTheDocument();

    fireEvent.click(protocolButton("restyle"));

    expect(selectIntentMock).toHaveBeenCalledWith("restyle", true);
    expect(protocolButton("restyle")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("creative-composer")).toBeInTheDocument();
  });

  it("keeps the composer linked to every creation protocol before a draft exists", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });

    render(<DashboardHomeActions />);
    expect(screen.getByTestId("creative-composer")).toHaveTextContent("single:5");
    expect(screen.getByTestId("creative-composer")).toHaveAttribute("data-hide-source-upload", "false");

    fireEvent.click(protocolButton("variations"));
    expect(screen.getByTestId("creative-composer")).toHaveTextContent("variations:5");

    fireEvent.click(protocolButton("format_adaptation"));
    expect(screen.getByTestId("creative-composer")).toHaveTextContent("format_adaptation:10");

    fireEvent.click(protocolButton("restyle"));
    expect(screen.getByTestId("creative-composer")).toHaveTextContent("restyle:5");
  });

  it("keeps the visible studio mode tied to the composer when a guarded switch is cancelled", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    const guardedSelectIntent = vi.fn();
    let intent: "variations" | "single" = "variations";
    useComposerMock.mockImplementation(() => ({
      intent,
      clientProfileId: "p1",
      quote: { unitCount: 1, credits: 5 },
      selectIntent: guardedSelectIntent,
      addInspiration: addInspirationMock,
    }));

    const { rerender } = render(<DashboardHomeActions studioMode="arte" />);

    expect(protocolButton("variations")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(protocolButton("single"));
    expect(guardedSelectIntent).toHaveBeenCalledWith("single", true);
    // A protocol guard can defer then cancel this change. The composer intent
    // stays variations, so the Palco radio must stay on Variações as well.
    expect(protocolButton("single")).toHaveAttribute("aria-checked", "false");

    rerender(<DashboardHomeActions studioMode="arte" />);
    expect(protocolButton("variations")).toHaveAttribute("aria-checked", "true");

    intent = "single";
    rerender(<DashboardHomeActions studioMode="arte" />);
    expect(protocolButton("single")).toHaveAttribute("aria-checked", "true");
  });

  it("passes safe route presets to the same composer instance", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });

    render(
      <DashboardHomeActions
        initialIntent="restyle"
        focusComposer
        templateId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      />
    );

    expect(useComposerMock).toHaveBeenCalledWith({
      initialWorkId: undefined,
      initialIntent: "restyle",
      focusComposer: true,
      initialTemplateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
  });

  it("uses the URL Studio mode only to seed a new composer intent", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });

    render(<DashboardHomeActions studioMode="briefing" />);

    expect(useComposerMock).toHaveBeenCalledWith(expect.objectContaining({ initialIntent: "single" }));
  });

  it("passes the explicit fresh Studio contract to the canonical composer", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });

    render(<DashboardHomeActions freshEntry />);

    expect(useComposerMock).toHaveBeenCalledWith(expect.objectContaining({ freshEntry: true }));
  });

  it("shows a brand-aware first-creation prompt when nothing is actionable", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });

    render(<DashboardHomeActions />);

    expect(screen.getByRole("heading", { name: "O que a Marca A precisa sair hoje?" })).toBeInTheDocument();
    expect(screen.getByText("dashboard.home.stageEmptySubtitle")).toBeInTheDocument();
  });

  it("attaches brand inspirations through the same composer model", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });

    render(<DashboardHomeActions />);
    fireEvent.click(screen.getByRole("button", { name: "Inspirações p1" }));

    expect(addInspirationMock).toHaveBeenCalledWith({ id: "inspiration-1" });
    expect(screen.getByTestId("creative-composer")).toBeInTheDocument();
  });

  it("shows the latest completed productions from the resumable project", () => {
    useCanonicalWorksMock.mockReturnValue({
      data: [{
        id: "creative_work:w1", originKind: "creative_work", originId: "w1", origin: "quick_tool",
        workspaceId: "ws", name: "Post social", state: "reviewing", updatedAt: "2026-07-13T12:00:00.000Z",
        resumable: true, resumeHref: "/creative-work/w1",
      }],
      isLoading: false, isError: false, refetch: vi.fn(),
    });
    useCreativeWorkMock.mockReturnValue({
      data: {
        outputs: [
          { id: "output-old", workItemId: "w1", status: "completed", outputKey: "old.png", createdAt: new Date("2026-07-13T10:00:00.000Z") },
          { id: "output-new", workItemId: "w1", status: "completed", outputKey: "new.png", createdAt: new Date("2026-07-13T11:00:00.000Z") },
          { id: "output-failed", workItemId: "w1", status: "failed", outputKey: null, createdAt: new Date("2026-07-13T12:00:00.000Z") },
        ],
      },
      isLoading: false,
    });

    render(<DashboardHomeActions />);

    expect(useCreativeWorkMock).toHaveBeenCalledWith("w1");
    const fan = screen.getByTestId("continue-work-thumbnail");
    const previews = fan.querySelectorAll("img");
    expect(previews).toHaveLength(1);
    expect(previews[0]).toHaveAttribute("src", "/api/creative-work/w1/outputs/output-new/download");
  });

  it("scopes inspirations to the restored work brand instead of the global active brand", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    useComposerMock.mockReturnValue({
      intent: "single",
      clientProfileId: "p2",
      quote: { unitCount: 1, credits: 5 },
      selectIntent: selectIntentMock,
      addInspiration: addInspirationMock,
    });

    render(<DashboardHomeActions workId="work-from-p2" />);

    expect(screen.getByRole("button", { name: "Inspirações p2" })).toBeInTheDocument();
  });

  it("keeps progressive entry free and only reveals objectives after input", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    useComposerMock.mockImplementation(() => {
      const [request, setRequest] = useState("");
      return {
        request, setRequest, hasEntry: Boolean(request), objectiveSelected: false, intent: "variations",
        stage: "entry", preparedPlan: null, actionPhase: "idle", clientProfileId: "p1", quote: { unitCount: 1, credits: 5 },
        addFiles: vi.fn(), selectIntent: selectIntentMock,
      };
    });

    render(<DashboardHomeActions rolloutVariant="progressive" workspaceId="ws" />);
    expect(screen.getByTestId("studio-stage")).toBeInTheDocument();
    expect(protocolButton("variations")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "dashboard.home.chooseObjective" })).not.toBeInTheDocument();
    expect(screen.getByTestId("brand-inspirations-slot")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "dashboard.home.composer.requestLabel" }), { target: { value: "Uma campanha" } });
    expect(protocolButton("variations")).toBeInTheDocument();
    expect(screen.getByTestId("brand-inspirations-slot")).toBeInTheDocument();
  });

  it("accepts dropped multiple files and announces the buffered first file", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    const addFiles = vi.fn();
    useComposerMock.mockReturnValue({
      request: "", setRequest: vi.fn(), hasEntry: false, objectiveSelected: false, intent: "variations",
      stage: "entry", preparedPlan: null, actionPhase: "idle", clientProfileId: "p1", quote: { unitCount: 1, credits: 5 },
      bufferedFile: new File(["first"], "primeira.png", { type: "image/png" }), announcement: "primeira.png foi mantida; adicione as outras imagens depois de escolher um objetivo.", addFiles,
    });

    render(<DashboardHomeActions rolloutVariant="progressive" workspaceId="ws" />);
    const target = screen.getByRole("group", { name: "Pedido criativo e área para soltar imagens" });
    const first = new File(["first"], "primeira.png", { type: "image/png" });
    const second = new File(["second"], "segunda.png", { type: "image/png" });
    const addArtButton = screen.getByRole("button", { name: /talkAttach/i });
    const fileInput = target.querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = vi.spyOn(fileInput, "click");

    expect(addArtButton).toHaveAttribute("type", "button");
    fireEvent.click(addArtButton);
    expect(click).toHaveBeenCalledTimes(1);
    expect(fileInput).toHaveAttribute("multiple");
    fireEvent.drop(target, { dataTransfer: { files: [first, second] } });

    expect(addFiles).toHaveBeenCalledWith([first, second]);
    expect(screen.getByText(/primeira\.png foi mantida/i)).toHaveAttribute("aria-live", "polite");
  });

  it("keeps the progressive entry hierarchy compact at a narrow viewport", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    useComposerMock.mockReturnValue({
      request: "", setRequest: vi.fn(), hasEntry: false, objectiveSelected: false, intent: "variations",
      stage: "entry", preparedPlan: null, actionPhase: "idle", clientProfileId: "p1", quote: { unitCount: 1, credits: 5 },
      addFiles: vi.fn(), selectIntent: selectIntentMock,
    });

    render(<DashboardHomeActions rolloutVariant="progressive" workspaceId="ws" />);
    expect(screen.getByTestId("studio-stage")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "dashboard.home.studioModeLabel" })).not.toBeInTheDocument();
    expect(screen.getByTestId("brand-inspirations-slot")).toBeInTheDocument();
  });

  it("keeps Single piece references enabled in progressive configuration", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    useComposerMock.mockReturnValue({
      request: "Crie uma peça", hasEntry: true, objectiveSelected: true, intent: "single",
      stage: "entry", preparedPlan: null, actionPhase: "idle", clientProfileId: "p1", quote: { unitCount: 1, credits: 5 },
      outputs: [], selectIntent: selectIntentMock,
    });

    render(<DashboardHomeActions rolloutVariant="progressive" workspaceId="ws" />);

    expect(screen.getByTestId("creative-composer")).toHaveAttribute("data-hide-source-upload", "false");
  });

  it("keeps completed and partial results visible while the used plan is collapsed", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    useComposerMock.mockReturnValue({
      request: "Campanha de matrículas", workTitle: "Volta às aulas", hasEntry: true, objectiveSelected: true, intent: "variations",
      stage: "results", preparedPlan: { preparedRevision: "revision-1", protocol: "variations", materials: [{ label: "Logo" }], preserve: ["verified_facts"], explore: ["composition"], formats: ["4:5"], outputCount: 3 }, actionPhase: "idle", clientProfileId: "p1", brandName: "Marca A", state: "results", workId: "work-1", quote: { unitCount: 3, credits: 15 },
      outputs: [{ status: "completed" }, { status: "failed" }], linkCampaign: vi.fn().mockResolvedValue(true), selectIntent: selectIntentMock,
    });

    render(<DashboardHomeActions rolloutVariant="progressive" workspaceId="ws" />);

    const results = screen.getByRole("heading", { name: "dashboard.home.resultsTitle" });
    const plan = screen.getByText("dashboard.home.planUsed").closest("details")!;
    expect(results).toHaveFocus();
    expect(plan).not.toHaveAttribute("open");
    expect(screen.getByTestId("creative-composer")).toHaveAttribute("data-results-only", "true");
    expect(screen.getByTestId("creative-composer")).toHaveTextContent("completed,failed");
    expect(within(plan).queryByTestId("creative-composer")).not.toBeInTheDocument();
    expect(within(plan).getByTestId("prepared-plan")).toHaveTextContent("variations|Logo|verified_facts|composition|4:5|3");
    expect(screen.getByTestId("progressive-results-summary").compareDocumentPosition(plan)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByTestId("studio-stage")).toBeInTheDocument();
    expect(screen.getByTestId("progressive-results-summary")).toHaveTextContent("Volta às aulas");
    expect(screen.getByTestId("progressive-results-summary")).not.toHaveTextContent("Campanha de matrículas");
    expect(screen.getByTestId("progressive-results-summary")).not.toHaveTextContent("work-1");
    expect(screen.queryByRole("button", { name: "Inspirações p1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /restyle/i })).not.toBeInTheDocument();
  });

  it("marks an all-failed progressive result distinctly while keeping its controls reachable", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    useComposerMock.mockReturnValue({
      request: "Campanha", workTitle: "Título salvo", hasEntry: true, objectiveSelected: true, intent: "variations",
      stage: "results", preparedPlan: null, actionPhase: "idle", clientProfileId: "p1", brandName: "Marca A", state: "results", workId: "work-1", quote: { unitCount: 2, credits: 10 },
      outputs: [{ status: "failed" }, { status: "failed" }], linkCampaign: vi.fn().mockResolvedValue(true), selectIntent: selectIntentMock, addInspiration: addInspirationMock,
    });

    render(<DashboardHomeActions rolloutVariant="progressive" workspaceId="ws" />);

    expect(screen.getByTestId("progressive-results-summary")).toHaveTextContent("dashboard.home.resultStateFailed");
    expect(screen.queryByRole("button", { name: "Inspirações p1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /variations/i })).not.toBeInTheDocument();
  });

  it("returns to confirmation after a successful no-op reprepare", async () => {
    const confirmGeneration = vi.fn();
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    useComposerMock.mockImplementation(() => {
      const [cycle, setCycle] = useState(0);
      return {
        request: "Campanha", hasEntry: true, objectiveSelected: true, intent: "variations", stage: "plan", actionPhase: "idle", clientProfileId: "p1", quote: { unitCount: 3, credits: 15 },
        preparedPlan: { preparedRevision: "revision-1", protocol: "variations", materials: [], preserve: [], explore: [], formats: ["4:5"], outputCount: 3 },
        preparedPlanCycle: cycle, preparePlan: () => setCycle((value) => value + 1), confirmGeneration,
      };
    });

    render(<DashboardHomeActions rolloutVariant="progressive" workspaceId="ws" />);
    fireEvent.click(screen.getByRole("button", { name: "Editar plano" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByTestId("prepared-plan")).toHaveTextContent("revision-1"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar plano" }));
    expect(confirmGeneration).toHaveBeenCalledWith("revision-1");
  });

  it("hides the carousel card until the rollout enables creation", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    const { rerender } = render(<DashboardHomeActions />);

    expect(screen.queryByRole("button", { name: /criar carrossel/i })).not.toBeInTheDocument();

    rerender(<DashboardHomeActions carouselCreationEnabled />);
    expect(protocolButton("carousel")).toBeInTheDocument();
  });

  it("keeps new-creation hidden at percent zero while old carousel work resumes", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    useComposerMock.mockReturnValue({
      intent: "carousel", workId: "carousel-old", clientProfileId: "p1",
      quote: { unitCount: 0, credits: 0 }, outputs: [],
      selectIntent: selectIntentMock, addInspiration: addInspirationMock,
    });

    render(<DashboardHomeActions workId="carousel-old" />);

    // Zero percent: no new carousel can start…
    expect(screen.queryByRole("button", { name: /criar carrossel/i })).not.toBeInTheDocument();
    // …but the existing work resumes through the same composer deck.
    expect(useComposerMock).toHaveBeenCalledWith(expect.objectContaining({ initialWorkId: "carousel-old" }));
    expect(screen.getByTestId("creative-composer")).toHaveTextContent("carousel:0:");
  });

  it("preserves progressive free entry when selecting Criar carrossel", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    useComposerMock.mockImplementation(() => {
      const [request, setRequest] = useState("Sequência sobre matrículas");
      return {
        request, setRequest, hasEntry: Boolean(request), objectiveSelected: false, intent: "variations",
        stage: "entry", preparedPlan: null, actionPhase: "idle", clientProfileId: "p1", quote: { unitCount: 0, credits: 0 },
        addFiles: vi.fn(), selectIntent: selectIntentMock,
      };
    });

    render(<DashboardHomeActions rolloutVariant="progressive" workspaceId="ws" carouselCreationEnabled />);
    fireEvent.click(protocolButton("carousel"));

    expect(selectIntentMock).toHaveBeenCalledWith("carousel", true);
    expect(screen.getByRole("textbox", { name: "dashboard.home.composer.requestLabel" })).toHaveValue(
      "Sequência sobre matrículas",
    );
  });

  it("resumes a carousel work through the composer deck instead of the proposal grid", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    useComposerMock.mockReturnValue({
      intent: "carousel", workId: "carousel-1", clientProfileId: "p1",
      quote: { unitCount: 0, credits: 0 }, outputs: [],
      selectIntent: selectIntentMock, addInspiration: addInspirationMock,
    });

    render(<DashboardHomeActions workId="carousel-1" />);

    expect(screen.getByTestId("creative-composer")).toHaveTextContent("carousel:0:");
  });

  it("keeps the carousel wizard mounted through the plan and results stages", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    useComposerMock.mockReturnValue({
      request: "Sequência", hasEntry: true, objectiveSelected: true, intent: "carousel",
      stage: "plan", preparedPlan: { preparedRevision: "revision-1", protocol: "carousel", materials: [], preserve: [], explore: [], formats: ["4:5"], outputCount: 5 },
      preparedPlanCycle: 1, actionPhase: "idle", clientProfileId: "p1", quote: { unitCount: 0, credits: 0 },
      workId: "carousel-1", outputs: [], carousel: { draft: null, slides: [], phase: "ready_to_generate" },
      selectIntent: selectIntentMock,
    });

    const { rerender } = render(<DashboardHomeActions rolloutVariant="progressive" workspaceId="ws" carouselCreationEnabled />);

    // The generic plan review never replaces the carousel wizard.
    expect(screen.queryByTestId("prepared-plan")).not.toBeInTheDocument();
    expect(screen.getByTestId("creative-composer")).toBeInTheDocument();

    rerender(
      <DashboardHomeActions
        rolloutVariant="progressive"
        workspaceId="ws"
        carouselCreationEnabled
        workId="carousel-1"
      />,
    );
    useComposerMock.mockReturnValue({
      request: "Sequência", hasEntry: true, objectiveSelected: true, intent: "carousel",
      stage: "results", preparedPlan: null, actionPhase: "idle", clientProfileId: "p1",
      quote: { unitCount: 0, credits: 0 }, workId: "carousel-1",
      outputs: [], carousel: { draft: null, slides: [{ id: "s1" }], phase: "review" },
      selectIntent: selectIntentMock,
    });
    rerender(
      <DashboardHomeActions
        rolloutVariant="progressive"
        workspaceId="ws"
        carouselCreationEnabled
        workId="carousel-1"
      />,
    );

    // The generic results grid never replaces the deck review either.
    expect(screen.queryByTestId("progressive-results-summary")).not.toBeInTheDocument();
    expect(screen.getByTestId("creative-composer")).toBeInTheDocument();
  });

  it("hides objective cards while a protocol chip is pending in the entry interview", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    useStudioEntryInterviewMock.mockReturnValue({
      chips: [{ slot: "protocol", options: ["single"] }],
      answers: {},
      pendingProtocol: true,
      answeredProtocol: null,
      suggestedProtocol: null,
      selectChip: vi.fn(),
      usedFallback: false,
    });
    useComposerMock.mockReturnValue({
      request: "Pedido", setRequest: vi.fn(), hasEntry: true, objectiveSelected: false, intent: "variations",
      stage: "entry", preparedPlan: null, actionPhase: "idle", clientProfileId: "p1", quote: { unitCount: 1, credits: 5 },
      addFiles: vi.fn(), selectIntent: selectIntentMock, recordStudioEvent: vi.fn(),
    });

    render(<DashboardHomeActions rolloutVariant="progressive" workspaceId="ws" entryInterviewEnabled />);

    expect(screen.getByRole("textbox", { name: "dashboard.home.composer.requestLabel" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "dashboard.home.chooseObjective" })).not.toBeInTheDocument();
  });

  it("continues through the entry interview without duplicate objective cards", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    useStudioEntryInterviewMock.mockReturnValue({
      chips: [],
      answers: { protocol: "single" },
      pendingProtocol: false,
      answeredProtocol: "single",
      suggestedProtocol: null,
      selectChip: vi.fn(),
      usedFallback: false,
    });
    useComposerMock.mockReturnValue({
      request: "Pedido", setRequest: vi.fn(), hasEntry: true, objectiveSelected: false, intent: "variations",
      stage: "entry", preparedPlan: null, actionPhase: "idle", clientProfileId: "p1", quote: { unitCount: 1, credits: 5 },
      addFiles: vi.fn(), selectIntent: selectIntentMock, recordStudioEvent: vi.fn(),
    });

    render(<DashboardHomeActions rolloutVariant="progressive" workspaceId="ws" entryInterviewEnabled />);

    expect(screen.queryByRole("heading", { name: "dashboard.home.chooseObjective" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("entry-interview-continue"));
    expect(selectIntentMock).toHaveBeenCalledTimes(1);
    expect(selectIntentMock).toHaveBeenCalledWith("single", true);
  });

  it("passes history-suggested protocol to objective cards without selecting it", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    useStudioEntryInterviewMock.mockReturnValue({
      chips: [],
      answers: {},
      pendingProtocol: false,
      answeredProtocol: null,
      suggestedProtocol: "single",
      selectChip: vi.fn(),
      usedFallback: false,
    });
    useComposerMock.mockReturnValue({
      request: "Pedido", setRequest: vi.fn(), hasEntry: true, objectiveSelected: false, intent: "variations",
      stage: "entry", preparedPlan: null, actionPhase: "idle", clientProfileId: "p1", quote: { unitCount: 1, credits: 5 },
      addFiles: vi.fn(), selectIntent: selectIntentMock, recordStudioEvent: vi.fn(),
    });

    render(<DashboardHomeActions rolloutVariant="progressive" workspaceId="ws" entryInterviewEnabled />);

    expect(protocolButton("single")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("dashboard.home.suggestedFromHistory")).toBeInTheDocument();
    expect(selectIntentMock).not.toHaveBeenCalled();
  });

  it("still accepts handwritten request text when the entry interview is enabled", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    const setRequest = vi.fn();
    useComposerMock.mockReturnValue({
      request: "", setRequest, hasEntry: false, objectiveSelected: false, intent: "variations",
      stage: "entry", preparedPlan: null, actionPhase: "idle", clientProfileId: "p1", quote: { unitCount: 1, credits: 5 },
      addFiles: vi.fn(), selectIntent: selectIntentMock, recordStudioEvent: vi.fn(),
    });

    render(<DashboardHomeActions rolloutVariant="progressive" workspaceId="ws" entryInterviewEnabled />);
    fireEvent.change(screen.getByRole("textbox", { name: "dashboard.home.composer.requestLabel" }), { target: { value: "Texto livre" } });
    expect(setRequest).toHaveBeenCalledWith("Texto livre");
  });

  it("does not render entry interview chips when rollout disables the interview", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    useComposerMock.mockReturnValue({
      request: "", setRequest: vi.fn(), hasEntry: false, objectiveSelected: false, intent: "variations",
      stage: "entry", preparedPlan: null, actionPhase: "idle", clientProfileId: "p1", quote: { unitCount: 1, credits: 5 },
      addFiles: vi.fn(), selectIntent: selectIntentMock, recordStudioEvent: vi.fn(),
    });

    render(<DashboardHomeActions rolloutVariant="progressive" workspaceId="ws" />);
    expect(screen.queryByTestId("studio-entry-interview")).not.toBeInTheDocument();
  });

  it("blocks generate next to the CTA when the request is empty", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    render(<DashboardHomeActions />);
    fireEvent.click(screen.getByRole("button", { name: "Começar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Escreva o pedido antes de gerar.");
  });

  it("requires a reference attachment before generating variations", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    render(<DashboardHomeActions />);
    fireEvent.click(protocolButton("variations"));
    fireEvent.click(screen.getByRole("button", { name: "Começar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Anexe a peça de referência para gerar variações.");
  });

  it("requires original art and a style reference before restyling", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    render(<DashboardHomeActions />);
    fireEvent.click(protocolButton("restyle"));
    fireEvent.click(screen.getByRole("button", { name: "Começar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Adicione a arte original e a referência de estilo.");
  });

  it("still blocks restyle generate when only the style reference is attached", () => {
    const preparePlan = vi.fn();
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    useComposerMock.mockReturnValue({
      intent: "restyle",
      request: "",
      setRequest: vi.fn(),
      clientProfileId: "p1",
      quote: { unitCount: 1, credits: 5 },
      sources: [{ id: "style-1", name: "style.png", previewUrl: "/style.png", usage: "style" }],
      addFiles: vi.fn(),
      selectIntent: selectIntentMock,
      preparePlan,
      generateLegacy: vi.fn(),
    });
    render(<DashboardHomeActions />);
    fireEvent.click(screen.getByRole("button", { name: "Gerar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Adicione a arte original e a referência de estilo.");
    expect(preparePlan).not.toHaveBeenCalled();
  });

  it("caps attachments at three", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    useComposerMock.mockReturnValue({
      intent: "single",
      request: "Pedido",
      setRequest: vi.fn(),
      clientProfileId: "p1",
      quote: { unitCount: 1, credits: 5 },
      sources: [
        { id: "s1", name: "a.png", previewUrl: null },
        { id: "s2", name: "b.png", previewUrl: null },
        { id: "s3", name: "c.png", previewUrl: null },
      ],
      selectIntent: selectIntentMock,
      addInspiration: addInspirationMock,
    });
    render(<DashboardHomeActions />);
    expect(screen.getByRole("button", { name: "dashboard.home.talkAttachCount" })).toBeDisabled();
  });

  it("docks the talk box when the stage already has work", () => {
    useCanonicalWorksMock.mockReturnValue({
      data: [{
        id: "creative_work:w1", originKind: "creative_work", originId: "w1", origin: "quick_tool",
        workspaceId: "ws", name: "Post social", state: "generating", updatedAt: "2026-07-13T12:00:00.000Z",
        resumable: true, resumeHref: "/creative-work/w1", brandName: "Marca A",
      }],
      isLoading: false, isError: false, refetch: vi.fn(),
    });
    render(<DashboardHomeActions />);
    const talkBox = screen.getByTestId("studio-talk-box");
    expect(talkBox).toHaveAttribute("data-placement", "dock");
    expect(talkBox.className).not.toMatch(/\bp-5\b/);
    expect(screen.getByRole("textbox").className).not.toMatch(/min-h-20/);
  });
});
