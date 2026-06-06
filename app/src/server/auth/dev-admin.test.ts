import { afterEach, describe, expect, it } from "vitest";

import { isDevAdminEmail, parseDevAdminEmails } from "./dev-admin";

describe("dev-admin", () => {
  afterEach(() => {
    delete process.env.DEV_ADMIN_EMAIL;
  });

  it("parses comma-separated dev admin emails", () => {
    process.env.DEV_ADMIN_EMAIL = "Admin@Example.com, dev@adscale.local";
    expect(parseDevAdminEmails()).toEqual(
      new Set(["admin@example.com", "dev@adscale.local"])
    );
  });

  it("matches dev admin emails case-insensitively", () => {
    process.env.DEV_ADMIN_EMAIL = "dev@adscale.local";
    expect(isDevAdminEmail("Dev@AdScale.local")).toBe(true);
    expect(isDevAdminEmail("other@example.com")).toBe(false);
  });

  it("returns false when DEV_ADMIN_EMAIL is unset", () => {
    expect(isDevAdminEmail("dev@adscale.local")).toBe(false);
  });
});
