import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ review: vi.fn(), publish: vi.fn() }));
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
  publish: "Publicar versão",
  activeVersion: `Versão ativa ${values?.number ?? ""}`,
  historyTitle: "Histórico",
  empty: "Nenhum claim extraído",
}[key] ?? key) }));

vi.mock("@/lib/hooks/use-brand-training", async (original) => ({
  ...(await original<typeof import("@/lib/hooks/use-brand-training")>()),
  useBrandKnowledge: () => ({ data: {
    claims: [
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
    ],
    conflicts: [{ claimKey: "palette.colors", comparison: "conflict", claims: [{ id: "claim-1" }, { id: "claim-2" }] }],
    versions: [{ id: "version-1", versionNumber: 1, hash: "c".repeat(64), status: "active", publishedByUserId: "user-1", publishedAt: "2026-08-13T12:00:00.000Z" }],
    activeVersion: { id: "version-1", versionNumber: 1, hash: "c".repeat(64), status: "active" },
  }, isLoading: false }),
  useReviewBrandKnowledgeClaim: () => ({ mutate: mocks.review, isPending: false }),
  usePublishBrandKnowledge: () => ({ mutate: mocks.publish, isPending: false }),
}));

import { BrandKnowledgeReview } from "./BrandKnowledgeReview";

describe("BrandKnowledgeReview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows source, authority, confidence and conflicts side by side", () => {
    render(<BrandKnowledgeReview clientProfileId="profile-1" />);
    expect(screen.getByText("Conflitos pendentes")).toBeVisible();
    expect(screen.getAllByText("palette.colors")).toHaveLength(3);
    expect(screen.getAllByText(/brand_guide · extraction.colors/)[0]).toBeVisible();
    expect(screen.getAllByText(/inferred.*medium/)[0]).toBeVisible();
    expect(screen.getByRole("button", { name: "Publicar versão" })).toBeDisabled();
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
});
