import { describe, expect, it } from "vitest";
import { COMPOSER_PATH, composerHref, legacyComposerHref } from "./composer-href";

const WORK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GUEST_ID = "dd111111-1111-4111-8111-111111111111";

describe("composerHref", () => {
  it("is the composer page when there is no query", () => {
    expect(COMPOSER_PATH).toBe("/creative-work/new");
    expect(composerHref()).toBe("/creative-work/new");
  });

  it("keeps the order it was given and leaves empty values out", () => {
    expect(composerHref({ mode: "arte", compose: "1", fresh: "1" }))
      .toBe("/creative-work/new?mode=arte&compose=1&fresh=1");
    expect(composerHref({ compose: "1", intent: null, templateId: undefined, campaignId: "" }))
      .toBe("/creative-work/new?compose=1");
  });

  it("encodes the values instead of trusting them", () => {
    expect(composerHref({ workId: "a b&c" })).toBe("/creative-work/new?workId=a+b%26c");
  });
});

describe("legacyComposerHref", () => {
  it("moves an old composer link at / to the composer, with the same query in the same order", () => {
    expect(legacyComposerHref({ mode: "arte", compose: "1", fresh: "1" }))
      .toBe("/creative-work/new?mode=arte&compose=1&fresh=1");
    expect(legacyComposerHref({ workId: WORK_ID, intent: "variations" }))
      .toBe(`/creative-work/new?workId=${WORK_ID}&intent=variations`);
  });

  it("leaves the conversation's and the invite's own query at /", () => {
    expect(legacyComposerHref({})).toBeNull();
    expect(legacyComposerHref({ suggestion: "Montar o calendário do mês" })).toBeNull();
    expect(legacyComposerHref({ workspaceId: WORK_ID })).toBeNull();
  });

  it("filters unknown, blank and repeated values from a legacy Record", () => {
    expect(legacyComposerHref({ compose: "1", utm_source: "ig", blank: "", workId: ["A", "B"] }))
      .toBe("/creative-work/new?compose=1");
    expect(legacyComposerHref({ workId: "  " })).toBeNull();
    expect(legacyComposerHref({ campaignId: [WORK_ID, WORK_ID] })).toBeNull();
    expect(legacyComposerHref({ compose: "", intent: "  ", mode: undefined })).toBeNull();
    expect(legacyComposerHref({ compose: "1", suggestion: "hello", workspaceId: "ws" }))
      .toBe("/creative-work/new?compose=1");
  });

  it("keeps the guest handoff at / until the guest flow is removed (spec §4)", () => {
    expect(legacyComposerHref({ compose: "1", fresh: "1", intent: "single", guestDraft: GUEST_ID })).toBeNull();
  });
});
