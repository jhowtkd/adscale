import { describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import LegacyCreatePostRedirect, {
  legacyCreatePostDestination,
} from "./LegacyCreatePostRedirect";

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

  it("uses the Next redirect primitive", () => {
    expect(() =>
      LegacyCreatePostRedirect({ searchParams: { workId: "work-2" } })
    ).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/?workId=work-2");
  });
});
