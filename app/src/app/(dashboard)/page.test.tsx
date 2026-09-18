import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_ERROR_CODES } from "@/server/auth/errors";
import { parseDashboardSearchParams } from "./dashboard-search-params";

const TEMPLATE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAMPAIGN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const GUEST_ID = "dd111111-1111-4111-8111-111111111111";

const controls = vi.hoisted(() => ({ throwNoWorkspace: false }));

vi.mock("@/server/auth/workspace", async (importOriginal) => {
  const errors =
    await importOriginal<typeof import("@/server/auth/errors")>();
  return {
    requireWorkspaceAccess: async () => {
      if (controls.throwNoWorkspace) {
        throw new errors.WorkspaceAuthError(
          errors.AUTH_ERROR_CODES.noWorkspace,
          "No workspace",
        );
      }
      return {
        user: { id: "user-e2e-1" },
        workspace: { id: "ws-e2e-1" },
      };
    },
  };
});
vi.mock("@/server/validation/env", () => ({
  env: new Proxy({}, {
    get(_target, key: string) {
      if (key === "STUDIO_PROGRESSIVE_ROLLOUT_PERCENT") return Number(process.env.STUDIO_PROGRESSIVE_ROLLOUT_PERCENT ?? 0);
      if (key === "STUDIO_CAROUSEL_ROLLOUT_PERCENT") return Number(process.env.STUDIO_CAROUSEL_ROLLOUT_PERCENT ?? 0);
      if (key === "STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT") return Number(process.env.STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT ?? 0);
      if (key === "PUBLIC_STUDIO_IMPORT_ENABLED") return process.env.PUBLIC_STUDIO_IMPORT_ENABLED ?? "false";
      if (key === "PUBLIC_STUDIO_ATTACHMENTS_ENABLED") return process.env.PUBLIC_STUDIO_ATTACHMENTS_ENABLED ?? "false";
      return undefined;
    },
  }),
}));
vi.mock("@/components/dashboard/DashboardHomeActions", () => ({
  default: () => null,
}));
vi.mock("@/components/guest-home/GuestStudioEntry", () => ({
  GuestStudioEntry: () => null,
}));
vi.mock("@/components/guest-home/GuestWorkspacePending", () => ({
  GuestWorkspacePending: () => null,
}));

type PageElement = { type: unknown; props: Record<string, unknown> };

async function renderDashboardPage(
  params: Record<string, string | string[] | undefined> = {},
): Promise<PageElement> {
  const { default: DashboardPage } = await import("./page");
  return (await DashboardPage({
    searchParams: Promise.resolve(params),
  })) as unknown as PageElement;
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

  it("ignores guestDraft without altering existing parsing (#442)", () => {
    expect(parseDashboardSearchParams({ guestDraft: GUEST_ID })).toEqual({});
    expect(
      parseDashboardSearchParams({ guestDraft: GUEST_ID, intent: "single", fresh: "1" }),
    ).toMatchObject({ initialIntent: "single", freshEntry: true });
    expect(
      parseDashboardSearchParams({ guestDraft: GUEST_ID, workId: WORK_ID }),
    ).toEqual({ workId: WORK_ID });
  });
});

describe("DashboardPage guest handoff (#442)", () => {
  beforeEach(() => {
    controls.throwNoWorkspace = false;
    delete process.env.PUBLIC_STUDIO_IMPORT_ENABLED;
    delete process.env.PUBLIC_STUDIO_ATTACHMENTS_ENABLED;
  });

  it("renders the Studio unchanged with no draft parameter", async () => {
    const { default: DashboardHomeActions } = await import(
      "@/components/dashboard/DashboardHomeActions"
    );
    const element = await renderDashboardPage({ intent: "single" });
    expect(element.type).toBe(DashboardHomeActions);
    expect(element.props).toMatchObject({ workspaceId: "ws-e2e-1" });
  });

  it("renders the review entry after the workspace guard", async () => {
    process.env.PUBLIC_STUDIO_IMPORT_ENABLED = "true";
    process.env.PUBLIC_STUDIO_ATTACHMENTS_ENABLED = "false";
    const { GuestStudioEntry } = await import(
      "@/components/guest-home/GuestStudioEntry"
    );
    const element = await renderDashboardPage({ guestDraft: GUEST_ID });
    expect(element.type).toBe(GuestStudioEntry);
    expect(element.props).toMatchObject({
      handoff: { kind: "guest", id: GUEST_ID },
      userId: "user-e2e-1",
      workspaceId: "ws-e2e-1",
      importEnabled: true,
      attachmentsEnabled: false,
    });
  });

  it("renders recovery-capable entry when import is off", async () => {
    const { GuestStudioEntry } = await import(
      "@/components/guest-home/GuestStudioEntry"
    );
    const element = await renderDashboardPage({ guestDraft: GUEST_ID });
    expect(element.type).toBe(GuestStudioEntry);
    expect(element.props).toMatchObject({ importEnabled: false });
  });

  it("builds conflict destinations without overlaying data", async () => {
    process.env.PUBLIC_STUDIO_IMPORT_ENABLED = "true";
    const { GuestStudioEntry } = await import(
      "@/components/guest-home/GuestStudioEntry"
    );
    const element = await renderDashboardPage({
      guestDraft: GUEST_ID,
      workId: WORK_ID,
      intent: "single",
    });
    expect(element.type).toBe(GuestStudioEntry);
    const props = element.props as {
      handoff: { kind: string };
      conflictHrefs: { openExisting: string; continueWithGuest: string };
    };
    expect(props.handoff.kind).toBe("conflict");
    expect(props.conflictHrefs.openExisting).toBe(
      `/?workId=${WORK_ID}&intent=single`,
    );
    expect(props.conflictHrefs.continueWithGuest).toContain(
      `guestDraft=${GUEST_ID}`,
    );
    expect(props.conflictHrefs.continueWithGuest).not.toContain("workId");
  });

  it("shows the workspace-pending recovery on noWorkspace with a handoff", async () => {
    controls.throwNoWorkspace = true;
    const { GuestWorkspacePending } = await import(
      "@/components/guest-home/GuestWorkspacePending"
    );
    const element = await renderDashboardPage({
      guestDraft: GUEST_ID,
      intent: "single",
    });
    expect(element.type).toBe(GuestWorkspacePending);
    expect(element.props).toMatchObject({
      retryHref: `/?guestDraft=${GUEST_ID}&intent=single`,
    });
  });

  it("still throws noWorkspace on the normal path without weakening the guard", async () => {
    controls.throwNoWorkspace = true;
    await expect(renderDashboardPage({ intent: "single" })).rejects.toThrow(
      expect.objectContaining({ code: AUTH_ERROR_CODES.noWorkspace }),
    );
  });
});
