import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AccountStatusBadge from "./AccountStatusBadge";

vi.mock("next-intl", () => ({
  useTranslations: vi.fn((namespace: string) => (key: string) => `${namespace}.${key}`),
}));

describe("AccountStatusBadge", () => {
  it("renders tester badge with accessible label", () => {
    render(<AccountStatusBadge variant="tester" />);

    expect(screen.getByLabelText("testerMode.badgeAriaLabel")).toHaveTextContent("testerMode.badge");
  });

  it("renders demo badge", () => {
    render(<AccountStatusBadge variant="demo" />);

    expect(screen.getByLabelText("demoMode.badgeAriaLabel")).toHaveTextContent("demoMode.badge");
  });
});
