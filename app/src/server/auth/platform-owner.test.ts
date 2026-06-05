import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isPlatformOwnerEmail } from "./platform-owner";

describe("isPlatformOwnerEmail", () => {
  const original = process.env.PLATFORM_OWNER_EMAILS;

  beforeEach(() => {
    process.env.PLATFORM_OWNER_EMAILS = "owner@example.com,admin@example.com";
  });

  afterEach(() => {
    process.env.PLATFORM_OWNER_EMAILS = original;
  });

  it("matches configured owner emails case-insensitively", () => {
    expect(isPlatformOwnerEmail("Owner@Example.com")).toBe(true);
    expect(isPlatformOwnerEmail("other@example.com")).toBe(false);
  });
});
