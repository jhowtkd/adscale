import { describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import NewCampaignPage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

describe("NewCampaignPage", () => {
  it("redirects the legacy route to the focused composer (spec 2026-10-07 §2)", () => {
    expect(() => NewCampaignPage()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/creative-work/new?compose=1");
  });
});
