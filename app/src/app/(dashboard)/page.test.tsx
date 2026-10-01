import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseDashboardSearchParams } from "./dashboard-search-params";

const TEMPLATE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAMPAIGN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const GUEST_ID = "dd111111-1111-4111-8111-111111111111";
const THREAD_ID = "ee222222-2222-4222-8222-222222222222";

const mockRequireWorkspaceAccess = vi.fn(async () => ({
  user: { id: "user-1", emailVerified: true },
  workspace: { id: "ws-e2e-1" },
}));
const mockIsEquipeEnabledForWorkspace = vi.fn(() => false);
const mockExecuteCommand = vi.fn();
const mockCreateEquipeRouteDeps = vi.fn((workspaceId: string) => ({ workspaceId }));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: () => mockRequireWorkspaceAccess(),
}));
vi.mock("@/server/equipe/module/equipe-enabled", () => ({
  isEquipeEnabledForWorkspace: () => mockIsEquipeEnabledForWorkspace(),
}));
vi.mock("@/server/equipe/module/commands", () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
}));
vi.mock("@/server/equipe/http/deps", () => ({
  createEquipeRouteDeps: (workspaceId: string) => mockCreateEquipeRouteDeps(workspaceId),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => {
    const map: Record<string, string> = {
      homeVerifyEmail: "Confirme seu e-mail para começar a conversa com o ADScale.",
      homeOpenError: "Não foi possível abrir sua conversa. Recarregue a página para tentar novamente.",
      homeOwnerFirst: "Peça ao dono deste workspace para abrir o ADScale primeiro.",
    };
    return map[key] ?? key;
  },
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
vi.mock("@/components/assistant/AssistantMain", () => ({
  default: function AssistantMainStub() { return null; },
}));
vi.mock("@/components/assistant/AssistantShell", () => ({
  default: function AssistantShellStub() { return null; },
}));
vi.mock("@/components/assistant/AssistantSidebarPanel", () => ({
  default: function AssistantSidebarPanelStub() { return null; },
}));
vi.mock("@/components/assistant/AssistantContextPanelSlot", () => ({
  default: function AssistantContextPanelSlotStub() { return null; },
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

describe("DashboardPage home conversation gate", () => {
  beforeEach(() => {
    mockRequireWorkspaceAccess.mockReset();
    mockRequireWorkspaceAccess.mockResolvedValue({
      user: { id: "user-1", emailVerified: true },
      workspace: { id: "ws-e2e-1" },
    });
    mockIsEquipeEnabledForWorkspace.mockReset();
    mockIsEquipeEnabledForWorkspace.mockReturnValue(false);
    mockExecuteCommand.mockReset();
    mockExecuteCommand.mockResolvedValue({
      ok: true,
      value: { type: "open_free_account", data: { assistantThreadId: THREAD_ID, created: true } },
    });
    mockCreateEquipeRouteDeps.mockClear();
  });

  it("renders the old Studio home with the gate off, ignoring a guest query", async () => {
    const element = await renderDashboardPage({ guestDraft: GUEST_ID });
    expect(renderedName(element)).toBe("DashboardHomeActionsStub");
    expect(element.props).toMatchObject({ workspaceId: "ws-e2e-1" });
    expect(mockExecuteCommand).not.toHaveBeenCalled();
  });

  it("opens the free account and renders the assistant shell with the gate on", async () => {
    mockIsEquipeEnabledForWorkspace.mockReturnValue(true);
    const element = await renderDashboardPage();

    expect(mockCreateEquipeRouteDeps).toHaveBeenCalledWith("ws-e2e-1");
    expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
    const [, context, command] = mockExecuteCommand.mock.calls[0];
    expect(context).toMatchObject({ workspaceId: "ws-e2e-1" });
    expect(command).toMatchObject({ type: "open_free_account", payload: { userId: "user-1" } });

    expect(renderedName(element)).toBe("AssistantShellStub");
    expect(element.props.threadId).toBe(THREAD_ID);
    expect(element.props.sidebar).toMatchObject({ props: { threadId: THREAD_ID, equipeEnabled: true } });
    expect(element.props.main).toMatchObject({ props: { threadId: THREAD_ID, equipeEnabled: true } });
    expect(element.props.contextPanel).toMatchObject({ props: { threadId: THREAD_ID } });
  });

  it("is idempotent: opening again for an existing primary account still returns the same thread", async () => {
    mockIsEquipeEnabledForWorkspace.mockReturnValue(true);
    mockExecuteCommand.mockResolvedValue({
      ok: true,
      value: { type: "open_free_account", data: { assistantThreadId: THREAD_ID, created: false } },
    });
    const element = await renderDashboardPage();
    expect(renderedName(element)).toBe("AssistantShellStub");
    expect(element.props.threadId).toBe(THREAD_ID);
  });

  it("does not open the account and shows a status message when the email is unverified", async () => {
    mockIsEquipeEnabledForWorkspace.mockReturnValue(true);
    mockRequireWorkspaceAccess.mockResolvedValue({
      user: { id: "user-1", emailVerified: false },
      workspace: { id: "ws-e2e-1" },
    });
    const element = await renderDashboardPage();

    expect(mockExecuteCommand).not.toHaveBeenCalled();
    expect(element.type).toBe("p");
    expect(element.props).toMatchObject({ role: "status" });
  });

  it("asks the workspace owner to open ADScale first on forbidden_actor", async () => {
    mockIsEquipeEnabledForWorkspace.mockReturnValue(true);
    mockExecuteCommand.mockResolvedValue({ ok: false, error: { code: "forbidden_actor", message: "nope" } });
    const element = await renderDashboardPage();

    expect(element.type).toBe("p");
    expect(element.props).toMatchObject({ role: "alert" });
    expect(element.props.children).toBe("Peça ao dono deste workspace para abrir o ADScale primeiro.");
  });

  it("keeps the generic alert for other opening failures", async () => {
    mockIsEquipeEnabledForWorkspace.mockReturnValue(true);
    mockExecuteCommand.mockResolvedValue({ ok: false, error: { code: "internal_error", message: "internal details" } });
    const element = await renderDashboardPage();
    expect(element.props).toMatchObject({
      role: "alert",
      children: "Não foi possível abrir sua conversa. Recarregue a página para tentar novamente.",
    });
  });

  it("ignores a guest query with the gate on and still opens the home conversation", async () => {
    mockIsEquipeEnabledForWorkspace.mockReturnValue(true);
    const element = await renderDashboardPage({ guestDraft: GUEST_ID });
    expect(renderedName(element)).toBe("AssistantShellStub");
    expect(element.props.threadId).toBe(THREAD_ID);
  });
});
