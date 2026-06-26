import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CreditChart from "@/components/dashboard/CreditChart";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    if (values) return `${namespace}.${key}:${JSON.stringify(values)}`;
    return `${namespace}.${key}`;
  },
  useLocale: () => "en",
}));

const zeroSeries = Array.from({ length: 7 }, (_, index) => ({
  date: `2026-06-${String(index + 1).padStart(2, "0")}`,
  used: 0,
  remaining: 100,
}));

const usageSeries = zeroSeries.map((point, index) =>
  index === 6 ? { ...point, used: 12 } : point
);

describe("CreditChart", () => {
  it("shows helpful empty state when all usage is zero", () => {
    render(
      <CreditChart
        data={zeroSeries}
        range="7"
        onRangeChange={vi.fn()}
      />
    );

    expect(screen.getByText("dashboard.creditChart.noData")).toBeInTheDocument();
    expect(screen.getByText("dashboard.creditChart.noDataHint")).toBeInTheDocument();
  });

  it("renders chart when usage exists", () => {
    render(
      <CreditChart
        data={usageSeries}
        range="7"
        onRangeChange={vi.fn()}
      />
    );

    expect(screen.queryByText("dashboard.creditChart.noDataHint")).not.toBeInTheDocument();
  });

  it("requests a new range from the parent when toggled", () => {
    const onRangeChange = vi.fn();

    render(
      <CreditChart
        data={usageSeries}
        range="7"
        onRangeChange={onRangeChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /30D/i }));

    expect(onRangeChange).toHaveBeenCalledWith("30");
  });
});
