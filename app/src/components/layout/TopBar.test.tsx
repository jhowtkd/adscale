import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import TopBar, { deriveRouteTitle } from "./TopBar";
import { useAppStore } from "@/lib/store";

vi.mock("@/lib/store", () => ({
  useAppStore: vi.fn((selector: (state: { user: { firstName: string; lastName: string; email: string }; currentPageTitle: string }) => unknown) =>
    selector({
      user: { firstName: "Test", lastName: "User", email: "test@example.com" },
      currentPageTitle: "",
    })
  ),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: vi.fn(() => ({
      data: { user: { id: "user-1", name: "Test User", email: "test@example.com" } },
    })),
  },
}));

vi.mock("@/lib/hooks/use-notifications", () => ({
  useNotifications: vi.fn(),
  useMarkNotificationAsRead: vi.fn(() => ({ mutate: vi.fn() })),
  useMarkAllNotificationsAsRead: vi.fn(() => ({ mutate: vi.fn() })),
  useClearAllNotifications: vi.fn(() => ({ mutate: vi.fn() })),
}));

const mockPush = vi.fn();
const mockUsePathname = vi.fn(() => "/campaigns");
const mockUseSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("@/components/ui/LanguageSwitcher", () => ({
  default: () => null,
}));

vi.mock("@/components/feedback/FeedbackTriggerButton", () => ({
  default: () => null,
}));

vi.mock("next-intl", () => ({
  useTranslations: vi.fn(() => (key: string) => key),
  useLocale: vi.fn(() => "pt-BR"),
}));

import { useNotifications } from "@/lib/hooks/use-notifications";

const mockUseNotifications = vi.mocked(useNotifications);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const PANEL_RETURN_KEY = "adscale:panel-return";

describe("TopBar mode toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/campaigns");
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    sessionStorage.clear();
    mockUseNotifications.mockReturnValue({ data: [] } as ReturnType<typeof useNotifications>);
  });

  it("navigates to /assistant when Chat segment is clicked", () => {
    render(<TopBar />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole("button", { name: "chat" }));

    expect(mockPush).toHaveBeenCalledWith("/assistant");
    expect(sessionStorage.getItem(PANEL_RETURN_KEY)).toBe("/campaigns");
  });

  it("preserves threadId search param when switching to Chat", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("threadId=thread-42"));

    render(<TopBar />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole("button", { name: "chat" }));

    expect(mockPush).toHaveBeenCalledWith("/assistant?threadId=thread-42");
  });

  it("navigates to stored panel route when Panel is clicked from assistant", () => {
    mockUsePathname.mockReturnValue("/assistant");
    sessionStorage.setItem(PANEL_RETURN_KEY, "/settings");

    render(<TopBar />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole("button", { name: "panel" }));

    expect(mockPush).toHaveBeenCalledWith("/settings");
  });

  it("falls back to / when no panel return path is stored", () => {
    mockUsePathname.mockReturnValue("/assistant");

    render(<TopBar />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole("button", { name: "panel" }));

    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("marks Chat segment active on assistant routes", () => {
    mockUsePathname.mockReturnValue("/assistant");

    render(<TopBar />, { wrapper: createWrapper() });

    expect(screen.getByRole("button", { name: "chat" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "panel" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("TopBar notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/campaigns");
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    mockUseNotifications.mockReturnValue({ data: [] } as ReturnType<typeof useNotifications>);
  });

  it("prefetches notifications on mount instead of waiting for panel open", () => {
    mockUseNotifications.mockReturnValue({ data: [] } as ReturnType<typeof useNotifications>);

    render(<TopBar />, { wrapper: createWrapper() });

    expect(mockUseNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ refetchInterval: 30_000 })
    );
    expect(mockUseNotifications).not.toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
  });

  it("shows unread badge when there are unread notifications", () => {
    mockUseNotifications.mockReturnValue({
      data: [
        {
          id: "notif-1",
          userId: "user-1",
          workspaceId: "ws-1",
          type: "derivation_completed",
          title: "Derivação pronta",
          message: "Test",
          derivationId: "deriv-1",
          campaignId: "camp-1",
          readAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    } as { data: typeof mockNotifications });

    render(<TopBar />, { wrapper: createWrapper() });

    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("does not show badge when all notifications are read", () => {
    mockUseNotifications.mockReturnValue({
      data: [
        {
          id: "notif-1",
          userId: "user-1",
          workspaceId: "ws-1",
          type: "derivation_completed",
          title: "Derivação pronta",
          message: "Test",
          derivationId: "deriv-1",
          campaignId: "camp-1",
          readAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    } as { data: typeof mockNotifications });

    render(<TopBar />, { wrapper: createWrapper() });

    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("opens notification panel when bell is clicked", async () => {
    mockUseNotifications.mockReturnValue({
      data: [
        {
          id: "notif-1",
          userId: "user-1",
          workspaceId: "ws-1",
          type: "derivation_completed",
          title: "Derivação pronta",
          message: "Test message",
          derivationId: "deriv-1",
          campaignId: "camp-1",
          readAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    } as { data: typeof mockNotifications });

    render(<TopBar />, { wrapper: createWrapper() });

    const bell = screen.getByRole("button", { name: /notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      expect(screen.getByText("Derivação pronta")).toBeInTheDocument();
    });
  });
});

const ptTitleDict = {
  navigation: { dashboard: "Dashboard", campaigns: "Campanhas", settings: "Configurações" },
  common: { pageTitle: "Campanhas", notifications: "Notificações" },
  settings: {
    title: "Configurações",
    "profile.title": "Perfil",
    "workspace.title": "Workspace",
    "team.title": "Equipe",
  },
  "assistant.mode": { panel: "Painel", chat: "Chat", headerTitle: "Assistente" },
};

const enTitleDict = {
  navigation: { dashboard: "Dashboard", campaigns: "Campaigns", settings: "Settings" },
  common: { pageTitle: "Campaigns", notifications: "Notifications" },
  settings: {
    title: "Settings",
    "profile.title": "Profile",
    "workspace.title": "Workspace",
    "team.title": "Team",
  },
  "assistant.mode": { panel: "Panel", chat: "Chat", headerTitle: "Assistant" },
};

function makeTranslator(dict: typeof ptTitleDict) {
  return (namespace: string) => (key: string) =>
    (dict as Record<string, Record<string, string>>)[namespace]?.[key] ?? `${namespace}.${key}`;
}

describe("deriveRouteTitle", () => {
  const tNav = makeTranslator(ptTitleDict)("navigation");
  const tCommon = makeTranslator(ptTitleDict)("common");
  const tSettings = makeTranslator(ptTitleDict)("settings");
  const tAssistant = makeTranslator(ptTitleDict)("assistant.mode");

  it("returns Dashboard label for /", () => {
    expect(
      deriveRouteTitle({ pathname: "/", campaignDetailTitle: "", tNav, tCommon, tSettings, tAssistant })
    ).toBe("Dashboard");
  });

  it("returns Assistente for /assistant", () => {
    expect(
      deriveRouteTitle({ pathname: "/assistant", campaignDetailTitle: "", tNav, tCommon, tSettings, tAssistant })
    ).toBe("Assistente");
  });

  it("returns Campanhas for /campaigns", () => {
    expect(
      deriveRouteTitle({ pathname: "/campaigns", campaignDetailTitle: "", tNav, tCommon, tSettings, tAssistant })
    ).toBe("Campanhas");
  });

  it("returns Campanhas for /campaigns/new", () => {
    expect(
      deriveRouteTitle({ pathname: "/campaigns/new", campaignDetailTitle: "", tNav, tCommon, tSettings, tAssistant })
    ).toBe("Campanhas");
  });

  it("returns the campaign detail title from the store on /campaigns/[id]", () => {
    expect(
      deriveRouteTitle({ pathname: "/campaigns/abc-123", campaignDetailTitle: "Cenbrap em Dobro", tNav, tCommon, tSettings, tAssistant })
    ).toBe("Cenbrap em Dobro");
  });

  it("falls back to Campanhas on /campaigns/[id] when the store title is empty", () => {
    expect(
      deriveRouteTitle({ pathname: "/campaigns/abc-123", campaignDetailTitle: "", tNav, tCommon, tSettings, tAssistant })
    ).toBe("Campanhas");
  });

  it("returns Configurações for /settings", () => {
    expect(
      deriveRouteTitle({ pathname: "/settings", campaignDetailTitle: "", tNav, tCommon, tSettings, tAssistant })
    ).toBe("Configurações");
  });

  it("appends the tab label on /settings/[tab]", () => {
    expect(
      deriveRouteTitle({ pathname: "/settings/profile", campaignDetailTitle: "", tNav, tCommon, tSettings, tAssistant })
    ).toBe("Configurações · Perfil");
  });

  it("capitalizes the last segment as a fallback for unknown routes", () => {
    expect(
      deriveRouteTitle({ pathname: "/library", campaignDetailTitle: "", tNav, tCommon, tSettings, tAssistant })
    ).toBe("Library");
  });

  it("respects the EN dictionary for /assistant, /campaigns and /settings", () => {
    const tNavEn = makeTranslator(enTitleDict)("navigation");
    const tCommonEn = makeTranslator(enTitleDict)("common");
    const tSettingsEn = makeTranslator(enTitleDict)("settings");
    const tAssistantEn = makeTranslator(enTitleDict)("assistant.mode");
    expect(
      deriveRouteTitle({ pathname: "/assistant", campaignDetailTitle: "", tNav: tNavEn, tCommon: tCommonEn, tSettings: tSettingsEn, tAssistant: tAssistantEn })
    ).toBe("Assistant");
    expect(
      deriveRouteTitle({ pathname: "/campaigns", campaignDetailTitle: "", tNav: tNavEn, tCommon: tCommonEn, tSettings: tSettingsEn, tAssistant: tAssistantEn })
    ).toBe("Campaigns");
    expect(
      deriveRouteTitle({ pathname: "/settings", campaignDetailTitle: "", tNav: tNavEn, tCommon: tCommonEn, tSettings: tSettingsEn, tAssistant: tAssistantEn })
    ).toBe("Settings");
  });
});

describe("TopBar header title per route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    sessionStorage.clear();
    mockUseNotifications.mockReturnValue({ data: [] } as ReturnType<typeof useNotifications>);
    vi.mocked(useTranslations).mockImplementation(((namespace: string) => {
      const t = makeTranslator(ptTitleDict)(namespace);
      return (key: string) => t(key);
    }) as never);
  });

  afterEach(() => {
    vi.mocked(useTranslations).mockImplementation((() => (key: string) => key) as never);
  });

  it("renders the derived title <p> with Assistente on /assistant", () => {
    mockUsePathname.mockReturnValue("/assistant");
    render(<TopBar />, { wrapper: createWrapper() });
    const titleParagraph = document.querySelector("header > div > p");
    expect(titleParagraph).not.toBeNull();
    expect(titleParagraph?.textContent).toBe("Assistente");
  });

  it("renders Campanhas on /campaigns (distinguishing from the nav link of the same label)", () => {
    mockUsePathname.mockReturnValue("/campaigns");
    render(<TopBar />, { wrapper: createWrapper() });
    const titleParagraph = document.querySelector("header > div > p");
    expect(titleParagraph).not.toBeNull();
    expect(titleParagraph?.textContent).toBe("Campanhas");
  });

  it("renders Configurações on /settings", () => {
    mockUsePathname.mockReturnValue("/settings");
    render(<TopBar />, { wrapper: createWrapper() });
    const titleParagraph = document.querySelector("header > div > p");
    expect(titleParagraph).not.toBeNull();
    expect(titleParagraph?.textContent).toBe("Configurações");
  });

  it("does not render the title <p> on the dashboard route", () => {
    mockUsePathname.mockReturnValue("/");
    render(<TopBar />, { wrapper: createWrapper() });
    const titleParagraph = document.querySelector("header > div > p");
    expect(titleParagraph).toBeNull();
  });

  it("renders the campaign store title on /campaigns/[id] (no regression)", () => {
    vi.mocked(useAppStore).mockImplementation(((
      selector: (state: { user: { firstName: string; lastName: string; email: string }; currentPageTitle: string }) => unknown
    ) =>
      selector({
        user: { firstName: "Test", lastName: "User", email: "test@example.com" },
        currentPageTitle: "Cenbrap em Dobro",
      })) as never);
    mockUsePathname.mockReturnValue("/campaigns/cenbrap-123");
    render(<TopBar />, { wrapper: createWrapper() });
    const titleParagraph = document.querySelector("header > div > p");
    expect(titleParagraph).not.toBeNull();
    expect(titleParagraph?.textContent).toBe("Cenbrap em Dobro");
    vi.mocked(useAppStore).mockImplementation(((
      selector: (state: { user: { firstName: string; lastName: string; email: string }; currentPageTitle: string }) => unknown
    ) =>
      selector({
        user: { firstName: "Test", lastName: "User", email: "test@example.com" },
        currentPageTitle: "",
      })) as never);
  });
});
