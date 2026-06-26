import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AssistantStartComposer from "./AssistantStartComposer";
import { AssistantSurfaceProvider } from "./AssistantSurfaceContext";

const mockReplace = vi.fn();
const mockMutateAsync = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, string>) => {
    if (key === "promptIn" && vars) {
      return `What should we work on in ${vars.project}?`;
    }
    return key;
  },
}));

vi.mock("@/lib/hooks/use-client-profiles", () => ({
  useClientProfiles: vi.fn(),
}));

vi.mock("@/lib/hooks/use-assistant-threads", () => ({
  useCreateAssistantThread: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

import { useClientProfiles } from "@/lib/hooks/use-client-profiles";

const mockUseClientProfiles = vi.mocked(useClientProfiles);

const clientFixture = {
  id: "client-1",
  workspaceId: "ws-1",
  name: "ADScale_2",
  description: null,
  visualNotes: null,
  toneNotes: null,
  constraints: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AssistantSurfaceProvider>{children}</AssistantSurfaceProvider>
      </QueryClientProvider>
    );
  };
}

describe("AssistantStartComposer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseClientProfiles.mockReturnValue({
      data: [clientFixture],
      isLoading: false,
    } as ReturnType<typeof useClientProfiles>);
    mockMutateAsync.mockResolvedValue({ ...clientFixture, id: "thread-new" });
  });

  it("renders the project-aware heading and the prominent composer", () => {
    render(
      <AssistantStartComposer onSelectThread={vi.fn()} />,
      { wrapper: createWrapper() }
    );

    expect(
      screen.getByText("What should we work on in ADScale_2?")
    ).toBeInTheDocument();
    expect(screen.getByTestId("assistant-start-composer")).toBeInTheDocument();
    expect(screen.getByTestId("assistant-start-form")).toBeInTheDocument();
  });

  it("creates a thread and navigates when submitting a first message", async () => {
    const onSelectThread = vi.fn();
    render(
      <AssistantStartComposer onSelectThread={onSelectThread} />,
      { wrapper: createWrapper() }
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Revisar última milestone" } });
    fireEvent.click(screen.getByRole("button", { name: "send" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          clientProfileId: "client-1",
          name: "Revisar última milestone",
        })
      );
    });

    await waitFor(() => {
      expect(onSelectThread).toHaveBeenCalledWith("thread-new");
      expect(mockReplace).toHaveBeenCalledWith("/assistant?threadId=thread-new");
    });
  });

  it("does not submit when the message is empty", () => {
    render(
      <AssistantStartComposer onSelectThread={vi.fn()} />,
      { wrapper: createWrapper() }
    );

    const sendButton = screen.getByRole("button", { name: "send" });
    expect(sendButton).toBeDisabled();
  });

  it("shows the no-projects empty state when there are no clients", () => {
    mockUseClientProfiles.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useClientProfiles>);

    render(
      <AssistantStartComposer onSelectThread={vi.fn()} onCreateClient={vi.fn()} />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId("assistant-start-empty")).toBeInTheDocument();
    expect(screen.getByText("noProjectsTitle")).toBeInTheDocument();
  });
});
