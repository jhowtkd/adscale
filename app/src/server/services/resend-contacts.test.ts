import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: {
    RESEND_API_KEY: "re_live_test",
    RESEND_WAITLIST_SEGMENT_ID: "seg_test",
  },
}));

import { syncWaitlistContact } from "./resend-contacts";

describe("syncWaitlistContact", () => {
  beforeEach(() => {
    process.env.RESEND_WAITLIST_SEGMENT_ID = "seg_test";
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates contact in segment", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "contact_1" }),
    });

    const id = await syncWaitlistContact({
      email: "a@b.com",
      name: "Ana Silva",
      sector: "saas",
      whatsapp: "5511999999999",
    });

    expect(id).toBe("contact_1");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.resend.com/contacts",
      expect.objectContaining({ method: "POST" })
    );
  });
});
