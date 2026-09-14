import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  review: vi.fn(),
  publish: vi.fn(),
  command: vi.fn(),
  reviewRepertoire: vi.fn(),
  synthesizeRepertoire: vi.fn(),
}));
const calibrationState = vi.hoisted(() => ({ payload: null as null | Record<string, unknown> }));
const assetsState = vi.hoisted(() => ({ assets: [] as Array<{ id: string; url: string }> }));
const knowledgeState = vi.hoisted(() => {
  const claims = [
    {
      id: "claim-1",
      claimKey: "palette.colors",
      value: ["#D71F2B"],
      authority: "inferred",
      confidence: "medium",
      status: "candidate",
      evidenceRefs: [{ type: "brand_guide", id: "guide-1", path: "extraction.colors", sourceHash: "a".repeat(64) }],
    },
    {
      id: "claim-2",
      claimKey: "palette.colors",
      value: ["#00FF00"],
      authority: "explicit",
      confidence: "high",
      status: "approved",
      evidenceRefs: [{ type: "brand_kit_field", id: "profile-1", path: "brandColors", sourceHash: "b".repeat(64) }],
    },
  ];
  return {
    defaultClaims: claims,
    claims,
    conflicts: [{ claimKey: "palette.colors", comparison: "conflict", claims: [{ id: "claim-1" }, { id: "claim-2" }] }],
    versions: [{ id: "version-1", versionNumber: 1, hash: "c".repeat(64), status: "active", publishedByUserId: "user-1", publishedAt: "2026-08-13T12:00:00.000Z" }],
    activeVersion: { id: "version-1", versionNumber: 1, hash: "c".repeat(64), status: "active" },
  };
});
vi.mock("next-intl", () => ({ useTranslations: () => (key: string, values?: Record<string, unknown>) => ({
  title: "Conhecimento da marca",
  candidate: "Aguardando revisão",
  approved: "Aceito",
  rejected: "Rejeitado",
  approve: "Aceitar",
  reject: "Rejeitar",
  saveEdit: "Salvar edição e aceitar",
  authority: "Autoridade",
  confidence: "Confiança",
  evidence: "Evidência",
  conflictsTitle: "Conflitos pendentes",
  filterAria: "Filtrar conhecimento",
  filterAll: "Todos",
  filterReview: "Aprovar",
  filterApproved: "Aceitos",
  filterArchive: "Arquivo",
  publish: "Publicar versão",
  activeVersion: `Versão ativa ${values?.number ?? ""}`,
  historyTitle: "Histórico",
  empty: "Nenhum claim extraído",
  calibrationTitle: "Calibração do treinamento",
  synthesizeRepertoire: "Sintetizar repertório",
  synthesizingRepertoire: "Sintetizando repertório…",
  confirmRepertoireSet: "Aprovar entendimento e preparar calibração",
}[key] ?? key) }));

vi.mock("@/lib/hooks/use-brand-training", async (original) => ({
  ...(await original<typeof import("@/lib/hooks/use-brand-training")>()),
  useBrandKnowledge: () => ({
    data: {
      claims: knowledgeState.claims,
      conflicts: knowledgeState.claims === knowledgeState.defaultClaims ? knowledgeState.conflicts : [],
      versions: knowledgeState.versions,
      activeVersion: knowledgeState.activeVersion,
    },
    isLoading: false,
  }),
  useReviewBrandKnowledgeClaim: () => ({ mutate: mocks.review, isPending: false }),
  usePublishBrandKnowledge: () => ({ mutate: mocks.publish, isPending: false }),
  useBrandCalibration: () => ({ data: calibrationState.payload, isLoading: false }),
  useCalibrationCommand: () => ({ mutate: mocks.command, isPending: false }),
  useBrandTrainingAssets: () => ({ data: assetsState.assets, isLoading: false }),
  useReviewRepertoire: () => ({ mutate: mocks.reviewRepertoire, isPending: false }),
  useSynthesizeRepertoire: () => ({ mutate: mocks.synthesizeRepertoire, isPending: false }),
}));

import { BrandKnowledgeReview } from "./BrandKnowledgeReview";

describe("BrandKnowledgeReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    knowledgeState.claims = knowledgeState.defaultClaims;
    calibrationState.payload = null;
    assetsState.assets = [];
  });

  it("shows source, authority, confidence and conflicts side by side", () => {
    render(<BrandKnowledgeReview clientProfileId="profile-1" />);
    expect(screen.getByTestId("brand-kit-knowledge").className).not.toMatch(/border/);
    expect(screen.getByRole("radiogroup", { name: "Filtrar conhecimento" })).toBeInTheDocument();
    expect(screen.getByText("Conflitos pendentes")).toBeVisible();
    expect(screen.getAllByText("palette.colors")).toHaveLength(3);
    expect(screen.getAllByText(/brand_guide · extraction.colors/)[0]).toBeVisible();
    expect(screen.getAllByText(/inferred.*medium/)[0]).toBeVisible();
    // Direct publishing is gone: activation flows through calibration.
    expect(screen.queryByRole("button", { name: "Publicar versão" })).not.toBeInTheDocument();
  });

  it("mounts the calibration review on the already-mounted surface (plan 01, T3)", () => {
    calibrationState.payload = { session: null, activeVersionId: null, quoteCredits: 200, examples: [] };
    render(<BrandKnowledgeReview clientProfileId="profile-1" />);
    expect(screen.getByTestId("brand-calibration-review")).toBeVisible();
    expect(screen.getByText("Calibração do treinamento")).toBeVisible();
    calibrationState.payload = null;
  });

  it("accepts, edits or rejects a candidate only through explicit actions", () => {
    render(<BrandKnowledgeReview clientProfileId="profile-1" />);
    fireEvent.click(screen.getAllByRole("button", { name: "Aceitar" })[0]!);
    expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({ claimId: "claim-1", status: "approved" }));

    fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value: '["#112233"]' } });
    fireEvent.click(screen.getAllByRole("button", { name: "Salvar edição e aceitar" })[0]!);
    expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({ claimId: "claim-1", status: "approved", value: ["#112233"] }));

    fireEvent.click(screen.getAllByRole("button", { name: "Rejeitar" })[0]!);
    expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({ claimId: "claim-1", status: "rejected" }));
  });

  it("edits a people.catalog candidate through the structured people review", () => {
    knowledgeState.claims = [
      {
        id: "claim-people",
        claimKey: "people.catalog",
        value: {
          version: 1,
          people: [{
            id: "11111111-1111-4111-8111-111111111111",
            name: "Ana",
            aliases: [],
            referenceIds: ["22222222-2222-4222-8222-222222222222"],
            primaryReferenceId: "22222222-2222-4222-8222-222222222222",
            preserve: [],
            referenceAdequacy: "confirmed",
          }],
        },
        authority: "human",
        confidence: "high",
        status: "candidate",
        evidenceRefs: [],
      },
    ] as never;
    render(<BrandKnowledgeReview clientProfileId="profile-1" />);

    expect(screen.getByTestId("brand-people-review")).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "people.name" }), { target: { value: "Ana Paula" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar edição e aceitar" }));
    expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({
      claimId: "claim-people",
      status: "approved",
      value: expect.objectContaining({
        version: 1,
        people: [expect.objectContaining({ name: "Ana Paula" })],
      }),
    }));
  });

  const repertoireClaim = {
    id: "claim-repertoire",
    claimKey: "visual.repertoire",
    value: {
      version: 1,
      common: [{
        id: "11111111-1111-4111-8111-111111111111",
        dimension: "hierarchy",
        observation: "Título domina a leitura",
        application: "Dar ao título escala superior ao texto de apoio",
        avoid: "Competição de dois focos",
        evidenceIds: ["ref-1"],
        confidence: "high",
      }],
      languages: [],
    },
    authority: "inferred",
    confidence: "medium",
    status: "candidate",
    evidenceRefs: [],
  } as never;

  it("edits a visual.repertoire claim through the structured repertoire review", () => {
    knowledgeState.claims = [repertoireClaim];
    assetsState.assets = [{ id: "ref-1", url: "https://img/ref-1.jpg" }];
    render(<BrandKnowledgeReview clientProfileId="profile-1" />);

    expect(screen.getByTestId("visual-repertoire-review")).toBeVisible();
    expect(screen.getByAltText("repertoire.evidenceAlt")).toHaveAttribute("src", "https://img/ref-1.jpg");
    fireEvent.change(screen.getByRole("textbox", { name: "repertoire.application" }), {
      target: { value: "Priorizar o título sempre" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar edição e aceitar" }));
    expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({
      claimId: "claim-repertoire",
      status: "approved",
      value: expect.objectContaining({
        version: 1,
        common: [expect.objectContaining({ application: "Priorizar o título sempre" })],
      }),
    }));
  });

  it("confirms the reviewed set with a single repertoire mutation", () => {
    knowledgeState.claims = [repertoireClaim];
    calibrationState.payload = {
      session: {
        id: "session-1",
        status: "review",
        revision: 5,
        candidate: { hash: "h" },
        rounds: [],
        extensionCount: 0,
      },
      activeVersionId: null,
      quoteCredits: 200,
      examples: [],
    };
    render(<BrandKnowledgeReview clientProfileId="profile-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Aprovar entendimento e preparar calibração" }));
    expect(mocks.reviewRepertoire).toHaveBeenCalledTimes(1);
    expect(mocks.reviewRepertoire).toHaveBeenCalledWith({
      sessionId: "session-1",
      expectedRevision: 5,
      value: repertoireClaim.value,
    });
  });

  it("hides the set confirmation without an open session and synthesizes on request", () => {
    knowledgeState.claims = [repertoireClaim];
    render(<BrandKnowledgeReview clientProfileId="profile-1" />);

    expect(screen.queryByRole("button", { name: "Aprovar entendimento e preparar calibração" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sintetizar repertório" }));
    expect(mocks.synthesizeRepertoire).toHaveBeenCalledTimes(1);
    expect(mocks.synthesizeRepertoire).toHaveBeenCalledWith({});
  });
});
