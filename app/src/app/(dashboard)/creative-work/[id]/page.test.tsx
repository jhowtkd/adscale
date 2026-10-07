import { beforeEach, describe, expect, it, vi } from "vitest";

const WORK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const mockRequireWorkspaceAccess = vi.fn(async () => ({
  user: { id: "user-1", emailVerified: true },
  workspace: { id: "ws-1" },
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: () => mockRequireWorkspaceAccess(),
}));
vi.mock("@/server/validation/env", () => ({
  env: new Proxy({}, {
    get(_target, key: string) {
      if (key === "STUDIO_PROGRESSIVE_ROLLOUT_PERCENT") return 0;
      if (key === "STUDIO_CAROUSEL_ROLLOUT_PERCENT") return 100;
      if (key === "STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT") return 0;
      if (key === "CREATIVE_WORK_34_CREATION_ENABLED") return "true";
      return undefined;
    },
  }),
}));
vi.mock("@/components/dashboard/DashboardHomeActions", () => ({
  default: function DashboardHomeActionsStub() { return null; },
}));
vi.mock("@/components/creative-work/CreativeWorkResumeSurface", () => ({
  CreativeWorkResumeSurface: function CreativeWorkResumeSurfaceStub() { return null; },
}));

type PageElement = { type: unknown; props: Record<string, unknown> };

async function renderPage(id: string, query: Record<string, string | string[] | undefined> = {}) {
  const { default: CreativeWorkPage } = await import("./page");
  return (await CreativeWorkPage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(query),
  })) as unknown as PageElement;
}

const nameOf = (element: PageElement) => (element.type as { name?: string }).name;

describe("CreativeWorkPage (spec 2026-10-07 §2)", () => {
  beforeEach(() => mockRequireWorkspaceAccess.mockClear());

  it("opens the Studio stage for a new work, with the home's rollout gates and the composer query", async () => {
    const element = await renderPage("new", { mode: "arte", compose: "1", fresh: "1", workId: WORK_ID });

    expect(nameOf(element)).toBe("DashboardHomeActionsStub");
    expect(element.props).toMatchObject({
      workspaceId: "ws-1",
      workId: WORK_ID,
      studioMode: "arte",
      initialIntent: "variations",
      focusComposer: true,
      freshEntry: true,
      rolloutVariant: "control",
      carouselCreationEnabled: true,
      entryInterviewEnabled: false,
      threeFourCreationEnabled: true,
    });
    expect(mockRequireWorkspaceAccess).toHaveBeenCalledTimes(1);
  });

  it("keeps the piece page for an existing work, without reading the workspace", async () => {
    const element = await renderPage(WORK_ID);

    expect(nameOf(element)).toBe("CreativeWorkResumeSurfaceStub");
    expect(element.props).toEqual({ workId: WORK_ID, threeFourCreationEnabled: true });
    expect(mockRequireWorkspaceAccess).not.toHaveBeenCalled();
  });
});
