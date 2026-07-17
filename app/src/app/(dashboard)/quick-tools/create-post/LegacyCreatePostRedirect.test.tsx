import { describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import LegacyCreatePostRedirect, {
  legacyCreatePostDestination,
} from "./LegacyCreatePostRedirect";

const TEMPLATE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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
    expect(legacyCreatePostDestination({ workId: "work-1" })).toBe(
      "/?workId=work-1"
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
        workId: "work-1",
        templateId: TEMPLATE_ID,
        intent: "single",
      })
    ).toBe("/?workId=work-1");
  });

  it("uses the Next redirect primitive", () => {
    expect(() =>
      LegacyCreatePostRedirect({ searchParams: { workId: "work-2" } })
    ).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/?workId=work-2");
  });
});
