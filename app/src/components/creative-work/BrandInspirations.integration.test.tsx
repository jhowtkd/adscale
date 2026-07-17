import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useInspirationsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/hooks/use-creative-inspirations", () => ({
  useCreativeInspirations: (...args: unknown[]) => useInspirationsMock(...args),
}));
vi.mock("@/components/layout/ActiveBrandSwitcher", () => ({
  default: () => <select aria-label="Marca ativa"><option>Marca</option></select>,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) =>
    key === "generate" ? `Gerar ${values?.count} variações · ${values?.credits} créditos` : key,
}));

import { BrandInspirations } from "./BrandInspirations";
import { CreativeComposer } from "./CreativeComposer";
import type { CreativeComposerModel, CreativeComposerViewModel } from "./useCreativeComposer";
import type { CreativeInspiration } from "@/server/application/list-creative-inspirations";

const baseComposer = {
  request: "", setRequest: vi.fn(), intent: "variations" as const, selectIntent: vi.fn(),
  format: "4:5" as const, setFormat: vi.fn(), targetFormats: [], toggleTargetFormat: vi.fn(), state: "empty" as const,
  workId: "work-1", brandName: "Marca A", outputs: [], quote: { unitCount: 3, credits: 15 },
  campaignId: null, campaigns: [], linkCampaign: vi.fn(), retryOutput: vi.fn(), retryRevisionOutput: vi.fn(),
  approveOutput: vi.fn(), downloadOutput: vi.fn(), reviseOutput: vi.fn(), isRetryingOutput: vi.fn(),
  isApprovingOutput: vi.fn(), isRevisingOutput: vi.fn(), canGenerate: true, isUploading: false,
  error: null, announcement: "", requiresBrandSelection: false, workError: false,
  addFiles: vi.fn(), addInspiration: vi.fn(), updateSource: vi.fn(), retrySource: vi.fn(), removeSource: vi.fn(), generate: vi.fn(),
};

function Harness() {
  const [sources, setSources] = useState<CreativeComposerViewModel["sources"]>([]);
  const attach = (inspiration: CreativeInspiration) => setSources([{
    id: `source-${inspiration.id}`, workspaceId: "workspace-1", workItemId: "work-1",
    assetId: inspiration.assetId, templateId: inspiration.templateId, name: inspiration.title,
    origin: inspiration.source, usage: "both", status: "ready", contentAnalysis: null,
    styleAnalysis: null, failureCode: null, createdAt: new Date(), updatedAt: new Date(),
  }]);
  const composer = { ...baseComposer, sources, addInspiration: attach } as CreativeComposerViewModel;
  return (
    <>
      <BrandInspirations clientProfileId="brand-1" onAttach={composer.addInspiration} />
      <CreativeComposer
        composer={composer}
        composerRef={{ current: null } as CreativeComposerModel["composerRef"]}
      />
    </>
  );
}

describe("brand inspiration composer integration", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [{ id: "template-1", source: "template", title: "Lançamento", previewUrl: null, templateId: "template-1", assetId: null, suggestedIntent: "variations" }, "Template"],
    [{ id: "output-1", source: "approved_work", title: "Matrículas", previewUrl: "/api/workspace/assets/asset-1/file", templateId: null, assetId: "asset-1", suggestedIntent: "restyle" }, "Trabalho aprovado"],
  ] as const)("renders the attached %s origin in the same composer without navigation", (inspiration, originLabel) => {
    useInspirationsMock.mockReturnValue({ data: [inspiration], isLoading: false, isError: false, refetch: vi.fn() });
    const before = window.location.href;
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: `Usar inspiração ${inspiration.title}` }));

    const chip = screen.getByRole("article");
    expect(within(chip).getByText(originLabel)).toBeInTheDocument();
    expect(within(chip).getByRole("button", { name: "Conteúdo" })).toBeInTheDocument();
    expect(within(chip).getByRole("button", { name: "Estilo" })).toBeInTheDocument();
    expect(within(chip).getByRole("button", { name: "Ambos" })).toHaveAttribute("aria-pressed", "true");
    expect(window.location.href).toBe(before);
  });
});
