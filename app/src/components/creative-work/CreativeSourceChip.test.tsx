import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreativeSourceChip } from "./CreativeSourceChip";

const baseSource = {
  id: "source-1", name: "arte.png", origin: "upload" as const, usage: "content" as const,
  status: "ready" as const, contentAnalysis: { product: "Tênis", offer: "20%" }, styleAnalysis: null,
};

describe("CreativeSourceChip", () => {
  it("keeps the file while changing usage and exposes polite status", () => {
    const onUsageChange = vi.fn();
    render(<CreativeSourceChip source={baseSource} onUsageChange={onUsageChange} onRetry={vi.fn()} onRemove={vi.fn()} onReview={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Estilo" }));
    expect(onUsageChange).toHaveBeenCalledWith("style");
    expect(screen.getByText("arte.png")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Tênis")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Usar arte como" })).toBeInTheDocument();
  });

  it("shows retry only for an analysis failure", () => {
    const onRetry = vi.fn();
    const onRemove = vi.fn();
    render(<CreativeSourceChip source={{ ...baseSource, status: "failed" }} onUsageChange={vi.fn()} onRetry={onRetry} onRemove={onRemove} onReview={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    fireEvent.click(screen.getByRole("button", { name: "Remover fonte" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("opens review for ready analysis", () => {
    const onReview = vi.fn();
    render(<CreativeSourceChip source={baseSource} onUsageChange={vi.fn()} onRetry={vi.fn()} onRemove={vi.fn()} onReview={onReview} />);
    fireEvent.click(screen.getByRole("button", { name: "Revisar dados" }));
    expect(onReview).toHaveBeenCalledOnce();
  });
});
