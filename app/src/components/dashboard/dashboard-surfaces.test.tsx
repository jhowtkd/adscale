import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CreditPanel from "@/components/dashboard/CreditPanel";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    if (values) return `${namespace}.${key}:${JSON.stringify(values)}`;
    return `${namespace}.${key}`;
  },
  useLocale: () => "en",
}));

describe("dashboard secondary surfaces", () => {
  it("CreditPanel exposes non-color low balance signal", () => {
    render(<CreditPanel remaining={10} total={100} planKey="starter" />);

    expect(screen.getByText("dashboard.creditsPanel.lowBalance")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "dashboard.creditsPanel.title" })).toBeInTheDocument();
  });
});
