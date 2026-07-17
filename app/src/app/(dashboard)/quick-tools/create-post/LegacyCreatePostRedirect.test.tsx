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
  it("routes a bare legacy entry to the variations preset", () => {
    expect(legacyCreatePostDestination({})).toBe("/?intent=variations");
  });

  it("routes an existing work directly to the operational home", () => {
    expect(legacyCreatePostDestination({ workId: WORK_ID })).toBe(
      `/?workId=${WORK_ID}`
    );
  });

  it("drops non-UUID work identifiers", () => {
    expect(legacyCreatePostDestination({ workId: "../../other-workspace" })).toBe(
      "/?intent=variations"
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
    ).toBe("/?intent=single");
    expect(legacyCreatePostDestination({ intent: "unknown" })).toBe(
      "/?intent=variations"
    );
  });

  it("preserves only a UUID template for an empty composer", () => {
    expect(
      legacyCreatePostDestination({ templateId: TEMPLATE_ID, q: "drop-me" })
    ).toBe(`/?intent=variations&compose=1&templateId=${TEMPLATE_ID}`);
    expect(
      legacyCreatePostDestination({ templateId: "../../other-workspace" })
    ).toBe("/?intent=variations");
  });

  it("lets workId take precedence over template and intent", () => {
    expect(
      legacyCreatePostDestination({
        workId: WORK_ID,
        templateId: TEMPLATE_ID,
        intent: "single",
      })
    ).toBe(`/?workId=${WORK_ID}`);
  });

  it("uses the Next redirect primitive", () => {
    expect(() =>
      LegacyCreatePostRedirect({ searchParams: { workId: WORK_ID } })
    ).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith(`/?workId=${WORK_ID}`);
  });
});
