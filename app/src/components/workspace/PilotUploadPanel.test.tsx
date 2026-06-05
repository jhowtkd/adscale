import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import PilotUploadPanel from "./PilotUploadPanel";

const mockUploadAsset = vi.fn();
const mockAnalyze = vi.fn();
const mockAnalyzePreflight = vi.fn();

vi.mock("@/lib/hooks/use-assets", () => ({
  useUploadAsset: vi.fn(() => ({
    mutateAsync: mockUploadAsset,
    isPending: false,
  })),
}));

vi.mock("@/components/campaigns/useCreativeAnalysis", () => ({
  useCreativeAnalysis: vi.fn(() => ({
    analyze: mockAnalyze,
    isAnalyzing: false,
    analysisResult: null,
    analysisError: null,
  })),
}));

vi.mock("@/lib/hooks/use-preflight", () => ({
  useAnalyzePreflight: vi.fn(() => ({
    mutateAsync: mockAnalyzePreflight,
    isPending: false,
  })),
}));

vi.mock("@/components/workspace/CreativeReadinessPanel", () => ({
  default: function MockCreativeReadinessPanel() {
    return <div data-testid="creative-readiness-panel" />;
  },
}));

vi.mock("next/image", () => ({
  default: function MockImage(props: { alt?: string }) {
    return <img alt={props.alt ?? ""} />;
  },
}));

function createFile(name = "test.png", type = "image/png"): File {
  return new File(["x"], name, { type });
}

function getFileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

describe("PilotUploadPanel", () => {
  const onAssetUploaded = vi.fn();
  const onAnalysisComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls onAnalysisComplete with mapped data when both analyses succeed", async () => {
    mockUploadAsset.mockResolvedValue({ id: "asset-1" });
    mockAnalyzePreflight.mockResolvedValue({
      preflight: {
        criticalIssues: ["Baixo contraste"],
        technical: { actualWidth: 1080, actualHeight: 1080 },
      },
    });
    mockAnalyze.mockResolvedValue({
      analysis: {
        product: { value: "Curso online" },
        objective: { value: "Aumentar vendas" },
        targetAudience: { value: "Jovens adultos" },
        tone: { value: "Profissional" },
        platforms: { value: ["Instagram", "Facebook"] },
        suggestedCtas: [{ value: "Compre agora" }],
      },
      status: "completed",
    });

    const { container } = render(
      <PilotUploadPanel
        campaignId="camp-1"
        onAssetUploaded={onAssetUploaded}
        onAnalysisComplete={onAnalysisComplete}
      />
    );

    const input = getFileInput(container);
    fireEvent.change(input, { target: { files: [createFile()] } });

    await waitFor(() => {
      expect(onAnalysisComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          detectedConcept: "Curso online",
          suggestedObjective: "Aumentar vendas",
          suggestedAudience: "Jovens adultos",
          suggestedTone: "Profissional",
          suggestedPlatforms: "Instagram, Facebook",
          suggestedCta: "Compre agora",
          tone: "Profissional",
          elements: "Baixo contraste",
          format: "1080x1080px",
        })
      );
    });

    expect(screen.getByText("Análise concluída")).toBeInTheDocument();
    expect(screen.queryByText(/Não foi possível extrair sugestões/i)).not.toBeInTheDocument();
  });

  it("shows warning when creative analysis is empty but preflight works", async () => {
    mockUploadAsset.mockResolvedValue({ id: "asset-1" });
    mockAnalyzePreflight.mockResolvedValue({
      preflight: {
        criticalIssues: ["Texto pequeno"],
        technical: { actualWidth: 1200, actualHeight: 628 },
      },
    });
    mockAnalyze.mockResolvedValue({
      analysis: {},
      status: "completed",
    });

    const { container } = render(
      <PilotUploadPanel
        campaignId="camp-1"
        onAssetUploaded={onAssetUploaded}
        onAnalysisComplete={onAnalysisComplete}
      />
    );

    const input = getFileInput(container);
    fireEvent.change(input, { target: { files: [createFile()] } });

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível extrair sugestões automaticamente/i)).toBeInTheDocument();
    });

    expect(screen.getByText("Análise concluída")).toBeInTheDocument();
    expect(onAnalysisComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        detectedConcept: "Criativo publicitário",
        suggestedObjective: "",
        suggestedAudience: "",
        suggestedPlatforms: "",
        suggestedCta: "",
        elements: "Texto pequeno",
        format: "1200x628px",
      })
    );
  });

  it("shows error state when both analyses fail", async () => {
    mockUploadAsset.mockResolvedValue({ id: "asset-1" });
    mockAnalyzePreflight.mockRejectedValue(new Error("Preflight failed"));
    mockAnalyze.mockRejectedValue(new Error("Creative failed"));

    const { container } = render(
      <PilotUploadPanel
        campaignId="camp-1"
        onAssetUploaded={onAssetUploaded}
        onAnalysisComplete={onAnalysisComplete}
      />
    );

    const input = getFileInput(container);
    fireEvent.change(input, { target: { files: [createFile()] } });

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível analisar o criativo/i)).toBeInTheDocument();
    });

    expect(onAnalysisComplete).not.toHaveBeenCalled();
  });

  it("shows error state when upload fails", async () => {
    mockUploadAsset.mockRejectedValue(new Error("Upload failed"));

    const { container } = render(
      <PilotUploadPanel
        campaignId="camp-1"
        onAssetUploaded={onAssetUploaded}
        onAnalysisComplete={onAnalysisComplete}
      />
    );

    const input = getFileInput(container);
    fireEvent.change(input, { target: { files: [createFile()] } });

    await waitFor(() => {
      expect(screen.getByText(/Falha no processamento/i)).toBeInTheDocument();
    });
  });
});
