import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import RestylingModal from "@/components/workspace/RestylingModal";

describe("RestylingModal", () => {
  it("renders style intensity control with medium selected by default", () => {
    render(<RestylingModal open onOpenChange={vi.fn()} />);
    expect(screen.getByText("styleIntensityLabel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "styleIntensity.medium" })).toHaveAttribute("aria-pressed", "true");
  });

  it("allows selecting different style intensity", async () => {
    render(<RestylingModal open onOpenChange={vi.fn()} />);
    
    // Select strong intensity
    const strongButton = screen.getByRole("button", { name: "styleIntensity.strong" });
    fireEvent.click(strongButton);
    
    // Verify the button is now pressed
    expect(strongButton).toHaveAttribute("aria-pressed", "true");
    
    // Verify medium is no longer pressed
    expect(screen.getByRole("button", { name: "styleIntensity.medium" })).toHaveAttribute("aria-pressed", "false");
  });
});