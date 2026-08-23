import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AssistantStartComposer from "./AssistantStartComposer";
import {
  AssistantSurfaceProvider,
  useAssistantSurface,
} from "./AssistantSurfaceContext";

const mockReplace = vi.fn();
const mockMutateAsync = vi.fn();
const mockUpsertGuidedFlow = vi.fn();
const mockUploadChatAttachment = vi.fn();

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

vi.mock("@/lib/hooks/use-active-client-profile", () => ({
  useActiveClientProfile: vi.fn(),
}));

vi.mock("@/lib/hooks/use-assistant-threads", () => ({
  useCreateAssistantThread: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

vi.mock("@/lib/hooks/use-guided-flow", () => ({
  useUpsertGuidedFlow: () => ({
    mutateAsync: mockUpsertGuidedFlow,
    isPending: false,
  }),
}));

vi.mock("@/lib/assistant/chat-attachments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/assistant/chat-attachments")>();
  return {
    ...actual,
    uploadChatAttachment: (...args: Parameters<typeof actual.uploadChatAttachment>) =>
      mockUploadChatAttachment(...args),
  };
});

import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";

const mockUseActiveClientProfile = vi.mocked(useActiveClientProfile);

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

function PendingMessageProbe() {
  const { pendingFirstMessage } = useAssistantSurface();
  return <output data-testid="pending-first-message">{JSON.stringify(pendingFirstMessage)}</output>;
}

describe("AssistantStartComposer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadChatAttachment.mockImplementation(async (file: File) => ({
      assetId: `asset-${file.name}`,
      key: `key-${file.name}`,
      url: `https://example.com/${file.name}`,
      type: file.type,
      name: file.name,
      size: file.size,
    }));
    mockUseActiveClientProfile.mockReturnValue({
      profiles: [clientFixture],
      activeProfile: clientFixture,
      activeClientProfileId: clientFixture.id,
      requiresSelection: false,
      isLoading: false,
      selectProfile: vi.fn(),
    });
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
    expect(screen.getByTestId("assistant-journey-cards")).toBeInTheDocument();
    expect(screen.getByText("composerPathHint")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "openHomeComposer" })).toHaveAttribute(
      "href",
      "/?compose=1"
    );
    expect(screen.getByText("sendBriefing")).toBeInTheDocument();
    expect(screen.getByText("organizeBriefing")).toBeInTheDocument();
    expect(screen.getByText("firstActionHint")).toBeInTheDocument();
    expect(screen.queryByText("accessFull")).not.toBeInTheDocument();
  });

  it("creates a thread and navigates when submitting a first message", async () => {
    const onSelectThread = vi.fn();
    render(
      <AssistantStartComposer onSelectThread={onSelectThread} />,
      { wrapper: createWrapper() }
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Revisar última milestone" } });
    fireEvent.click(screen.getByRole("button", { name: "sendBriefing" }));

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
      expect(mockUpsertGuidedFlow).not.toHaveBeenCalled();
    });
  });

  it("preserves the first message and attachments while creating the conversation", async () => {
    render(
      <>
        <AssistantStartComposer onSelectThread={vi.fn()} />
        <PendingMessageProbe />
      </>,
      { wrapper: createWrapper() }
    );

    fireEvent.change(screen.getByTestId("assistant-start-file-input"), {
      target: {
        files: [new File(["image"], "reference.png", { type: "image/png" })],
      },
    });
    await waitFor(() => expect(screen.getByText("reference.png")).toBeInTheDocument());

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Use esta referência" },
    });
    fireEvent.click(screen.getByRole("button", { name: "sendBriefing" }));

    await waitFor(() => {
      expect(screen.getByTestId("pending-first-message")).toHaveTextContent(
        "Use esta referência"
      );
      expect(screen.getByTestId("pending-first-message")).toHaveTextContent(
        "reference.png"
      );
    });
  });

  it("submits with Enter and keeps Shift+Enter for a new line", async () => {
    render(<AssistantStartComposer onSelectThread={vi.fn()} />, {
      wrapper: createWrapper(),
    });

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Briefing pelo teclado" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(mockMutateAsync).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith("/assistant?threadId=thread-new");
    });
  });

  it("does not submit when the message is empty", () => {
    render(
      <AssistantStartComposer onSelectThread={vi.fn()} />,
      { wrapper: createWrapper() }
    );

    const sendButton = screen.getByRole("button", { name: "sendBriefing" });
    expect(sendButton).toBeDisabled();
  });

  it("does not silently select the first profile when multiple profiles require a choice", () => {
    mockUseActiveClientProfile.mockReturnValue({
      profiles: [clientFixture, { ...clientFixture, id: "client-2", name: "Other" }],
      activeProfile: null,
      activeClientProfileId: null,
      requiresSelection: true,
      isLoading: false,
      selectProfile: vi.fn(),
    });

    render(<AssistantStartComposer onSelectThread={vi.fn()} />, {
      wrapper: createWrapper(),
    });

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Create something" },
    });
    expect(screen.getByRole("button", { name: "sendBriefing" })).toBeDisabled();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("appends a second image attachment chip", async () => {
    render(
      <AssistantStartComposer onSelectThread={vi.fn()} />,
      { wrapper: createWrapper() }
    );

    const input = screen.getByTestId("assistant-start-file-input");

    fireEvent.change(input, {
      target: { files: [new File(["a"], "one.png", { type: "image/png" })] },
    });

    await waitFor(() => {
      expect(screen.getByText("one.png")).toBeInTheDocument();
    });

    fireEvent.change(input, {
      target: { files: [new File(["b"], "two.png", { type: "image/png" })] },
    });

    await waitFor(() => {
      expect(screen.getByText("two.png")).toBeInTheDocument();
    });

    expect(screen.getByText("one.png")).toBeInTheDocument();
    expect(mockUploadChatAttachment).toHaveBeenCalledTimes(2);
  });

  it("accepts drag-and-drop images on the start composer", async () => {
    render(
      <AssistantStartComposer onSelectThread={vi.fn()} />,
      { wrapper: createWrapper() }
    );

    const dropzone = screen.getByTestId("assistant-start-dropzone");

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [new File(["c"], "drop.png", { type: "image/png" })],
      },
    });

    await waitFor(() => {
      expect(screen.getByText("drop.png")).toBeInTheDocument();
    });
  });

  it("shows the no-projects empty state when there are no clients", () => {
    mockUseActiveClientProfile.mockReturnValue({
      profiles: [],
      activeProfile: null,
      activeClientProfileId: null,
      requiresSelection: false,
      isLoading: false,
      selectProfile: vi.fn(),
    });
    render(
      <AssistantStartComposer onSelectThread={vi.fn()} onCreateClient={vi.fn()} />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId("assistant-start-empty")).toBeInTheDocument();
    expect(screen.getByText("noProjectsTitle")).toBeInTheDocument();
  });
});

describe("AssistantStartComposer goal-agent experience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadChatAttachment.mockImplementation(async (file: File) => ({
      assetId: `asset-${file.name}`,
      key: `key-${file.name}`,
      url: `https://example.com/${file.name}`,
      type: file.type,
      name: file.name,
      size: file.size,
    }));
    mockUseActiveClientProfile.mockReturnValue({
      profiles: [clientFixture],
      activeProfile: clientFixture,
      activeClientProfileId: clientFixture.id,
      requiresSelection: false,
      isLoading: false,
      selectProfile: vi.fn(),
    });
    mockMutateAsync.mockResolvedValue({ ...clientFixture, id: "thread-new" });
  });

  it("hides journey cards and shows the classic-flow toggle when goal-agent is eligible", () => {
    render(
      <AssistantStartComposer onSelectThread={vi.fn()} goalAgentEligible />,
      { wrapper: createWrapper() }
    );

    expect(
      screen.queryByTestId("assistant-journey-cards")
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("assistant-classic-flow-toggle")
    ).toBeInTheDocument();
  });

  it("creates the thread with experience=agent by default when eligible", async () => {
    render(
      <AssistantStartComposer onSelectThread={vi.fn()} goalAgentEligible />,
      { wrapper: createWrapper() }
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Quero vender mais" } });
    fireEvent.click(screen.getByRole("button", { name: "sendBriefing" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ experience: "agent" })
      );
    });
  });

  it("creates the thread with experience=classic when the classic toggle is selected", async () => {
    render(
      <AssistantStartComposer onSelectThread={vi.fn()} goalAgentEligible />,
      { wrapper: createWrapper() }
    );

    fireEvent.click(screen.getByTestId("assistant-classic-flow-toggle"));

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Oi" } });
    fireEvent.click(screen.getByRole("button", { name: "sendBriefing" }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ experience: "classic" })
      );
    });
  });

  it("renders a native select for the mandatory client when eligible", () => {
    render(
      <AssistantStartComposer onSelectThread={vi.fn()} goalAgentEligible />,
      { wrapper: createWrapper() }
    );

    const select = screen.getByTestId("assistant-client-select");
    expect(select.tagName).toBe("SELECT");
  });
});
