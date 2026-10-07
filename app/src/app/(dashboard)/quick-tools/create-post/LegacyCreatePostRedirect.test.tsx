import { describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import LegacyCreatePostRedirect, {
  legacyCreatePostDestination,
} from "./LegacyCreatePostRedirect";

const TEMPLATE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

describe("LegacyCreatePostRedirect", () => {
  it("routes a bare legacy entry to the variations preset of the composer", () => {
    expect(legacyCreatePostDestination({})).toBe("/creative-work/new?intent=variations");
  });

  it("routes an existing work to the composer with it open", () => {
    expect(legacyCreatePostDestination({ workId: WORK_ID })).toBe(
      `/creative-work/new?workId=${WORK_ID}`
    );
  });

  it("drops non-UUID work identifiers", () => {
    expect(legacyCreatePostDestination({ workId: "../../other-workspace" })).toBe(
      "/creative-work/new?intent=variations"
    );
  });

  it("keeps only a valid composer intent and drops unsafe query parameters", () => {
    expect(
      legacyCreatePostDestination({
        intent: "single",
        callbackUrl: "https://evil.example",
        q: "campaign search",
        templateId: "legacy-template",
      })
    ).toBe("/creative-work/new?intent=single");
    expect(legacyCreatePostDestination({ intent: "unknown" })).toBe(
      "/creative-work/new?intent=variations"
    );
  });

  it("preserves only a UUID template for an empty composer", () => {
    expect(
      legacyCreatePostDestination({ templateId: TEMPLATE_ID, q: "drop-me" })
    ).toBe(`/creative-work/new?intent=variations&compose=1&templateId=${TEMPLATE_ID}`);
    expect(
      legacyCreatePostDestination({ templateId: "../../other-workspace" })
    ).toBe("/creative-work/new?intent=variations");
  });

  it("lets workId take precedence over template and intent", () => {
    expect(
      legacyCreatePostDestination({
        workId: WORK_ID,
        templateId: TEMPLATE_ID,
        intent: "single",
      })
    ).toBe(`/creative-work/new?workId=${WORK_ID}`);
  });

  it("uses the Next redirect primitive", () => {
    expect(() =>
      LegacyCreatePostRedirect({ searchParams: { workId: WORK_ID } })
    ).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith(`/creative-work/new?workId=${WORK_ID}`);
  });
});
