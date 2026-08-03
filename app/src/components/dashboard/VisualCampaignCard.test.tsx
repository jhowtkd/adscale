import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import VisualCampaignCard from "./VisualCampaignCard";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === "thumbnailAlt") return `Thumbnail for ${values?.name}`;
    if (key === "openCampaign") return "Open campaign";
    if (key === "variationSingular") return "variation";
    if (key === "variationPlural") return "variations";
    if (key === "approvedCount") return `${values?.count} approved`;
    if (key === "moreActions") return "More actions";
    return key;
  },
  useLocale: () => "en",
}));

vi.mock("next/image", () => ({
  default: ({
    alt,
    className,
    onLoad,
    width,
    height,
  }: {
    alt: string;
    className?: string;
    onLoad?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
    width?: number;
    height?: number;
  }) => (
  <img
    alt={alt}
    className={className}
    width={width}
    height={height}
    onLoad={(event) => {
      Object.defineProperty(event.currentTarget, "naturalWidth", { value: 1080 });
      Object.defineProperty(event.currentTarget, "naturalHeight", { value: 1920 });
      onLoad?.(event);
    }}
  />
  ),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => false,
}));

describe("VisualCampaignCard", () => {
  const baseProps = {
    id: "campaign-1",
    name: "Cenbrap em Dobro - Teste",
    thumbnailUrl: "https://example.com/thumb.jpg",
    pieceCount: 11,
    approvedCount: 10,
    status: "completed",
    updatedAt: new Date().toISOString(),
  };

  it("renders campaign metadata and preserves navigation link", () => {
    render(<VisualCampaignCard {...baseProps} />);

    expect(screen.getByRole("link", { name: /Open campaign/i })).toHaveAttribute(
      "href",
      "/campaigns/campaign-1",
    );
    expect(screen.getByText("Cenbrap em Dobro - Teste")).toBeInTheDocument();
    expect(screen.getByText("CONCLUÍDA")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("variations")).toBeInTheDocument();
    expect(screen.getByText(/10 approved/)).toBeInTheDocument();
  });

  it("uses natural-height image styling for masonry cards", () => {
    render(<VisualCampaignCard {...baseProps} />);

    const image = screen.getByRole("img", { name: /Thumbnail for/i });
    expect(image).toHaveClass("h-auto");
    expect(image).toHaveClass("w-full");

    fireEvent.load(image);
    expect(image).toHaveAttribute("width", "1080");
    expect(image).toHaveAttribute("height", "1920");
  });

  it.each([
    ["generating", "GERANDO", "text-[var(--warning-text)]"],
    ["failed", "FALHOU", "text-[var(--danger-text)]"],
    ["completed", "CONCLUÍDA", "text-[var(--success-text)]"],
    ["active", "ATIVA", "text-[var(--info-text)]"],
    ["draft", "RASCUNHO", "text-[var(--neutral-text)]"],
  ])("renders %s with its semantic status tone", (status, label, toneClass) => {
    render(<VisualCampaignCard {...baseProps} status={status} />);

    expect(screen.getByText(label)).toHaveClass(toneClass);
  });
});
