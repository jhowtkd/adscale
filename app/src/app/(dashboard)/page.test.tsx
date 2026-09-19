import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_ERROR_CODES, WorkspaceAuthError } from "@/server/auth/errors";
import { parseDashboardSearchParams } from "./dashboard-search-params";

const TEMPLATE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAMPAIGN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const GUEST_ID = "dd111111-1111-4111-8111-111111111111";

const mockRequireWorkspaceAccess = vi.fn(async () => ({
  user: { id: "user-1" },
  workspace: { id: "ws-e2e-1" },
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: (...args: unknown[]) => mockRequireWorkspaceAccess(...args),
}));
vi.mock("@/server/validation/env", () => ({
  env: new Proxy({}, {
    get(_target, key: string) {
      if (key === "STUDIO_PROGRESSIVE_ROLLOUT_PERCENT") return Number(process.env.STUDIO_PROGRESSIVE_ROLLOUT_PERCENT ?? 0);
      if (key === "STUDIO_CAROUSEL_ROLLOUT_PERCENT") return Number(process.env.STUDIO_CAROUSEL_ROLLOUT_PERCENT ?? 0);
      if (key === "STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT") return Number(process.env.STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT ?? 0);
      return undefined;
    },
  }),
}));
vi.mock("@/components/dashboard/DashboardHomeActions", () => ({
  default: function DashboardHomeActionsStub() { return null; },
}));
vi.mock("@/components/guest-home/GuestStudioEntry", () => ({
  default: function GuestStudioEntryStub() { return null; },
}));

type PageElement = { type: unknown; props: Record<string, unknown> };

async function renderDashboardPage(
  params: Record<string, string | string[] | undefined> = {},
): Promise<PageElement> {
  const { default: DashboardPage } = await import("./page");
  return (await DashboardPage({ searchParams: Promise.resolve(params) })) as unknown as PageElement;
}

function renderedName(element: PageElement): string {
  const type = element.type as { name?: string; render?: { name?: string } };
  return type.name ?? type.render?.name ?? "unknown";
}

describe("DashboardPage entry interview rollout gate", () => {
  it("hides the entry interview at percent zero and enables it at one hundred", async () => {
    process.env.STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT = "0";
    const zero = await renderDashboardPage();
    expect(zero.props).toMatchObject({ entryInterviewEnabled: false });

    process.env.STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT = "100";
    const full = await renderDashboardPage();
    expect(full.props).toMatchObject({ entryInterviewEnabled: true });
  });
});

describe("DashboardPage carousel rollout gate", () => {
  it("hides new carousel creation at percent zero and enables it at one hundred", async () => {
    process.env.STUDIO_CAROUSEL_ROLLOUT_PERCENT = "0";
    const zero = await renderDashboardPage();
    expect(zero.props).toMatchObject({ carouselCreationEnabled: false });

    process.env.STUDIO_CAROUSEL_ROLLOUT_PERCENT = "100";
    const full = await renderDashboardPage();
    expect(full.props).toMatchObject({ carouselCreationEnabled: true });
  });

  it("sends only a boolean gate to the client, never the environment value", async () => {
    process.env.STUDIO_CAROUSEL_ROLLOUT_PERCENT = "37";
    const element = await renderDashboardPage();
    expect(typeof element.props.carouselCreationEnabled).toBe("boolean");
    expect(Object.values(element.props)).not.toContain(37);
    expect(JSON.stringify(element.props)).not.toContain("STUDIO_CAROUSEL_ROLLOUT_PERCENT");
    expect(JSON.stringify(element.props)).not.toContain("37");
  });
});

describe("parseDashboardSearchParams", () => {
  it.each(["variations", "single", "format_adaptation", "restyle"] as const)(
    "accepts the %s composer intent",
    (intent) => {
      expect(parseDashboardSearchParams({ intent })).toMatchObject({
        initialIntent: intent,
      });
    }
  );

  it("accepts only explicit compose and UUID template inputs", () => {
    expect(
      parseDashboardSearchParams({ compose: "1", templateId: TEMPLATE_ID })
    ).toMatchObject({ focusComposer: true, templateId: TEMPLATE_ID });
    expect(
      parseDashboardSearchParams({
        compose: "true",
        templateId: "../../other-workspace",
        intent: "social_post",
      })
    ).toEqual({});
  });

  it("keeps a safe template on reload with workId so attachment can replay idempotently", () => {
    expect(
      parseDashboardSearchParams({ workId: WORK_ID, templateId: TEMPLATE_ID })
    ).toEqual({ workId: WORK_ID, templateId: TEMPLATE_ID });
  });

  it("accepts only UUID work identifiers", () => {
    expect(parseDashboardSearchParams({ workId: WORK_ID })).toEqual({ workId: WORK_ID });
    expect(parseDashboardSearchParams({ workId: "../../other-workspace" })).toEqual({});
  });

  it("uses briefing mode only when an explicit intent is absent", () => {
    expect(parseDashboardSearchParams({ mode: "briefing" })).toMatchObject({
      studioMode: "briefing",
      initialIntent: "single",
    });
    expect(parseDashboardSearchParams({ mode: "arte" })).toMatchObject({
      studioMode: "arte",
      initialIntent: "variations",
    });
    expect(parseDashboardSearchParams({ mode: "briefing", intent: "restyle" })).toMatchObject({
      studioMode: "briefing",
      initialIntent: "restyle",
    });
  });

  it("accepts the explicit fresh Studio entry without broadening other query inputs", () => {
    expect(parseDashboardSearchParams({ intent: "variations", fresh: "1" })).toMatchObject({
      initialIntent: "variations",
      freshEntry: true,
    });
    expect(parseDashboardSearchParams({ fresh: "true" })).toEqual({});
  });

  it("keeps only a scalar UUID campaign context", () => {
    expect(parseDashboardSearchParams({ campaignId: CAMPAIGN_ID })).toEqual({ campaignId: CAMPAIGN_ID });
    expect(parseDashboardSearchParams({ campaignId: [CAMPAIGN_ID] })).toEqual({});
    expect(parseDashboardSearchParams({ campaignId: "../campaign" })).toEqual({});
  });

  it("ignores the guest handoff key without broadening other inputs", () => {
    expect(parseDashboardSearchParams({ guestDraft: GUEST_ID })).toEqual({});
    expect(parseDashboardSearchParams({ guestDraft: GUEST_ID, workId: WORK_ID })).toEqual({
      workId: WORK_ID,
    });
  });
});

describe("DashboardPage guest entry switch", () => {
  beforeEach(() => {
    mockRequireWorkspaceAccess.mockReset();
    mockRequireWorkspaceAccess.mockResolvedValue({
      user: { id: "user-1" },
      workspace: { id: "ws-e2e-1" },
    });
    delete process.env.PUBLIC_STUDIO_HOME_ENABLED;
    delete process.env.PUBLIC_STUDIO_IMPORT_ENABLED;
    delete process.env.PUBLIC_STUDIO_ATTACHMENTS_ENABLED;
  });

  it("renders the guest entry for an isolated public draft", async () => {
    process.env.PUBLIC_STUDIO_IMPORT_ENABLED = "true";
    const element = await renderDashboardPage({ guestDraft: GUEST_ID, compose: "1" });
    expect(renderedName(element)).toBe("GuestStudioEntryStub");
    expect(element.props).toMatchObject({
      guestDraftId: GUEST_ID,
      userId: "user-1",
      workspaceId: "ws-e2e-1",
      importEnabled: true,
      conflict: null,
    });
  });

  it("passes the import flag through to the entry", async () => {
    const element = await renderDashboardPage({ guestDraft: GUEST_ID });
    expect(renderedName(element)).toBe("GuestStudioEntryStub");
    expect(element.props).toMatchObject({ importEnabled: false });
  });

  it("renders the entry in conflict mode over an open work item", async () => {
    const element = await renderDashboardPage({ guestDraft: GUEST_ID, workId: WORK_ID });
    expect(renderedName(element)).toBe("GuestStudioEntryStub");
    expect(element.props).toMatchObject({
      guestDraftId: GUEST_ID,
      conflict: { workId: WORK_ID, templateId: undefined, campaignId: undefined },
    });
  });

  it("ignores an invalid guest draft and keeps the normal Studio", async () => {
    const element = await renderDashboardPage({ guestDraft: "../../x" });
    expect(renderedName(element)).toBe("DashboardHomeActionsStub");
    expect(element.props).toMatchObject({ workspaceId: "ws-e2e-1" });
  });

  it("preserves the draft without a workspace instead of throwing", async () => {
    mockRequireWorkspaceAccess.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.noWorkspace, "No workspace"),
    );
    const element = await renderDashboardPage({ guestDraft: GUEST_ID });
    expect(renderedName(element)).toBe("GuestStudioEntryStub");
    expect(element.props).toMatchObject({ guestDraftId: GUEST_ID, userId: null, workspaceId: null });
  });

  it("rethrows other workspace errors", async () => {
    mockRequireWorkspaceAccess.mockRejectedValue(new Error("boom"));
    await expect(renderDashboardPage({ guestDraft: GUEST_ID })).rejects.toThrow("boom");
  });
});
