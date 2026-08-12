import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  getSignedUrl: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    send = mocks.send;
  }

  class Command {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }

  class NoSuchKey extends Error {
    name = "NoSuchKey";
  }

  return {
    S3Client,
    PutObjectCommand: Command,
    GetObjectCommand: Command,
    DeleteObjectCommand: Command,
    HeadObjectCommand: Command,
    NoSuchKey,
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mocks.getSignedUrl,
}));

import { R2ObjectStorage } from "./r2-object-storage";

describe("R2ObjectStorage", () => {
  beforeEach(() => {
    mocks.send.mockReset();
    mocks.getSignedUrl.mockReset();
  });

  it("stores and reads buffers through S3 commands", async () => {
    const storage = new R2ObjectStorage();
    const data = Buffer.from("image");

    mocks.send.mockResolvedValueOnce({});
    await storage.put("assets/image.png", data, "image/png");

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Key: "assets/image.png",
          Body: data,
          ContentType: "image/png",
        }),
      })
    );

    mocks.send.mockResolvedValueOnce({ Body: Readable.from([data]) });
    await expect(storage.get("assets/image.png")).resolves.toEqual(data);
  });

  it("uploads a readable stream without materializing it in the adapter", async () => {
    const storage = new R2ObjectStorage();
    const stream = Readable.from([Buffer.from("zip")]);

    mocks.send.mockResolvedValueOnce({});
    await storage.putStream("exports/archive.zip", stream, "application/zip");

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Key: "exports/archive.zip",
          Body: stream,
          ContentType: "application/zip",
        }),
      }),
      { abortSignal: undefined },
    );
  });

  it("destroys a download stream when its signal is aborted", async () => {
    const storage = new R2ObjectStorage();
    const stream = Readable.from([Buffer.from("zip")]);
    stream.on("error", () => undefined);
    mocks.send.mockResolvedValueOnce({ Body: stream });
    const controller = new AbortController();

    await storage.getStream("exports/archive.zip", controller.signal);
    controller.abort();

    expect(stream.destroyed).toBe(true);
  });

  it("normalizes head metadata and returns null when head fails", async () => {
    const storage = new R2ObjectStorage();

    mocks.send.mockResolvedValueOnce({
      ContentType: "image/png",
      ContentLength: 42,
    });
    await expect(storage.head("assets/image.png")).resolves.toEqual({
      contentType: "image/png",
      contentLength: 42,
    });

    const notFound = new Error("missing") as Error & { $metadata?: { httpStatusCode?: number } };
    notFound.$metadata = { httpStatusCode: 404 };
    mocks.send.mockRejectedValueOnce(notFound);
    await expect(storage.head("missing.png")).resolves.toBeNull();

    mocks.send.mockRejectedValueOnce(new Error("auth failure"));
    await expect(storage.head("missing.png")).rejects.toThrow("auth failure");
  });

  it("caches signed download urls within the adapter", async () => {
    const storage = new R2ObjectStorage();
    mocks.getSignedUrl.mockResolvedValueOnce("https://signed.example/download");

    await expect(storage.signedDownloadUrl("assets/image.png")).resolves.toBe(
      "https://signed.example/download"
    );
    await expect(storage.signedDownloadUrl("assets/image.png")).resolves.toBe(
      "https://signed.example/download"
    );

    expect(mocks.getSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("keeps long-lived provider input URLs separate from the short user-download cache", async () => {
    const storage = new R2ObjectStorage();
    mocks.getSignedUrl
      .mockResolvedValueOnce("https://signed.example/short")
      .mockResolvedValueOnce("https://signed.example/provider");

    await storage.signedDownloadUrl("assets/image.png");
    await storage.signedDownloadUrl("assets/image.png", 8_100);

    expect(mocks.getSignedUrl).toHaveBeenNthCalledWith(1, expect.anything(), expect.anything(), { expiresIn: 300 });
    expect(mocks.getSignedUrl).toHaveBeenNthCalledWith(2, expect.anything(), expect.anything(), { expiresIn: 8_100 });
  });
});
