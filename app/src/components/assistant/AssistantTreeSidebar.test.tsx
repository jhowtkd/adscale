import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AssistantTreeSidebar from "./AssistantTreeSidebar";

const mockReplace = vi.fn();
const mockOnSelectThread = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/hooks/use-client-profiles", () => ({
  useClientProfiles: vi.fn(),
  useCreateClientProfile: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

vi.mock("@/lib/hooks/use-campaigns", () => ({
  useCampaigns: vi.fn(),
  useCreateCampaign: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

const mockCreateThreadMutate = vi.fn();

vi.mock("@/lib/hooks/use-assistant-threads", () => ({
  useAssistantThreads: vi.fn(),
  useCreateAssistantThread: vi.fn(() => ({
    mutate: mockCreateThreadMutate,
    isPending: false,
  })),
}));

import { useClientProfiles } from "@/lib/hooks/use-client-profiles";
import { useCampaigns } from "@/lib/hooks/use-campaigns";
import { useAssistantThreads } from "@/lib/hooks/use-assistant-threads";

const mockUseClientProfiles = vi.mocked(useClientProfiles);
const mockUseCampaigns = vi.mocked(useCampaigns);
const mockUseAssistantThreads = vi.mocked(useAssistantThreads);

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

const clientFixture = {
  id: "client-1",
  workspaceId: "ws-1",
  name: "Acme Corp",
  description: null,
  visualNotes: null,
  toneNotes: null,
  constraints: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const campaignFixture = {
  id: "camp-1",
  workspaceId: "ws-1",
  name: "Summer Launch",
  clientProfileId: "client-1",
  status: "draft" as const,
  generationMode: "art_variation" as const,
  platforms: [] as ("Meta" | "TikTok" | "Google")[],
  variations: 0,
  creditsUsed: 0,
  totalDerivations: 0,
  activeDerivations: 0,
  failedDerivations: 0,
  completedDerivations: 0,
  lastModified: new Date(),
  createdAt: new Date(),
};

const threadFixture = {
  id: "thread-1",
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  campaignId: "camp-1",
  name: "Main thread",
  isDefault: true,
  migratedFromThreadId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("AssistantTreeSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseClientProfiles.mockReturnValue({
      data: [clientFixture],
      isLoading: false,
    } as ReturnType<typeof useClientProfiles>);

    mockUseCampaigns.mockReturnValue({
      campaigns: [campaignFixture],
      isLoading: false,
    } as ReturnType<typeof useCampaigns>);

    mockUseAssistantThreads.mockImplementation(
      (clientProfileId: string | null, campaignId?: string | null) => {
        if (!clientProfileId) {
          return { data: [], isLoading: false } as ReturnType<
            typeof useAssistantThreads
          >;
        }
        if (campaignId === null) {
          return { data: [], isLoading: false } as ReturnType<
            typeof useAssistantThreads
          >;
        }
        if (campaignId === "camp-1") {
          return { data: [threadFixture], isLoading: false } as ReturnType<
            typeof useAssistantThreads
          >;
        }
        return { data: [], isLoading: false } as ReturnType<
          typeof useAssistantThreads
        >;
      }
    );
  });

  it("renders expandable client and campaign nodes with threads", async () => {
    render(
      <AssistantTreeSidebar onSelectThread={mockOnSelectThread} />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText("Acme Corp")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Acme Corp/i }));

    await waitFor(() => {
      expect(screen.getByText("Summer Launch")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Summer Launch/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Main thread/i })).toBeInTheDocument();
    });
  });

  it("calls onSelectThread and router.replace when a thread is selected", async () => {
    render(
      <AssistantTreeSidebar onSelectThread={mockOnSelectThread} />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByRole("button", { name: /Acme Corp/i }));
    fireEvent.click(screen.getByRole("button", { name: /Summer Launch/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Main thread/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Main thread/i }));

    expect(mockOnSelectThread).toHaveBeenCalledWith("thread-1");
    expect(mockReplace).toHaveBeenCalledWith("/assistant?threadId=thread-1");
  });

  it("exposes header actions for creating entities when client context is set", () => {
    render(
      <AssistantTreeSidebar
        onSelectThread={mockOnSelectThread}
        contextClientId="client-1"
        onNewClient={vi.fn()}
        onNewCampaign={vi.fn()}
        onNewThread={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByRole("button", { name: "newClient" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "newCampaign" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "newThread" })).not.toBeDisabled();
  });

  it("highlights the active thread from selectedThreadId", async () => {
    render(
      <AssistantTreeSidebar
        selectedThreadId="thread-1"
        onSelectThread={mockOnSelectThread}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByRole("button", { name: /Acme Corp/i }));
    fireEvent.click(screen.getByRole("button", { name: /Summer Launch/i }));

    await waitFor(() => {
      const threadButton = screen.getByRole("button", { name: /Main thread/i });
      expect(threadButton).toHaveAttribute("aria-current", "true");
    });
  });
});
