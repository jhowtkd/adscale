import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AssistantTreeSidebar from "./AssistantTreeSidebar";

const mockReplace = vi.fn();
const mockOnSelectThread = vi.fn();
const mockOnNewThread = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, string>) =>
    key in { promptIn: true }
      ? (vars ? `${key}:${JSON.stringify(vars)}` : key)
      : key,
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
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

import { useClientProfiles } from "@/lib/hooks/use-client-profiles";
import { useAssistantThreads } from "@/lib/hooks/use-assistant-threads";

const mockUseClientProfiles = vi.mocked(useClientProfiles);
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

const threadFixture = {
  id: "thread-1",
  workspaceId: "ws-1",
  clientProfileId: "client-1",
  campaignId: null,
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

    mockUseAssistantThreads.mockImplementation(
      (clientProfileId: string | null) => {
        if (!clientProfileId) {
          return { data: [], isLoading: false } as ReturnType<
            typeof useAssistantThreads
          >;
        }
        return { data: [threadFixture], isLoading: false } as ReturnType<
          typeof useAssistantThreads
        >;
      }
    );
  });

  it("defers thread queries until the client node is expanded", () => {
    render(<AssistantTreeSidebar onSelectThread={mockOnSelectThread} />, {
      wrapper: createWrapper(),
    });

    expect(mockUseAssistantThreads).toHaveBeenCalledWith("client-1", null, {
      enabled: false,
    });

    fireEvent.click(screen.getByRole("button", { name: /Acme Corp/i }));

    expect(mockUseAssistantThreads).toHaveBeenCalledWith("client-1", null, {
      enabled: true,
    });
  });

  it("renders project nodes and expands to show threads directly (flat hierarchy)", async () => {
    render(
      <AssistantTreeSidebar onSelectThread={mockOnSelectThread} />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText("Acme Corp")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Acme Corp/i }));

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

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Main thread/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Main thread/i }));

    expect(mockOnSelectThread).toHaveBeenCalledWith("thread-1");
    expect(mockReplace).toHaveBeenCalledWith("/assistant?threadId=thread-1");
  });

  it("invokes onNewThread with clientId when the new-chat action is clicked", async () => {
    render(
      <AssistantTreeSidebar
        onSelectThread={mockOnSelectThread}
        onNewThread={mockOnNewThread}
      />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByRole("button", { name: /Acme Corp/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "newChat" })
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "newChat" }));

    expect(mockOnNewThread).toHaveBeenCalledWith("client-1");
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

    await waitFor(() => {
      const threadButton = screen.getByRole("button", { name: /Main thread/i });
      expect(threadButton).toHaveAttribute("aria-pressed", "true");
    });
  });
});
