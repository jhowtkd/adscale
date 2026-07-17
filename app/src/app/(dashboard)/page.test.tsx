import { describe, expect, it } from "vitest";
import { parseDashboardSearchParams } from "./page";

const TEMPLATE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("parseDashboardSearchParams", () => {
  it.each(["variations", "single", "format_adaptation", "restyle"] as const)(
    "accepts the %s composer intent",
    (intent) => {
      expect(parseDashboardSearchParams({ intent })).toMatchObject({
        initialIntent: intent,
      });
    }
  );

  it("accepts only explicit compose and UUID template inputs", () => {
    expect(
      parseDashboardSearchParams({ compose: "1", templateId: TEMPLATE_ID })
    ).toMatchObject({ focusComposer: true, templateId: TEMPLATE_ID });
    expect(
      parseDashboardSearchParams({
        compose: "true",
        templateId: "../../other-workspace",
        intent: "social_post",
      })
    ).toEqual({});
  });

  it("keeps a safe template on reload with workId so attachment can replay idempotently", () => {
    expect(
      parseDashboardSearchParams({ workId: "work-1", templateId: TEMPLATE_ID })
    ).toEqual({ workId: "work-1", templateId: TEMPLATE_ID });
  });
});
