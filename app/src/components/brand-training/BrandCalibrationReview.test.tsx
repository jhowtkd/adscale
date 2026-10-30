import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ command: vi.fn(), publish: vi.fn() }));
const calibrationState = vi.hoisted(() => ({
  payload: null as null | {
    session: null | {
      id: string;
      status: string;
      revision: number;
      candidate: { hash: string };
      rounds: Array<{
        number: number;
        candidate: { hash: string };
        quoteCredits: number;
        coverage: string[];
        slots: Array<{ index: number; workItemId: string; outputId: string | null; feedback: null | { rating: string } }>;
      }>;
      extensionCount: number;
    };
    activeVersionId: string | null;
    quoteCredits: number;
    examples: Array<{
      workItemId: string;
      format?: string;
      generationMode?: "single" | "carousel" | "creative_revision" | "format_adaptation";
      outputId: string | null;
      previewUrl: string | null;
      assessment: { status: string; objective: string; rating: string | null; needsHumanReview: boolean };
    }>;
    pendingProof?: Array<{ generationMode: string; format: string; reason: "no_base" | "awaiting_round" | "not_approved" }>;
    refinementNextRound?: boolean;
  },
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string, values?: Record<string, unknown>) => ({
  calibrationTitle: "Calibração do treinamento",
  calibrationConfirmSet: "Confirmar conjunto e pedir cotação",
  calibrationQuote: `Custo da rodada: ${values?.credits ?? ""} créditos`,
  calibrationStart: "Gerar 4 exemplos",
  calibrationStarting: "Gerando exemplos…",
  calibrationRound: `Rodada ${values?.current ?? ""} de ${values?.total ?? ""}`,
  calibrationExample: `Exemplo ${values?.slot ?? ""}`,
  calibrationSingleScope: `Peça única · ${values?.format}`,
  calibrationCarouselScope: `Carrossel · ${values?.format}`,
  calibrationRevisionScope: `Revisão · ${values?.format}`,
  calibrationAdaptationScope: `Adaptação · ${values?.format}`,
  calibrationProofTitle: "Sem prova nesta sessão",
  calibrationProofNoBase: "falta um exemplo anterior aprovado",
  calibrationProofAwaitingRound: "entra na próxima rodada",
  calibrationProofNotApproved: "exemplo não aprovado",
  calibrationRateGood: "Está bom",
  calibrationRateBad: "Precisa melhorar",
  calibrationNoteLabel: "O que precisa mudar?",
  calibrationNotePlaceholder: "Descreva o ajuste sem presumir a causa",
  calibrationCoverage: `Aspectos cobertos: ${values?.covered ?? ""}`,
  calibrationUncovered: `Não exercitados: ${values?.uncovered ?? ""}`,
  calibrationFailed: "Falha na geração — este slot não será reposto",
  calibrationRunning: "Gerando…",
  calibrationActivate: "Ativar treinamento validado",
  calibrationActivating: "Ativando…",
  calibrationPending: "Treinamento pendente",
  calibrationExtend: "Abrir mais uma rodada",
  calibrationNoSession: "Nenhuma calibração em aberto. Confirme o conjunto revisado para começar.",
  calibrationNeedsReview: "Aguardando sua revisão",
  calibrationWaitingJudgement: "Aguardando avaliação dos 4 exemplos",
}[key] ?? key) }));

vi.mock("@/lib/hooks/use-brand-training", async (original) => ({
  ...(await original<typeof import("@/lib/hooks/use-brand-training")>()),
  useBrandCalibration: () => ({ data: calibrationState.payload, isLoading: false }),
  useCalibrationCommand: () => ({ mutate: mocks.command, isPending: false }),
  usePublishBrandKnowledge: () => ({ mutate: mocks.publish, isPending: false }),
}));

import { BrandCalibrationReview } from "./BrandCalibrationReview";

const HASH = "c".repeat(64);

function sessionWithRound(rounds: number, extensionCount = 0) {
  return {
    id: "session-1",
    status: "calibrating",
    revision: 4,
    candidate: { hash: HASH },
    rounds: Array.from({ length: rounds }, (_, index) => ({
      number: index + 1,
      candidate: { hash: HASH },
      quoteCredits: 200,
      coverage: ["palette.colors"],
      slots: [0, 1, 2, 3].map((slot) => ({ index: slot, workItemId: `work-${slot}`, outputId: `out-${slot}`, feedback: null })),
    })),
    extensionCount,
  };
}

function example(slot: number, assessment: Record<string, unknown>) {
  return {
    workItemId: `work-${slot}`,
    outputId: `out-${slot}`,
    previewUrl: `/api/creative-work/work-${slot}/outputs/out-${slot}/download`,
    assessment: { status: "completed", objective: "pass", rating: null, needsHumanReview: false, ...assessment },
  };
}

describe("BrandCalibrationReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calibrationState.payload = null;
  });

  it("identifies each scope and preserves the full 9:16 and square previews", () => {
    calibrationState.payload = { session: sessionWithRound(1), activeVersionId: null, quoteCredits: 8,
      examples: [{ ...example(0, {}), format: "9:16", generationMode: "single" }, { ...example(1, {}), format: "1:1", generationMode: "carousel" }] };
    render(<BrandCalibrationReview clientProfileId="profile-1" />);
    expect(screen.getByText("Peça única · 9:16")).toBeVisible();
    expect(screen.getByText("Carrossel · 1:1")).toBeVisible();
    expect(screen.getByRole("img", { name: "Exemplo 1" })).toHaveStyle({ aspectRatio: "9 / 16" });
    expect(screen.getByRole("img", { name: "Exemplo 2" })).toHaveStyle({ aspectRatio: "1 / 1" });
  });

  it("labels refinement examples of one work apart", () => {
    calibrationState.payload = { session: sessionWithRound(1), activeVersionId: null, quoteCredits: 8, examples: [
      { ...example(0, {}), generationMode: "single", format: "4:5" },
      { ...example(0, {}), generationMode: "creative_revision", format: "4:5" },
      { ...example(0, {}), generationMode: "format_adaptation", format: "9:16" },
    ] };
    render(<BrandCalibrationReview clientProfileId="profile-1" />);
    expect(screen.getByText("Revisão · 4:5")).toBeVisible();
    expect(screen.getByText("Adaptação · 9:16")).toBeVisible();
    expect(screen.getByRole("img", { name: "Exemplo 3" })).toHaveStyle({ aspectRatio: "9 / 16" });
  });

  it("tells which refinement scopes stay without proof and why", () => {
    calibrationState.payload = { session: sessionWithRound(1), activeVersionId: null, quoteCredits: 8,
      examples: [example(0, {}), example(1, {}), example(2, {}), example(3, {})],
      pendingProof: [
        { generationMode: "creative_revision", format: "4:5", reason: "no_base" },
        { generationMode: "format_adaptation", format: "9:16", reason: "not_approved" },
        { generationMode: "creative_revision", format: "9:16", reason: "awaiting_round" },
      ] };
    render(<BrandCalibrationReview clientProfileId="profile-1" />);
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("Sem prova nesta sessão");
    expect(note).toHaveTextContent("Revisão · 4:5: falta um exemplo anterior aprovado");
    expect(note).toHaveTextContent("Adaptação · 9:16: exemplo não aprovado");
    expect(note).toHaveTextContent("Revisão · 9:16: entra na próxima rodada");
  });

  it("shows no notice when nothing is pending", () => {
    calibrationState.payload = { session: sessionWithRound(1), activeVersionId: null, quoteCredits: 8, examples: [example(0, {})] };
    render(<BrandCalibrationReview clientProfileId="profile-1" />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("lets an approved round open the next one only when refinement is due", () => {
    const approved = [0, 1, 2, 3].map(slot => example(slot, { rating: "good" }));
    calibrationState.payload = { session: sessionWithRound(1), activeVersionId: null, quoteCredits: 8, examples: approved, refinementNextRound: true };
    const { unmount } = render(<BrandCalibrationReview clientProfileId="profile-1" />);
    const start = screen.getByRole("button", { name: "Gerar 4 exemplos" });
    expect(start).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ativar treinamento validado" })).toBeEnabled();
    fireEvent.click(start);
    expect(mocks.command).toHaveBeenCalledWith(expect.objectContaining({ action: "start", sessionId: "session-1" }));
    unmount();
    calibrationState.payload = { ...calibrationState.payload, refinementNextRound: false };
    render(<BrandCalibrationReview clientProfileId="profile-1" />);
    expect(screen.getByRole("button", { name: "Gerar 4 exemplos" })).toBeDisabled();
  });

  it("confirms the reviewed set without generating images", () => {
    calibrationState.payload = { session: null, activeVersionId: null, quoteCredits: 200, examples: [] };
    render(<BrandCalibrationReview clientProfileId="profile-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar conjunto e pedir cotação" }));
    expect(mocks.command).toHaveBeenCalledWith({ action: "create", expectedActiveVersionId: null });
  });

  it("shows the quote before starting a round", () => {
    calibrationState.payload = {
      session: { ...sessionWithRound(0), rounds: [], status: "review" },
      activeVersionId: null,
      quoteCredits: 200,
      examples: [],
    };
    render(<BrandCalibrationReview clientProfileId="profile-1" />);
    expect(screen.getByText("Custo da rodada: 200 créditos")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Gerar 4 exemplos" }));
    expect(mocks.command).toHaveBeenCalledWith({
      action: "start",
      sessionId: "session-1",
      expectedRevision: 4,
      acceptedCredits: 200,
    });
  });

  it("rates examples with keyboard-readable labels and saves the note without inventing a cause", () => {
    calibrationState.payload = {
      session: sessionWithRound(1),
      activeVersionId: null,
      quoteCredits: 200,
      examples: [example(0, {}), example(1, {}), example(2, {}), example(3, {})],
    };
    render(<BrandCalibrationReview clientProfileId="profile-1" />);
    expect(screen.getByText("Rodada 1 de 3")).toBeVisible();
    expect(screen.getByText("Aspectos cobertos: palette.colors")).toBeVisible();
    expect(screen.getByText("Não exercitados: —")).toBeVisible();
    expect(screen.getByRole("button", { name: "Ativar treinamento validado" })).toBeDisabled();

    const notes = screen.getAllByRole("textbox");
    fireEvent.change(notes[1]!, { target: { value: "Tom mais escuro que o guia" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Precisa melhorar" })[1]!);
    expect(mocks.command).toHaveBeenCalledWith({
      action: "feedback",
      sessionId: "session-1",
      expectedRevision: 4,
      round: 1,
      slot: 1,
      rating: "bad",
      note: "Tom mais escuro que o guia",
      dimensions: [],
    });
  });

  it("activates only with four good examples and publishes the validated hash", () => {
    calibrationState.payload = {
      session: sessionWithRound(1),
      activeVersionId: null,
      quoteCredits: 200,
      examples: [
        example(0, { rating: "good" }),
        example(1, { rating: "good" }),
        example(2, { rating: "good" }),
        example(3, { rating: "good" }),
      ],
    };
    render(<BrandCalibrationReview clientProfileId="profile-1" />);
    const activate = screen.getByRole("button", { name: "Ativar treinamento validado" });
    expect(activate).toBeEnabled();
    fireEvent.click(activate);
    expect(mocks.publish).toHaveBeenCalledWith({ sessionId: "session-1", expectedRevision: 4, candidateHash: HASH });
  });

  it("keeps activation blocked on failure, doubt or missing judgement", () => {
    calibrationState.payload = {
      session: sessionWithRound(1),
      activeVersionId: null,
      quoteCredits: 200,
      examples: [
        example(0, { rating: "good" }),
        example(1, { rating: "good" }),
        example(2, { status: "failed", objective: "fail", rating: "good" }),
        example(3, { rating: "good", needsHumanReview: true }),
      ],
    };
    render(<BrandCalibrationReview clientProfileId="profile-1" />);
    expect(screen.getByRole("button", { name: "Ativar treinamento validado" })).toBeDisabled();
    expect(screen.getByText("Falha na geração — este slot não será reposto")).toBeVisible();
    expect(screen.getByText("Aguardando sua revisão")).toBeVisible();
  });

  it("announces running rounds and disables rating while generating", () => {
    calibrationState.payload = {
      session: sessionWithRound(1),
      activeVersionId: null,
      quoteCredits: 200,
      examples: [
        example(0, { status: "processing", objective: "inconclusive", outputId: null }),
        example(1, { status: "queued", objective: "inconclusive", outputId: null }),
        example(2, { status: "queued", objective: "inconclusive", outputId: null }),
        example(3, { status: "queued", objective: "inconclusive", outputId: null }),
      ],
    };
    render(<BrandCalibrationReview clientProfileId="profile-1" />);
    expect(screen.getAllByText("Gerando…").length).toBeGreaterThanOrEqual(4);
    for (const button of screen.getAllByRole("button", { name: "Está bom" })) {
      expect(button).toBeDisabled();
    }
  });

  it("shows the reviewed IDs the four cases leave unexercised", () => {
    calibrationState.payload = {
      session: sessionWithRound(1),
      activeVersionId: null,
      quoteCredits: 200,
      uncovered: ["bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb"],
      examples: [example(0, {}), example(1, {}), example(2, {}), example(3, {})],
    } as never;
    render(<BrandCalibrationReview clientProfileId="profile-1" />);
    expect(screen.getByText("Não exercitados: bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb")).toBeVisible();
  });

  it("offers an explicit extension at the ceiling without auto-generating", () => {
    calibrationState.payload = {
      session: sessionWithRound(3),
      activeVersionId: null,
      quoteCredits: 200,
      examples: [example(0, {}), example(1, {}), example(2, {}), example(3, {})],
    };
    render(<BrandCalibrationReview clientProfileId="profile-1" />);
    expect(screen.getByText("Treinamento pendente")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Gerar 4 exemplos" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir mais uma rodada" }));
    expect(mocks.command).toHaveBeenCalledWith({ action: "extend", sessionId: "session-1", expectedRevision: 4 });
  });
});
