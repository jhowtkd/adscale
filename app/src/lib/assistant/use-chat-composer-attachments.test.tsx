import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatComposerAttachments } from "./use-chat-composer-attachments";

const mockUpload = vi.fn();

vi.mock("./chat-attachments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chat-attachments")>();
  return {
    ...actual,
    uploadChatAttachment: (...args: Parameters<typeof actual.uploadChatAttachment>) =>
      mockUpload(...args),
  };
});

function createPngFile(name: string) {
  return new File(["png"], name, { type: "image/png" });
}

describe("useChatComposerAttachments", () => {
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

  it("appends a second image instead of replacing the first", async () => {
    const { result } = renderHook(() => useChatComposerAttachments());

    await act(async () => {
      await result.current.addFiles([createPngFile("one.png")]);
    });

    await act(async () => {
      await result.current.addFiles([createPngFile("two.png")]);
    });

    await waitFor(() => {
      expect(result.current.attachments).toHaveLength(2);
    });
    expect(result.current.attachments.map((item) => item.name)).toEqual([
      "one.png",
      "two.png",
    ]);
    expect(mockUpload).toHaveBeenCalledTimes(2);
  });

  it("accepts files dropped onto the composer", async () => {
    const { result } = renderHook(() => useChatComposerAttachments());

    const fileList = {
      0: createPngFile("dropped.png"),
      length: 1,
      item: (index: number) => (index === 0 ? createPngFile("dropped.png") : null),
    } as FileList;

    await act(async () => {
      await result.current.addFiles(fileList);
    });

    await waitFor(() => {
      expect(result.current.attachments).toHaveLength(1);
    });
    expect(result.current.attachments[0]?.name).toBe("dropped.png");
  });
});
