import { describe, expect, it } from "vitest";
import { parseDashboardSearchParams } from "./dashboard-search-params";

const UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("parseDashboardSearchParams", () => {
  it("parses the carousel objective from the URL", () => {
    expect(parseDashboardSearchParams({ intent: "carousel" })).toEqual({
      initialIntent: "carousel",
    });
  });

  it("keeps the four legacy objectives parseable", () => {
    for (const intent of ["variations", "single", "format_adaptation", "restyle"] as const) {
      expect(parseDashboardSearchParams({ intent })).toEqual({ initialIntent: intent });
    }
  });

  it("drops unknown intents so a plain entry has no protocol", () => {
    expect(parseDashboardSearchParams({ intent: "social_post" })).toEqual({});
    expect(parseDashboardSearchParams({ intent: "drop-table" })).toEqual({});
  });

  it("maps the legacy studio modes onto their explicit adapters", () => {
    expect(parseDashboardSearchParams({ mode: "arte" })).toEqual({
      initialIntent: "variations",
      studioMode: "arte",
    });
    expect(parseDashboardSearchParams({ mode: "briefing" })).toEqual({
      initialIntent: "single",
      studioMode: "briefing",
    });
  });

  it("accepts a carousel objective together with a resumable work id", () => {
    expect(parseDashboardSearchParams({ workId: UUID, intent: "carousel" })).toEqual({
      workId: UUID,
      initialIntent: "carousel",
    });
  });

  it("validates work, template and campaign identifiers as UUIDs", () => {
    expect(parseDashboardSearchParams({ workId: "not-a-uuid" })).toEqual({});
    expect(parseDashboardSearchParams({ workId: UUID })).toEqual({ workId: UUID });
    expect(parseDashboardSearchParams({ templateId: UUID, intent: "carousel" })).toEqual({
      templateId: UUID,
      initialIntent: "carousel",
    });
    expect(parseDashboardSearchParams({ templateId: "nope" })).toEqual({});
    expect(parseDashboardSearchParams({ campaignId: UUID })).toEqual({ campaignId: UUID });
    expect(parseDashboardSearchParams({ campaignId: "nope" })).toEqual({});
  });

  it("keeps the fresh and compose flags", () => {
    expect(parseDashboardSearchParams({ fresh: "1", compose: "1" })).toEqual({
      freshEntry: true,
      focusComposer: true,
    });
    expect(parseDashboardSearchParams({ fresh: "0", compose: "0" })).toEqual({});
  });
});
