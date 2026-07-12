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

vi.mock("@/lib/hooks/use-billing", () => ({
  useBillingStatus: vi.fn(() => ({ data: undefined })),
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

describe("TopBar mode toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/assistant");
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    sessionStorage.clear();
    mockUseNotifications.mockReturnValue({ data: [] } as ReturnType<typeof useNotifications>);
  });

  it("does not render the mode toggle in the top bar", () => {
    render(<TopBar />, { wrapper: createWrapper() });

    expect(screen.queryByRole("button", { name: "chat" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "panel" })).not.toBeInTheDocument();
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

  it("collapses 39 identical derivation_completed notifications into a single consolidated row", async () => {
    const now = Date.now();
    const many = Array.from({ length: 39 }, (_, i) => ({
      id: `notif-${i}`,
      userId: "user-1",
      workspaceId: "ws-1",
      type: "derivation_completed",
      title: "Derivação pronta",
      message: 'Uma derivação da campanha "Cenbrap em Dobro - Teste" foi gerada com sucesso.',
      derivationId: `deriv-${i}`,
      campaignId: "camp-1",
      readAt: null,
      createdAt: new Date(now - i * 1000),
      updatedAt: new Date(now - i * 1000),
    }));
    mockUseNotifications.mockReturnValue({ data: many } as ReturnType<typeof useNotifications>);

    render(<TopBar />, { wrapper: createWrapper() });

    const bell = screen.getByRole("button", { name: /notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      // The title "Derivação pronta" appears exactly once (one consolidated row)
      expect(screen.getAllByText("Derivação pronta")).toHaveLength(1);
    });
    // The full list of 39 items is reflected in the header count
    expect(screen.getByText(/39/)).toBeInTheDocument();
  });
});

describe("TopBar navigation quick-links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/campaigns");
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    sessionStorage.clear();
    mockUseNotifications.mockReturnValue({ data: [] } as ReturnType<typeof useNotifications>);
  });

  it("does not surface Templates or Restyling nav links", () => {
    render(<TopBar />, { wrapper: createWrapper() });

    expect(screen.queryByRole("link", { name: /templates/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /restyling/i })).not.toBeInTheDocument();
  });

  it("still renders the core Dashboard, Campaigns and Settings nav links", () => {
    render(<TopBar />, { wrapper: createWrapper() });

    expect(screen.getByRole("link", { name: "campaigns" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "settings" })).toBeInTheDocument();
  });
});

const ptTitleDict = {
  navigation: {
    dashboard: "Dashboard",
    home: "Início",
    campaigns: "Campanhas",
    settings: "Configurações",
  },
  common: { pageTitle: "Campanhas", notifications: "Notificações" },
  settings: {
    title: "Configurações",
    "profile.title": "Perfil",
    "workspace.title": "Workspace",
    "team.title": "Equipe",
  },
  "assistant.mode": { panel: "Painel", chat: "Chat", headerTitle: "Assistente" },
  library: { title: "Biblioteca" },
};

const enTitleDict = {
  navigation: {
    dashboard: "Dashboard",
    home: "Home",
    campaigns: "Campaigns",
    settings: "Settings",
  },
  common: { pageTitle: "Campaigns", notifications: "Notifications" },
  settings: {
    title: "Settings",
    "profile.title": "Profile",
    "workspace.title": "Workspace",
    "team.title": "Team",
  },
  "assistant.mode": { panel: "Panel", chat: "Chat", headerTitle: "Assistant" },
  library: { title: "Library" },
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
  const tLibrary = makeTranslator(ptTitleDict)("library");
  const baseArgs = { tNav, tCommon, tSettings, tAssistant, tLibrary };

  it("returns Início label for /", () => {
    expect(
      deriveRouteTitle({ pathname: "/", campaignDetailTitle: "", ...baseArgs })
    ).toBe("Início");
  });

  it("returns Dashboard label for /dashboard", () => {
    expect(
      deriveRouteTitle({ pathname: "/dashboard", campaignDetailTitle: "", ...baseArgs })
    ).toBe("Dashboard");
  });

  it("returns Assistente for /assistant", () => {
    expect(
      deriveRouteTitle({ pathname: "/assistant", campaignDetailTitle: "", ...baseArgs })
    ).toBe("Assistente");
  });

  it("returns Campanhas for /campaigns", () => {
    expect(
      deriveRouteTitle({ pathname: "/campaigns", campaignDetailTitle: "", ...baseArgs })
    ).toBe("Campanhas");
  });

  it("returns Campanhas for /campaigns/new", () => {
    expect(
      deriveRouteTitle({ pathname: "/campaigns/new", campaignDetailTitle: "", ...baseArgs })
    ).toBe("Campanhas");
  });

  it("returns the campaign detail title from the store on /campaigns/[id]", () => {
    expect(
      deriveRouteTitle({ pathname: "/campaigns/abc-123", campaignDetailTitle: "Cenbrap em Dobro", ...baseArgs })
    ).toBe("Cenbrap em Dobro");
  });

  it("falls back to Campanhas on /campaigns/[id] when the store title is empty", () => {
    expect(
      deriveRouteTitle({ pathname: "/campaigns/abc-123", campaignDetailTitle: "", ...baseArgs })
    ).toBe("Campanhas");
  });

  it("returns Configurações for /settings", () => {
    expect(
      deriveRouteTitle({ pathname: "/settings", campaignDetailTitle: "", ...baseArgs })
    ).toBe("Configurações");
  });

  it("appends the tab label on /settings/[tab]", () => {
    expect(
      deriveRouteTitle({ pathname: "/settings/profile", campaignDetailTitle: "", ...baseArgs })
    ).toBe("Configurações · Perfil");
  });

  it("returns Biblioteca for /library", () => {
    expect(
      deriveRouteTitle({ pathname: "/library", campaignDetailTitle: "", ...baseArgs })
    ).toBe("Biblioteca");
  });

  it("capitalizes the last segment as a fallback for unknown routes", () => {
    expect(
      deriveRouteTitle({ pathname: "/custom-tool", campaignDetailTitle: "", ...baseArgs })
    ).toBe("Custom Tool");
  });

  it("respects the EN dictionary for /assistant, /campaigns and /settings", () => {
    const tNavEn = makeTranslator(enTitleDict)("navigation");
    const tCommonEn = makeTranslator(enTitleDict)("common");
    const tSettingsEn = makeTranslator(enTitleDict)("settings");
    const tAssistantEn = makeTranslator(enTitleDict)("assistant.mode");
    const tLibraryEn = makeTranslator(enTitleDict)("library");
    const enArgs = {
      tNav: tNavEn,
      tCommon: tCommonEn,
      tSettings: tSettingsEn,
      tAssistant: tAssistantEn,
      tLibrary: tLibraryEn,
    };
    expect(
      deriveRouteTitle({ pathname: "/assistant", campaignDetailTitle: "", ...enArgs })
    ).toBe("Assistant");
    expect(
      deriveRouteTitle({ pathname: "/campaigns", campaignDetailTitle: "", ...enArgs })
    ).toBe("Campaigns");
    expect(
      deriveRouteTitle({ pathname: "/settings", campaignDetailTitle: "", ...enArgs })
    ).toBe("Settings");
    expect(
      deriveRouteTitle({ pathname: "/library", campaignDetailTitle: "", ...enArgs })
    ).toBe("Library");
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
