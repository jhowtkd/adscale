import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("framer-motion", () => ({
  m: {
    div: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import QuickToolsRestylingPage from "@/app/(dashboard)/quick-tools/restyling/page";

describe("QuickToolsRestylingPage", () => {
  it("renders style intensity control with medium selected by default", () => {
    render(<QuickToolsRestylingPage />);
    expect(screen.getByText("styleIntensityLabel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "styleIntensity.medium" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("allows selecting different style intensity", () => {
    render(<QuickToolsRestylingPage />);

    const strongButton = screen.getByRole("button", { name: "styleIntensity.strong" });
    fireEvent.click(strongButton);

    expect(strongButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "styleIntensity.medium" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });
});
