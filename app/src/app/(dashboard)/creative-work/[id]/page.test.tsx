import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  requireWorkspaceAccess: vi.fn(),
  getCreativeWork: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (href: string) => mocks.redirect(href),
  notFound: () => mocks.notFound(),
}));
vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: (...args: unknown[]) => mocks.requireWorkspaceAccess(...args),
}));
vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: (...args: unknown[]) => mocks.getCreativeWork(...args),
}));
vi.mock("@/components/creative-work/CreativeWorkResumeSurface", () => ({
  CreativeWorkResumeSurface: (props: { workId: string }) => (
    <section data-testid="resume-surface">surface:{props.workId}</section>
  ),
}));

import CreativeWorkPage from "./page";

function aggregate(toolKind: string) {
  return {
    work: { id: "work-1", toolKind },
    outputs: [],
    sources: [],
    preparedPlan: null,
    carouselSlides: [],
  };
}

describe("creative work resume route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects Peça única into the contained box keeping the work id", async () => {
    mocks.requireWorkspaceAccess.mockResolvedValue({ workspace: { id: "ws-1" } });
    mocks.getCreativeWork.mockResolvedValue(aggregate("single"));

    await expect(CreativeWorkPage({ params: Promise.resolve({ id: "work-1" }) }))
      .rejects.toThrow("redirect:/?workId=work-1&compose=1");
    expect(mocks.getCreativeWork).toHaveBeenCalledWith("ws-1", "work-1");
  });

  it("keeps other intents on the existing resume surface", async () => {
    mocks.requireWorkspaceAccess.mockResolvedValue({ workspace: { id: "ws-1" } });
    mocks.getCreativeWork.mockResolvedValue(aggregate("variations"));

    const result = await CreativeWorkPage({ params: Promise.resolve({ id: "work-1" }) });
    expect(mocks.redirect).not.toHaveBeenCalled();
    // The page returns the surface element with the requested work id.
    expect(result).toMatchObject({ props: { workId: "work-1" } });
  });

  it("answers notFound for a work outside the workspace", async () => {
    mocks.requireWorkspaceAccess.mockResolvedValue({ workspace: { id: "ws-1" } });
    mocks.getCreativeWork.mockResolvedValue(null);

    await expect(CreativeWorkPage({ params: Promise.resolve({ id: "missing" }) }))
      .rejects.toThrow("notFound");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
