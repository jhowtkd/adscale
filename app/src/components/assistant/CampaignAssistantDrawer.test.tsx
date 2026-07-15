import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CampaignAssistantDrawer, {
  CampaignAssistantPanel,
} from "./CampaignAssistantDrawer";

const mockMutateAsync = vi.fn();
const mockAssistantChatCore = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/hooks/use-assistant-threads", () => ({
  useCreateAssistantThread: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
    error: null,
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

describe("CampaignAssistantPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({ id: "thread-default-1" });
  });

  it("resolves default thread and renders AssistantChatCore on mount", async () => {
    render(<CampaignAssistantPanel campaignId="camp-1" clientProfileId="client-1" />);

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
      })
    );
  });

  it("shows loading state while resolving thread", () => {
    mockMutateAsync.mockReturnValue(new Promise(() => {}));

    const { rerender } = render(
      <CampaignAssistantPanel campaignId="camp-1" clientProfileId="client-1" />
    );
    rerender(<CampaignAssistantPanel campaignId="camp-1" clientProfileId="client-1" />);

    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(screen.queryByTestId("assistant-chat-core")).not.toBeInTheDocument();
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  });

  it("shows error when clientProfileId is missing", () => {
    render(<CampaignAssistantPanel campaignId="camp-1" clientProfileId="" />);

    expect(screen.getByRole("alert")).toHaveTextContent("errorMissingClient");
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("does not render a Sheet/modal overlay (panel is inline)", () => {
    render(<CampaignAssistantPanel campaignId="camp-1" clientProfileId="client-1" />);

    // No sheet/portal artifacts from the old modal implementation.
    expect(screen.queryByTestId("sheet")).not.toBeInTheDocument();
  });

  it("default export is an alias for the panel", async () => {
    render(<CampaignAssistantDrawer campaignId="camp-1" clientProfileId="client-1" />);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalled();
    });
  });
});
