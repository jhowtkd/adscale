import { Fragment } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseDashboardSearchParams } from "./dashboard-search-params";
import { studioStageProps } from "./studio-stage-props";

const TEMPLATE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAMPAIGN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const GUEST_ID = "dd111111-1111-4111-8111-111111111111";
const THREAD_ID = "ee222222-2222-4222-8222-222222222222";

const mockRequireWorkspaceAccess = vi.fn(async () => ({
  user: { id: "user-1", emailVerified: true },
  workspace: { id: "ws-e2e-1" },
}));
const mockExecuteCommand = vi.fn();
const mockCreateEquipeRouteDeps = vi.fn((workspaceId: string) => ({ workspaceId }));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: () => mockRequireWorkspaceAccess(),
}));
vi.mock("@/server/equipe/module/commands", () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
}));
vi.mock("@/server/equipe/http/deps", () => ({
  createEquipeRouteDeps: (workspaceId: string) => mockCreateEquipeRouteDeps(workspaceId),
}));
const BRAND_ID = "ff333333-3333-4333-8333-333333333333";
const mockResolveActiveBrand = vi.fn(async (): Promise<{ id: string; name: string } | null> => ({ id: BRAND_ID, name: "CENBRAP" }));
vi.mock("@/server/brands/active-brand", () => ({ resolveActiveBrand: () => mockResolveActiveBrand() }));
vi.mock("@/lib/brands/active-brand-context", () => ({
  RefreshForFirstBrand: function RefreshForFirstBrandStub() { return null; },
}));

const mockRedirect = vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); });
vi.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));
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
vi.mock("@/components/assistant/conversation/ConversationScreen", () => ({
  default: function ConversationScreenStub() { return null; },
}));

type PageElement = { type: unknown; props: Record<string, unknown> };

async function renderDashboardPage(
  params: Record<string, string | string[] | undefined> = {},
): Promise<PageElement> {
  const { default: DashboardPage } = await import("./page");
  return (await DashboardPage({ searchParams: Promise.resolve(params) })) as unknown as PageElement;
}

// The home conversation is always a fragment: the conversation, then the refresh for the workspace's first brand or null.
function homeChildren(element: PageElement): [PageElement, PageElement | null] {
  expect(element.type).toBe(Fragment);
  return element.props.children as [PageElement, PageElement | null];
}

function renderedName(element: PageElement): string {
  const type = element.type as { name?: string; render?: { name?: string } };
  return type.name ?? type.render?.name ?? "unknown";
}

// `/` no longer renders the Studio stage, but the composer page still takes these props from `studioStageProps`.
describe("studioStageProps entry interview rollout gate", () => {
  it("hides the entry interview at percent zero and enables it at one hundred", () => {
    process.env.STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT = "0";
    expect(studioStageProps("ws-e2e-1", {})).toMatchObject({ entryInterviewEnabled: false });

    process.env.STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT = "100";
    expect(studioStageProps("ws-e2e-1", {})).toMatchObject({ entryInterviewEnabled: true });
  });
});

describe("studioStageProps carousel rollout gate", () => {
  it("hides new carousel creation at percent zero and enables it at one hundred", () => {
    process.env.STUDIO_CAROUSEL_ROLLOUT_PERCENT = "0";
    expect(studioStageProps("ws-e2e-1", {})).toMatchObject({ carouselCreationEnabled: false });

    process.env.STUDIO_CAROUSEL_ROLLOUT_PERCENT = "100";
    expect(studioStageProps("ws-e2e-1", {})).toMatchObject({ carouselCreationEnabled: true });
  });

  it("sends only a boolean gate to the client, never the environment value", () => {
    process.env.STUDIO_CAROUSEL_ROLLOUT_PERCENT = "37";
    const props = studioStageProps("ws-e2e-1", {});
    expect(typeof props.carouselCreationEnabled).toBe("boolean");
    expect(Object.values(props)).not.toContain(37);
    expect(JSON.stringify(props)).not.toContain("STUDIO_CAROUSEL_ROLLOUT_PERCENT");
    expect(JSON.stringify(props)).not.toContain("37");
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

describe("DashboardPage home conversation", () => {
  beforeEach(() => {
    mockRequireWorkspaceAccess.mockReset();
    mockRequireWorkspaceAccess.mockResolvedValue({
      user: { id: "user-1", emailVerified: true },
      workspace: { id: "ws-e2e-1" },
    });
    mockExecuteCommand.mockReset();
    mockExecuteCommand.mockResolvedValue({
      ok: true,
      value: { type: "open_free_account", data: { assistantThreadId: THREAD_ID, created: true } },
    });
    mockCreateEquipeRouteDeps.mockClear();
    mockResolveActiveBrand.mockClear();
  });

  it("opens the free account and renders the conversation screen", async () => {
    const element = await renderDashboardPage();

    expect(mockCreateEquipeRouteDeps).toHaveBeenCalledWith("ws-e2e-1");
    expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
    const [, context, command] = mockExecuteCommand.mock.calls[0];
    expect(context).toMatchObject({ workspaceId: "ws-e2e-1" });
    expect(command).toMatchObject({ type: "open_free_account", payload: { userId: "user-1" } });

    const [conversation] = homeChildren(element);
    expect(renderedName(conversation)).toBe("ConversationScreenStub");
    expect(conversation.props).toEqual({ threadId: THREAD_ID });
  });

  it("opens the active brand's account (spec 2026-10-07 §3)", async () => {
    await renderDashboardPage();
    const [, , command] = mockExecuteCommand.mock.calls[0];
    expect(command).toMatchObject({ type: "open_free_account", payload: { userId: "user-1", clientProfileId: BRAND_ID } });
  });

  it("sends no brand for a workspace that has none yet: the opening creates it", async () => {
    mockResolveActiveBrand.mockResolvedValueOnce(null);
    await renderDashboardPage();
    const [, , command] = mockExecuteCommand.mock.calls[0];
    expect(command).toEqual({ type: "open_free_account", payload: { userId: "user-1" } });
  });

  // The layout drew the rail before this opening created the first brand: the rail had no brand switcher until a reload.
  it("refreshes once when the opening created the workspace's first brand, so the rail shows it", async () => {
    mockResolveActiveBrand.mockResolvedValueOnce(null);
    const element = await renderDashboardPage();
    const [conversation, refresh] = homeChildren(element);
    expect(renderedName(conversation)).toBe("ConversationScreenStub");
    expect(conversation.props).toEqual({ threadId: THREAD_ID });
    expect(refresh && renderedName(refresh)).toBe("RefreshForFirstBrandStub");
  });

  it("does not refresh when the workspace already had a brand", async () => {
    const element = await renderDashboardPage();
    // The same fragment as the first visit, with nothing in the place of the refresh: the shape does not change.
    const [conversation, refresh] = homeChildren(element);
    expect(renderedName(conversation)).toBe("ConversationScreenStub");
    expect(conversation.props).toEqual({ threadId: THREAD_ID });
    expect(refresh).toBeNull();
  });

  it("is idempotent: opening again for an existing primary account still returns the same thread", async () => {
    mockExecuteCommand.mockResolvedValue({
      ok: true,
      value: { type: "open_free_account", data: { assistantThreadId: THREAD_ID, created: false } },
    });
    const [conversation] = homeChildren(await renderDashboardPage());
    expect(renderedName(conversation)).toBe("ConversationScreenStub");
    expect(conversation.props.threadId).toBe(THREAD_ID);
  });

  it("does not open the account and shows a status message when the email is unverified", async () => {
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
    mockExecuteCommand.mockResolvedValue({ ok: false, error: { code: "forbidden_actor", message: "nope" } });
    const element = await renderDashboardPage();

    expect(element.type).toBe("p");
    expect(element.props).toMatchObject({ role: "alert" });
    expect(element.props.children).toBe("Peça ao dono deste workspace para abrir o ADScale primeiro.");
  });

  it("keeps the generic alert for other opening failures", async () => {
    mockExecuteCommand.mockResolvedValue({ ok: false, error: { code: "internal_error", message: "internal details" } });
    const element = await renderDashboardPage();
    expect(element.props).toMatchObject({
      role: "alert",
      children: "Não foi possível abrir sua conversa. Recarregue a página para tentar novamente.",
    });
  });

  it("ignores a guest query and still opens the home conversation", async () => {
    const [conversation] = homeChildren(await renderDashboardPage({ guestDraft: GUEST_ID }));
    expect(renderedName(conversation)).toBe("ConversationScreenStub");
    expect(conversation.props.threadId).toBe(THREAD_ID);
  });
});

describe("DashboardPage old composer links (spec 2026-10-07 §2)", () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockRequireWorkspaceAccess.mockReset();
    mockRequireWorkspaceAccess.mockResolvedValue({
      user: { id: "user-1", emailVerified: true },
      workspace: { id: "ws-e2e-1" },
    });
    mockExecuteCommand.mockReset();
    mockExecuteCommand.mockResolvedValue({
      ok: true,
      value: { type: "open_free_account", data: { assistantThreadId: THREAD_ID, created: false } },
    });
  });

  it("sends an old composer link to /creative-work/new with the same query, before reading the workspace", async () => {
    await expect(renderDashboardPage({ mode: "arte", compose: "1", fresh: "1" }))
      .rejects.toThrow("NEXT_REDIRECT:/creative-work/new?mode=arte&compose=1&fresh=1");
    expect(mockRequireWorkspaceAccess).not.toHaveBeenCalled();
    expect(mockExecuteCommand).not.toHaveBeenCalled();
  });

  it("keeps an open work open in the composer", async () => {
    await expect(renderDashboardPage({ workId: WORK_ID, intent: "variations" }))
      .rejects.toThrow(`NEXT_REDIRECT:/creative-work/new?workId=${WORK_ID}&intent=variations`);
  });

  it("redirects a bare compose link too, without opening an account", async () => {
    await expect(renderDashboardPage({ compose: "1" })).rejects.toThrow("NEXT_REDIRECT:/creative-work/new?compose=1");
    expect(mockExecuteCommand).not.toHaveBeenCalled();
  });

  it("leaves the conversation's suggestion and the guest handoff at /", async () => {
    expect(renderedName(homeChildren(await renderDashboardPage({ suggestion: "Montar o calendário do mês" }))[0])).toBe("ConversationScreenStub");
    expect(renderedName(homeChildren(await renderDashboardPage({ compose: "1", fresh: "1", intent: "single", guestDraft: GUEST_ID }))[0]))
      .toBe("ConversationScreenStub");
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
