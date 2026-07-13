import { describe, expect, it, vi } from "vitest";
import { buildCampaignsV6Labels } from "./build-campaigns-v6-labels";

describe("buildCampaignsV6Labels", () => {
  it("passes count into worksTitle (avoids IntlError FORMATTING_ERROR)", () => {
    const t = Object.assign(
      vi.fn((key: string, values?: { count?: number }) => {
        if (key === "v6.worksTitle") return `${values?.count ?? "MISSING"} trabalhos`;
        if (key === "v6.sectionWorks") return "Trabalhos";
        if (key === "v6.versionBadge") return "v1";
        if (key === "v6.worksSubtitle") return "sub";
        if (key === "new") return "Nova";
        return key;
      }),
      { has: () => true }
    );
    const tc = Object.assign(vi.fn((key: string) => key), { has: () => true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const labels = buildCampaignsV6Labels(t as any, tc as any);
    expect(labels.formatTitle(12)).toBe("12 trabalhos");
    expect(t).toHaveBeenCalledWith("v6.worksTitle", { count: 12 });
  });
});
