import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AssistantChatInput from "./AssistantChatInput";

const mockUpload = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/assistant/chat-attachments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/assistant/chat-attachments")>();
  return {
    ...actual,
    uploadChatAttachment: (...args: Parameters<typeof actual.uploadChatAttachment>) =>
      mockUpload(...args),
  };
});

function createPngFile(name: string) {
  return new File(["png"], name, { type: "image/png" });
}

describe("AssistantChatInput attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload.mockImplementation(async (file: File) => ({
      assetId: `asset-${file.name}`,
      key: `key-${file.name}`,
      url: `https://example.com/${file.name}`,
      type: file.type,
      name: file.name,
      size: file.size,
    }));
  });

  it("exposes an accessible name on the message field", () => {
    render(
      <AssistantChatInput
        disabled={false}
        isStreaming={false}
        noThread={false}
        onSend={vi.fn()}
      />
    );

    expect(screen.getByRole("textbox", { name: "inputAriaLabel" })).toBeInTheDocument();
  });

  it("shows two chips after attaching images sequentially", async () => {
    render(
      <AssistantChatInput
        disabled={false}
        isStreaming={false}
        noThread={false}
        onSend={vi.fn()}
      />
    );

    const input = screen.getByTestId("assistant-chat-file-input");

    fireEvent.change(input, {
      target: { files: [createPngFile("first.png")] },
    });

    await waitFor(() => {
      expect(screen.getByAltText("first.png")).toBeInTheDocument();
    });

    fireEvent.change(input, {
      target: { files: [createPngFile("second.png")] },
    });

    await waitFor(() => {
      expect(screen.getByAltText("second.png")).toBeInTheDocument();
    });

    expect(screen.getAllByTestId("assistant-chat-attachment-preview")).toHaveLength(2);
    expect(mockUpload).toHaveBeenCalledTimes(2);
  });

  it("adds dropped images to the composer", async () => {
    render(
      <AssistantChatInput
        disabled={false}
        isStreaming={false}
        noThread={false}
        onSend={vi.fn()}
      />
    );

    const dropzone = screen.getByTestId("assistant-chat-input");

    fireEvent.dragOver(dropzone, {
      dataTransfer: { files: [createPngFile("drop.png")] },
    });

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [createPngFile("drop.png")] },
    });

    await waitFor(() => {
      expect(screen.getByAltText("drop.png")).toBeInTheDocument();
    });
  });
});
