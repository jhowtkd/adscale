import { describe, expect, it } from "vitest";
import { hasStudioResumeQuery } from "./studio-resume-query";

const UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("hasStudioResumeQuery", () => {
  it("is true for workId, compose, intent, mode, fresh, templateId, and campaignId", () => {
    expect(hasStudioResumeQuery(new URLSearchParams("workId=not-validated"))).toBe(true);
    expect(hasStudioResumeQuery(new URLSearchParams("compose=1"))).toBe(true);
    expect(hasStudioResumeQuery(new URLSearchParams("intent=single"))).toBe(true);
    expect(hasStudioResumeQuery(new URLSearchParams("mode=arte"))).toBe(true);
    expect(hasStudioResumeQuery(new URLSearchParams("fresh=1"))).toBe(true);
    expect(hasStudioResumeQuery(new URLSearchParams(`templateId=${UUID}`))).toBe(true);
    expect(hasStudioResumeQuery(new URLSearchParams(`campaignId=${UUID}`))).toBe(true);
  });

  it("is false for empty search, empty values, and marketing UTMs", () => {
    expect(hasStudioResumeQuery(new URLSearchParams(""))).toBe(false);
    expect(hasStudioResumeQuery(new URLSearchParams("workId="))).toBe(false);
    expect(hasStudioResumeQuery(new URLSearchParams("utm_source=ig"))).toBe(false);
  });

  it("recognizes only well-formed guestDraft UUIDs (#442)", () => {
    expect(hasStudioResumeQuery(new URLSearchParams(`guestDraft=${UUID}`))).toBe(true);
    expect(hasStudioResumeQuery(new URLSearchParams("guestDraft=../../etc"))).toBe(false);
    expect(hasStudioResumeQuery(new URLSearchParams("guestDraft="))).toBe(false);
    expect(hasStudioResumeQuery(new URLSearchParams("guestDraft=not-a-uuid&utm_source=ig"))).toBe(false);
  });
});
