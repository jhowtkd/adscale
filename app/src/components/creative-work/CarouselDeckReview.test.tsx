import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PublicCarouselQualityV1, PublicCarouselSlide } from "@/lib/hooks/use-creative-work";
import { CarouselDeckReview } from "./CarouselDeckReview";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === "slideLabel") return `Tela ${values?.position}`;
    if (key === "versionLabel") return `versão ${values?.version}`;
    return ({
      reviewTitle: "Revise o carrossel",
      status_queued: "Na fila", status_processing: "Gerando", status_completed: "Pronta", status_failed: "Falhou",
      downloadSlide: "Baixar tela",
      objectivePassed: "O objetivo do carrossel foi atingido.",
      objectiveFailed: "O objetivo do carrossel não foi atingido; revise as telas marcadas.",
      advisoryWarningsLabel: "Avisos do conjunto",
      retryAction: "Tentar novamente esta tela",
      approveAction: "Aprovar carrossel",
      approved: "Carrossel aprovado",
      exportAction: "Baixar carrossel (.zip)",
      exportRequiresApproval: "Aprove o carrossel para baixar o arquivo .zip.",
      coverReviewTitle: "Revise a capa piloto",
      approveCoverAndGenerate: "Aprovar capa e gerar demais slides",
    }[key] ?? key);
  },
}));

const NOW = new Date().toISOString();

function reviewSlide(position: number, overrides: Partial<PublicCarouselSlide> = {}): PublicCarouselSlide {
  return {
    id: `slide-${position}`,
    lineageId: `lineage-${position}`,
    parentSlideId: null,
    versionNumber: 1,
    deckRevision: "deck-r1",
    position,
    role: position === 1 ? "hook" : position === 5 ? "cta" : "context",
    primaryText: `Texto ${position}`,
    secondaryText: null,
    copyAuthority: "ai_proposal",
    sourceFactIds: [],
    layoutFamily: "development",
    status: "completed",
    hasOutput: true,
    errorCode: null,
    quality: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const completedQuality: PublicCarouselQualityV1 = {
  version: 1,
  objectivePassed: true,
  advisoryWarnings: [],
  reviewedAt: NOW,
  hasContactSheet: true,
};

type ReviewProps = Parameters<typeof CarouselDeckReview>[0];

function renderReview(props: Partial<ReviewProps> = {}) {
  const { quality, slides, ...rest } = props;
  return render(
    <CarouselDeckReview
      slides={slides ?? [1, 2, 3, 4, 5].map((position) => reviewSlide(position))}
      quality={quality === undefined ? completedQuality : quality}
      deckRevision="deck-r1"
      approvedRevision={null}
      canApprove={false}
      canExport={false}
      isBusy={false}
      onApprove={vi.fn()}
      onDownloadSlide={vi.fn()}
      onExport={vi.fn()}
      onRetrySlide={vi.fn()}
      {...rest}
    />,
  );
}

describe("CarouselDeckReview", () => {
  it("lists every slide with status and current version plus individual download", () => {
    const onDownloadSlide = vi.fn();
    renderReview({ onDownloadSlide });

    const third = screen.getByTestId("carousel-review-slide-3");
    expect(third).toHaveTextContent("Tela 3");
    expect(third).toHaveTextContent("Pronta");
    expect(third).toHaveTextContent("versão 1");

    fireEvent.click(screen.getByTestId("carousel-download-3"));
    expect(onDownloadSlide).toHaveBeenCalledWith("slide-3");
  });

  it("reports objective failures and advisory set warnings separately", () => {
    renderReview({
      quality: { version: 1, objectivePassed: false, advisoryWarnings: ["Muita repetição visual"], reviewedAt: NOW, hasContactSheet: false },
    });

    expect(screen.getByTestId("carousel-objective-failed")).toHaveTextContent(
      "O objetivo do carrossel não foi atingido; revise as telas marcadas.",
    );
    expect(screen.getByTestId("carousel-advisory-warnings")).toHaveTextContent("Muita repetição visual");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("offers an explicit retry for a failed slide", () => {
    const onRetrySlide = vi.fn();
    renderReview({
      slides: [reviewSlide(1, { status: "failed", hasOutput: false, errorCode: "provider_failed" }), ...[2, 3, 4, 5].map((position) => reviewSlide(position))],
      onRetrySlide,
    });

    expect(screen.getByTestId("carousel-review-retry-1")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("carousel-review-retry-1"));
    expect(onRetrySlide).toHaveBeenCalledWith("slide-1");
  });

  it("approves once when allowed and requires approval before the ZIP export", () => {
    const onApprove = vi.fn();
    const onExport = vi.fn();
    const first = renderReview({ canApprove: true, onApprove, onExport });

    const approve = screen.getByTestId("carousel-approve");
    expect(approve).toBeEnabled();
    expect(screen.getByTestId("carousel-export")).toBeDisabled();
    expect(screen.getByText("Aprove o carrossel para baixar o arquivo .zip.")).toBeInTheDocument();

    fireEvent.click(approve);
    expect(onApprove).toHaveBeenCalledTimes(1);

    first.rerender(
      <CarouselDeckReview
        slides={[1, 2, 3, 4, 5].map((position) => reviewSlide(position))}
        quality={completedQuality}
        deckRevision="deck-r1"
        approvedRevision="deck-r1"
        canApprove={false}
        canExport
        isBusy={false}
        headingRef={undefined}
        onApprove={vi.fn()}
        onDownloadSlide={vi.fn()}
        onExport={onExport}
        onRetrySlide={vi.fn()}
      />,
    );
    expect(screen.getByTestId("carousel-approve")).toBeDisabled();
    expect(screen.getByText("Carrossel aprovado")).toBeInTheDocument();
    const exportButton = screen.getByTestId("carousel-export");
    expect(exportButton).toBeEnabled();
    fireEvent.click(exportButton);
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("shows the cover approval button without generating on render", () => {
    const onApproveCoverAndGenerate = vi.fn();
    const onApprove = vi.fn();
    renderReview({
      coverReview: true,
      canApproveCover: true,
      onApproveCoverAndGenerate,
      onApprove,
      slides: [reviewSlide(1), ...[2, 3, 4, 5].map((position) => reviewSlide(position, { status: "draft", hasOutput: false }))],
    });

    expect(screen.getByRole("heading", { name: "Revise a capa piloto" })).toBeInTheDocument();
    const coverButton = screen.getByRole("button", { name: "Aprovar capa e gerar demais slides" });
    expect(coverButton).toBeEnabled();
    expect(onApproveCoverAndGenerate).not.toHaveBeenCalled();
    expect(onApprove).not.toHaveBeenCalled();
    fireEvent.click(coverButton);
    expect(onApproveCoverAndGenerate).toHaveBeenCalledTimes(1);
    expect(onApprove).not.toHaveBeenCalled();
  });
});
