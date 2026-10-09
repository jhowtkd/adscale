import { describe, expect, it, vi } from "vitest";
import en from "../../../../messages/en.json";
import ptBR from "../../../../messages/pt-BR.json";
import { buildCampaignsV6Labels } from "./build-campaigns-v6-labels";

type Messages = Record<string, unknown>;

/** A translator over a real namespace of the messages file: like next-intl, a missing key is an error, not a fallback. */
function translatorOver(namespace: Messages, name: string) {
  const find = (key: string) =>
    key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Messages)[part] : undefined), namespace);
  return Object.assign(
    (key: string) => {
      const value = find(key);
      if (typeof value !== "string") throw new Error(`MISSING_MESSAGE: ${name}.${key}`);
      return value;
    },
    { has: (key: string) => typeof find(key) === "string" },
  );
}

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

  // The page reads the builder with `campaign` and `common`; a key the builder reads that is not in the messages is
  // a console error (MISSING_MESSAGE) on every load of Criações.
  it.each([["pt-BR", ptBR], ["en", en]] as const)("reads only keys that exist in %s", (_locale, messages) => {
    const t = translatorOver(messages.campaign as Messages, "campaign");
    const tc = translatorOver(messages.common as Messages, "common");
    const labels = buildCampaignsV6Labels(t as never, tc as never);
    expect(labels.newWork).toBeTruthy();
    expect(labels.formatTitle(3)).toBeTruthy();
    expect(labels.selectCampaign("X")).toBeTruthy();
    expect(labels.actionsFor("X")).toBeTruthy();
    expect(labels.formatProtocol?.(null)).toBeTruthy();
    expect(labels.formatNextAction?.(null)).toBeTruthy();
  });
});
