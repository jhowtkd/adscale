import { describe, it, expect } from "vitest";
import { sanitizeDiagnosticContext } from "./sanitize";

describe("sanitizeDiagnosticContext", () => {
  it("removes sensitive keys", () => {
    const result = sanitizeDiagnosticContext({
      route: "/campaigns/1",
      authToken: "secret-value",
      prompt: "full creative prompt text",
      breadcrumbs: [{ type: "navigation", path: "/home" }],
    });

    expect(result.route).toBe("/campaigns/1");
    expect(result.authToken).toBeUndefined();
    expect(result.prompt).toBeUndefined();
    expect(result.breadcrumbs).toEqual([{ type: "navigation", path: "/home" }]);
  });

  it("truncates long strings", () => {
    const long = "a".repeat(600);
    const result = sanitizeDiagnosticContext({ note: long });
    expect(String(result.note)).toHaveLength(501);
  });

  it("caps diagnostic payload size", () => {
    const hugeBreadcrumbs = Array.from({ length: 100 }, (_, index) => ({
      type: "fetch",
      detail: "x".repeat(800),
      index,
    }));

    const json = JSON.stringify(
      sanitizeDiagnosticContext({ breadcrumbs: hugeBreadcrumbs })
    );
    expect(json.length).toBeLessThanOrEqual(32 * 1024);
  });
});
