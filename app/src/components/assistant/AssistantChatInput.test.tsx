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

const baseProps = { disabled: false, isStreaming: false, noThread: false };

describe("AssistantChatInput without attachments (free account)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers the attach button and the file input by default", () => {
    render(<AssistantChatInput {...baseProps} onSend={vi.fn()} />);
    expect(screen.getByRole("button", { name: "addImage" })).toBeInTheDocument();
    expect(screen.getByTestId("assistant-chat-file-input")).toBeInTheDocument();
  });

  it.each(["classic", "rail"] as const)("hides the attach button and the file input in the %s variant", (variant) => {
    render(<AssistantChatInput {...baseProps} variant={variant} attachmentsEnabled={false} onSend={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "addImage" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("assistant-chat-file-input")).not.toBeInTheDocument();
  });

  it("ignores a pasted image: nothing is uploaded and the paste is not swallowed", () => {
    render(<AssistantChatInput {...baseProps} attachmentsEnabled={false} onSend={vi.fn()} />);
    const field = screen.getByRole("textbox");
    const notPrevented = fireEvent.paste(field, { clipboardData: { files: [createPngFile("pasted.png")] } });
    expect(notPrevented).toBe(true);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(screen.queryByTestId("assistant-chat-attachment-preview")).not.toBeInTheDocument();
  });

  it("ignores a dropped image", async () => {
    render(<AssistantChatInput {...baseProps} attachmentsEnabled={false} onSend={vi.fn()} />);
    const form = screen.getByTestId("assistant-chat-input");
    fireEvent.dragOver(form, { dataTransfer: { files: [createPngFile("drop.png")] } });
    fireEvent.drop(form, { dataTransfer: { files: [createPngFile("drop.png")] } });
    await Promise.resolve();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(screen.queryByTestId("assistant-chat-attachment-preview")).not.toBeInTheDocument();
  });

  it("still takes a pasted image when attachments are on", async () => {
    mockUpload.mockResolvedValue({ assetId: "a1", key: "k", url: "https://example.com/p.png", type: "image/png", name: "p.png", size: 3 });
    render(<AssistantChatInput {...baseProps} onSend={vi.fn()} />);
    fireEvent.paste(screen.getByRole("textbox"), { clipboardData: { files: [createPngFile("p.png")] } });
    await waitFor(() => expect(screen.getByAltText("p.png")).toBeInTheDocument());
  });

  it("still sends text without attachments", () => {
    const onSend = vi.fn();
    render(<AssistantChatInput {...baseProps} attachmentsEnabled={false} onSend={onSend} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  oi  " } });
    fireEvent.click(screen.getByRole("button", { name: "send" }));
    expect(onSend).toHaveBeenCalledExactlyOnceWith("oi", undefined);
  });
});

describe("AssistantChatInput variants", () => {
  it("keeps the classic composer: two rows and a real disabled send button when empty", () => {
    render(<AssistantChatInput {...baseProps} onSend={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "2");
    expect(screen.getByRole("button", { name: "send" })).toBeDisabled();
  });

  it("uses the pill composer in the rail variant: one growing row", () => {
    render(<AssistantChatInput {...baseProps} variant="rail" onSend={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "1");
  });

  it("marks the rail send button aria-disabled, not disabled, while empty, and ignores presses", () => {
    const onSend = vi.fn();
    render(<AssistantChatInput {...baseProps} variant="rail" onSend={onSend} />);
    const send = screen.getByRole("button", { name: "send" });
    expect(send).toHaveAttribute("aria-disabled", "true");
    expect(send).not.toBeDisabled();
    fireEvent.click(send);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("enables the rail send button once there is text and sends it", () => {
    const onSend = vi.fn();
    render(<AssistantChatInput {...baseProps} variant="rail" onSend={onSend} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Olá" } });
    const send = screen.getByRole("button", { name: "send" });
    expect(send).not.toHaveAttribute("aria-disabled");
    fireEvent.click(send);
    expect(onSend).toHaveBeenCalledExactlyOnceWith("Olá", undefined);
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("keeps the rail send aria-disabled while streaming or blocked, even with text", () => {
    render(<AssistantChatInput {...baseProps} variant="rail" isStreaming draftText="algo" onDraftTextChange={vi.fn()} onSend={vi.fn()} />);
    expect(screen.getByRole("button", { name: "send" })).toHaveAttribute("aria-disabled", "true");
  });

  it("sends with Enter and breaks the line with Shift+Enter, in both variants", () => {
    for (const variant of ["classic", "rail"] as const) {
      const onSend = vi.fn();
      const { unmount } = render(<AssistantChatInput {...baseProps} variant={variant} onSend={onSend} />);
      const field = screen.getByRole("textbox");
      fireEvent.change(field, { target: { value: "texto" } });
      fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
      expect(onSend).not.toHaveBeenCalled();
      fireEvent.keyDown(field, { key: "Enter" });
      expect(onSend).toHaveBeenCalledExactlyOnceWith("texto", undefined);
      unmount();
    }
  });
});
