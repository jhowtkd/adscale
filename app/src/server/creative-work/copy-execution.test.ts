import { describe, expect, it } from "vitest";
import { independentCopyInputRevision } from "./copy-execution";

const work = { clientProfileId: "brand", toolKind: "single", format: "4:5", request: "Pedido", settings: { targetFormats: [] },
  brief: { theme: "Tema", objective: "Divulgar", audience: "Público" }, inputSnapshot: null, copy: null } as const;

describe("independent copy content revision", () => {
  it("ignores clocks, operational state, title and learned approvals", () => {
    const before = { ...work, updatedAt: new Date(0), status: "draft", title: "Antes", preparedGuidance: null };
    const after = { ...work, updatedAt: new Date(1000), status: "ready", title: "Depois", preparedGuidance: { changed: true } };
    expect(independentCopyInputRevision(after as never)).toBe(independentCopyInputRevision(before as never));
  });
  it.each([
    { request: "Outro pedido" }, { clientProfileId: "other-brand" }, { toolKind: "social_post" }, { format: "9:16" },
    { settings: { targetFormats: ["9:16"] } }, { brief: { ...work.brief, theme: "Outro tema" } },
    { inputSnapshot: { factPack: { request: "Novos fatos" } } },
    { copy: { headline: "Texto manual", body: "Corpo", cta: "CTA" } },
  ])("detects a material change %j", patch => {
    expect(independentCopyInputRevision({ ...work, ...patch } as never)).not.toBe(independentCopyInputRevision(work as never));
  });
});
