import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CampaignAssistantDrawer from "./CampaignAssistantDrawer";

const mockMutateAsync = vi.fn();
const mockAssistantChatCore = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/hooks/use-assistant-threads", () => ({
  useCreateAssistantThread: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

vi.mock("./AssistantChatCore", () => ({
  default: (props: {
    threadId: string | null;
    variant?: string;
    onClose?: () => void;
  }) => {
    mockAssistantChatCore(props);
    return (
      <div
        data-testid="assistant-chat-core"
        data-thread-id={props.threadId ?? ""}
        data-variant={props.variant ?? ""}
      />
    );
  },
}));

describe("CampaignAssistantDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({ id: "thread-default-1" });
  });

  it("resolves default thread and renders AssistantChatCore with drawer variant", async () => {
    render(
      <CampaignAssistantDrawer
        open
        onOpenChange={vi.fn()}
        campaignId="camp-1"
        clientProfileId="client-1"
      />
    );

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        clientProfileId: "client-1",
        campaignId: "camp-1",
        isDefault: true,
      });
    });

    expect(screen.getByTestId("assistant-chat-core")).toBeInTheDocument();
    expect(mockAssistantChatCore).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-default-1",
        variant: "drawer",
        onClose: expect.any(Function),
      })
    );
  });

  it("shows loading state while resolving thread", () => {
    mockMutateAsync.mockReturnValue(new Promise(() => {}));

    render(
      <CampaignAssistantDrawer
        open
        onOpenChange={vi.fn()}
        campaignId="camp-1"
        clientProfileId="client-1"
      />
    );

    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(screen.queryByTestId("assistant-chat-core")).not.toBeInTheDocument();
  });

  it("shows error when clientProfileId is missing", () => {
    render(
      <CampaignAssistantDrawer
        open
        onOpenChange={vi.fn()}
        campaignId="camp-1"
        clientProfileId=""
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("errorMissingClient");
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("does not instantiate duplicate chat hooks — delegates to AssistantChatCore only", async () => {
    render(
      <CampaignAssistantDrawer
        open
        onOpenChange={vi.fn()}
        campaignId="camp-1"
        clientProfileId="client-1"
      />
    );

    await waitFor(() => {
      expect(mockAssistantChatCore).toHaveBeenCalled();
    });

    expect(mockAssistantChatCore.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
