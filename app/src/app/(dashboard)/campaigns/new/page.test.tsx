import { describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import NewCampaignPage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

describe("NewCampaignPage", () => {
  it("redirects the legacy route directly to the focused home composer", () => {
    expect(() => NewCampaignPage()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/?compose=1");
  });
});
