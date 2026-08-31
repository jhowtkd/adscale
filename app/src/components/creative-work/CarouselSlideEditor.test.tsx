import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CarouselEditorialChangeV1, CarouselStructureFinding } from "@/server/creative-work/carousel-contracts";
import { CarouselSlideEditor, type CarouselEditorSlide } from "./CarouselSlideEditor";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === "editorTitle") return `Editar a tela ${values?.position}`;
    if (key === "suggestionField") return `Campo ${values?.field}`;
    return ({
      roleLabel: "Função narrativa",
      role_hook: "Gancho", role_context: "Contexto", role_problem: "Problema", role_argument: "Argumento",
      role_evidence: "Evidência", role_method: "Método", role_bridge: "Ponte", role_closing: "Fechamento", role_cta: "Chamada",
      purposeLabel: "Propósito",
      primaryTextLabel: "Texto principal",
      secondaryTextLabel: "Texto de apoio",
      layoutFamilyLabel: "Composição",
      layout_impact: "Impacto", layout_development: "Desenvolvimento", layout_respite: "Respiro",
      densityLabel: "Densidade",
      density_high: "Alta", density_medium: "Média", density_low: "Baixa",
      authorityLabel: "Autoria do texto",
      authority_user_input: "Enviada por você",
      authority_ai_proposal: "Proposta da IA",
      authority_human_edit: "Editada por você",
      humanEditNote: "Esta tela foi editada por você. Sugestões nunca trocam o seu texto sem aceitação.",
      status_draft: "Rascunho", status_completed: "Pronta", status_failed: "Falhou", status_processing: "Gerando",
      suggestionTitle: "Sugestão da IA",
      suggestionBefore: "Antes", suggestionAfter: "Depois", suggestionReason: "Motivo",
      acceptChange: "Aceitar", rejectChange: "Rejeitar", editInstead: "Editar",
      copyOnlyAction: "Alterar somente o texto",
      visualRefetchAction: "Refazer esta tela",
      visualInstructionLabel: "Instrução para refazer o visual",
      retryAction: "Tentar novamente esta tela",
      failedNote: "Esta tela falhou. Você pode tentar novamente.",
      findingsTitle: "Ajustes necessários",
    }[key] ?? key);
  },
}));

function editorSlide(overrides: Partial<CarouselEditorSlide> = {}): CarouselEditorSlide {
  return {
    id: "slide-2",
    position: 2,
    role: "context",
    purpose: "Contextualizar a oferta",
    primaryText: "Texto atual",
    secondaryText: "Apoio atual",
    layoutFamily: "development",
    status: "completed",
    copyAuthority: "ai_proposal",
    versionNumber: 3,
    hasOutput: true,
    errorCode: null,
    ...overrides,
  };
}

const pendingChange: CarouselEditorialChangeV1 = {
  id: "change-1",
  slideId: "slide-2",
  field: "primaryText",
  before: "Texto atual",
  after: "Sugestão mais direta",
  reason: "Encurta a leitura do gancho",
  status: "pending",
};

const finding: CarouselStructureFinding = {
  path: "slides.1.primaryText",
  code: "blank_copy",
  message: "primaryText is blank",
};

function renderEditor(overrides: {
  slide?: CarouselEditorSlide | null;
  pendingChanges?: CarouselEditorialChangeV1[];
  findings?: CarouselStructureFinding[];
  canEditDraft?: boolean;
  isBusy?: boolean;
} = {}, callbacks = {}) {
  return render(
    <CarouselSlideEditor
      slide={overrides.slide === undefined ? editorSlide() : overrides.slide}
      pendingChanges={overrides.pendingChanges ?? []}
      findings={overrides.findings ?? []}
      canEditDraft={overrides.canEditDraft ?? false}
      isBusy={overrides.isBusy ?? false}
      onEdit={vi.fn()}
      onAcceptChange={vi.fn()}
      onRejectChange={vi.fn()}
      onCopyRevision={vi.fn()}
      onVisualRevision={vi.fn()}
      onRetry={vi.fn()}
      {...callbacks}
    />,
  );
}

describe("CarouselSlideEditor", () => {
  it("shows role, purpose, primary and secondary text, composition density and authority", () => {
    renderEditor();

    expect(screen.getByRole("combobox", { name: "Função narrativa" })).toHaveValue("context");
    expect(screen.getByLabelText("Propósito")).toHaveValue("Contextualizar a oferta");
    expect(screen.getByLabelText("Texto principal")).toHaveValue("Texto atual");
    expect(screen.getByLabelText("Texto de apoio")).toHaveValue("Apoio atual");
    expect(screen.getByTestId("carousel-slide-density")).toHaveTextContent("Desenvolvimento");
    expect(screen.getByTestId("carousel-slide-density")).toHaveTextContent("Média");
    expect(screen.getByTestId("carousel-slide-authority")).toHaveTextContent("Proposta da IA");
  });

  it("edits fields through the human-edit path", () => {
    const onEdit = vi.fn();
    renderEditor({ canEditDraft: true }, { onEdit });

    fireEvent.change(screen.getByLabelText("Texto principal"), { target: { value: "Novo texto" } });
    expect(onEdit).toHaveBeenCalledWith("slide-2", "primaryText", "Novo texto");

    fireEvent.change(screen.getByRole("combobox", { name: "Função narrativa" }), { target: { value: "hook" } });
    expect(onEdit).toHaveBeenCalledWith("slide-2", "role", "hook");
  });

  it("shows a pending AI suggestion with before, after and reason without replacing the textarea", () => {
    renderEditor({ pendingChanges: [pendingChange] });

    const suggestion = screen.getByTestId("carousel-suggestion-change-1");
    expect(suggestion).toHaveTextContent("Texto atual");
    expect(suggestion).toHaveTextContent("Sugestão mais direta");
    expect(suggestion).toHaveTextContent("Encurta a leitura do gancho");
    expect(screen.getByLabelText("Texto principal")).toHaveValue("Texto atual");
  });

  it("accepts, rejects or edits a pending suggestion", () => {
    const onAcceptChange = vi.fn();
    const onRejectChange = vi.fn();
    renderEditor({ pendingChanges: [pendingChange], canEditDraft: true }, { onAcceptChange, onRejectChange });

    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));
    expect(onAcceptChange).toHaveBeenCalledWith("change-1");

    fireEvent.click(screen.getByRole("button", { name: "Rejeitar" }));
    expect(onRejectChange).toHaveBeenCalledWith("change-1");

    const editButton = screen.getByRole("button", { name: "Editar" });
    fireEvent.click(editButton);
    expect(screen.getByLabelText("Texto principal")).toHaveFocus();
  });

  it("surfaces the objective finding for this slide", () => {
    renderEditor({ findings: [finding] });

    expect(screen.getByTestId("carousel-slide-findings")).toHaveTextContent("primaryText is blank");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("revises copy only or refetches the visual for a completed slide", () => {
    const onCopyRevision = vi.fn();
    const onVisualRevision = vi.fn();
    renderEditor({}, { onCopyRevision, onVisualRevision });

    fireEvent.change(screen.getByLabelText("Texto principal"), { target: { value: "Texto ajustado" } });
    fireEvent.click(screen.getByRole("button", { name: "Alterar somente o texto" }));
    expect(onCopyRevision).toHaveBeenCalledWith("slide-2", "Texto ajustado", "Apoio atual");

    fireEvent.change(screen.getByLabelText("Instrução para refazer o visual"), { target: { value: "Fundo mais claro" } });
    fireEvent.click(screen.getByRole("button", { name: "Refazer esta tela" }));
    expect(onVisualRevision).toHaveBeenCalledWith("slide-2", "Fundo mais claro");
  });

  it("offers the explicit retry only for a failed slide", () => {
    const onRetry = vi.fn();
    const { rerender } = renderEditor({}, { onRetry });

    expect(screen.queryByRole("button", { name: "Tentar novamente esta tela" })).not.toBeInTheDocument();

    rerender(
      <CarouselSlideEditor
        slide={editorSlide({ status: "failed", errorCode: "provider_failed", hasOutput: false })}
        pendingChanges={[]}
        findings={[]}
        canEditDraft={false}
        isBusy={false}
        onEdit={vi.fn()}
        onAcceptChange={vi.fn()}
        onRejectChange={vi.fn()}
        onCopyRevision={vi.fn()}
        onVisualRevision={vi.fn()}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Esta tela falhou");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente esta tela" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("marks human-edited slides and keeps suggestions from overwriting them", () => {
    renderEditor({ slide: editorSlide({ copyAuthority: "human_edit" }), pendingChanges: [pendingChange] });

    expect(screen.getByTestId("carousel-slide-authority")).toHaveTextContent("Editada por você");
    expect(screen.getByText("Esta tela foi editada por você. Sugestões nunca trocam o seu texto sem aceitação.")).toBeInTheDocument();
    expect(screen.getByLabelText("Texto principal")).toHaveValue("Texto atual");
  });

  it("disables copy edits while the draft is frozen", () => {
    renderEditor({ canEditDraft: false });

    expect(screen.getByLabelText("Texto principal")).toBeDisabled();
    expect(screen.getByLabelText("Propósito")).toBeDisabled();
  });

  it("renders nothing without a slide", () => {
    const { container } = renderEditor({ slide: null });
    expect(container).toBeEmptyDOMElement();
  });
});
