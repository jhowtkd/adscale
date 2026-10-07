import { AUTH_ERROR_CODES, WorkspaceAuthError } from "@/server/auth/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const WORK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const mockRequireWorkspaceAccess = vi.fn(async () => ({
  user: { id: "user-1", emailVerified: true },
  workspace: { id: "ws-1" },
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: () => mockRequireWorkspaceAccess(),
  isWorkspaceAuthError: (error: unknown) => error instanceof WorkspaceAuthError,
  AUTH_ERROR_CODES,
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

const redirectMock = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); });
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url) }));

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
  beforeEach(() => {
    mockRequireWorkspaceAccess.mockClear();
    redirectMock.mockClear();
  });

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

  it("redirects an invalid session to login with the filtered relative composer destination", async () => {
    mockRequireWorkspaceAccess.mockRejectedValueOnce(new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized"));
    await expect(renderPage("new", { compose: "1", workId: WORK_ID, intent: "variations", unknown: "x", _rsc: "internal" })).rejects.toThrow("REDIRECT:");
    expect(redirectMock).toHaveBeenCalledWith(`/login?${new URLSearchParams({ callbackUrl: `/creative-work/new?compose=1&workId=${WORK_ID}&intent=variations` })}`);
  });

  it("uses the new entry when query contains only unknown, blank or array values", async () => {
    mockRequireWorkspaceAccess.mockRejectedValueOnce(new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized"));
    await expect(renderPage("new", { compose: "", workId: [WORK_ID, "B"], unknown: "x" })).rejects.toThrow("REDIRECT:");
    expect(redirectMock).toHaveBeenCalledWith(`/login?${new URLSearchParams({ callbackUrl: "/creative-work/new" })}`);
  });

  it.each([AUTH_ERROR_CODES.noWorkspace, AUTH_ERROR_CODES.forbidden])("does not mask %s as login", async (code) => {
    const error = new WorkspaceAuthError(code, code);
    mockRequireWorkspaceAccess.mockRejectedValueOnce(error);
    await expect(renderPage("new")).rejects.toBe(error);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("keeps the piece page for an existing work, without reading the workspace", async () => {
    const element = await renderPage(WORK_ID);

    expect(nameOf(element)).toBe("CreativeWorkResumeSurfaceStub");
    expect(element.props).toEqual({ workId: WORK_ID, threeFourCreationEnabled: true });
    expect(mockRequireWorkspaceAccess).not.toHaveBeenCalled();
  });
});
