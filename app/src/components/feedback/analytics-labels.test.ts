import { describe, it, expect, vi } from "vitest";
import { formatFallbackKey } from "./analytics-labels";

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const handler = (key: string) => key;
    handler.has = () => false;
    return handler;
  },
}));

import { useAnalyticsLabels } from "./analytics-labels";
import { renderHook } from "@testing-library/react";

describe("analytics-labels", () => {
  it("formats unknown keys as title case", () => {
    expect(formatFallbackKey("strategy_recipe")).toBe("Strategy Recipe");
    expect(formatFallbackKey("productOffer")).toBe("ProductOffer");
  });

  it("exposes label helpers from the hook", () => {
    const { result } = renderHook(() => useAnalyticsLabels());
    expect(result.current.missionLabel("unknown_key")).toBe("Unknown Key");
    expect(result.current.stageLabel("preview")).toBe("Preview");
  });
});
