import { Readable } from "node:stream";
import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ObjectStorage } from "@/server/storage/object-storage";

const mocks = vi.hoisted(() => ({
  getCampaign: vi.fn(),
  getApproved: vi.fn(),
  createExport: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: mocks.getCampaign,
}));

vi.mock("@/server/repositories/derivation", () => ({
  getApprovedDerivationsByCampaign: mocks.getApproved,
  getDerivationById: vi.fn(),
}));

vi.mock("@/server/repositories/export", () => ({
  createExportRecord: mocks.createExport,
}));

import { exportAllApproved } from "./export";

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.once("end", () => resolve(Buffer.concat(chunks)));
    stream.once("error", reject);
  });
}

function storageForTest() {
  const uploaded: { key: string; data: Buffer; contentType: string }[] = [];
  const storage: ObjectStorage = {
    put: vi.fn(),
    putStream: vi.fn(async (key, stream, contentType) => {
      uploaded.push({ key, data: await collect(stream), contentType });
    }),
    get: vi.fn(),
    getStream: vi.fn(async (key: string) =>
      Readable.from([Buffer.from(key === "output-1" ? "one" : "two")])
    ),
    delete: vi.fn(),
    head: vi.fn(),
    signedUploadUrl: vi.fn(),
    signedDownloadUrl: vi.fn(async () => "https://signed.example/archive.zip"),
    publicUrl: vi.fn(),
  };
  return { storage, uploaded };
}

describe("exportAllApproved", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCampaign.mockResolvedValue({ name: "Campaign" });
    mocks.getApproved.mockResolvedValue([
      { id: "d1", outputKey: "output-1", format: "png" },
      { id: "d2", outputKey: "output-2", format: "png" },
    ]);
    mocks.createExport.mockResolvedValue({});
  });

  it("uploads the generated archive as a stream", async () => {
    const { storage, uploaded } = storageForTest();

    const result = await exportAllApproved(storage, "campaign-1", "workspace-1", "png");

    expect(result.url).toBe("https://signed.example/archive.zip");
    expect(storage.getStream).toHaveBeenCalledTimes(2);
    expect(storage.get).not.toHaveBeenCalled();
    expect(storage.putStream).toHaveBeenCalledTimes(1);
    expect(storage.put).not.toHaveBeenCalled();
    expect(uploaded[0]?.contentType).toBe("application/zip");

    const archive = await JSZip.loadAsync(uploaded[0]!.data);
    await expect(archive.file("derivations/campaign-1.png")?.async("string")).resolves.toBe("one");
    await expect(archive.file("derivations/campaign-2.png")?.async("string")).resolves.toBe("two");
  });

  it("starts ZIP upload before a source stream is fully consumed", async () => {
    const { storage } = storageForTest();
    let sourceFinished = false;
    let sourceBytesProduced = 0;
    let sourceBytesAtFirstArchiveChunk: number | undefined;
    const sourceChunks = [Buffer.from("first"), Buffer.from("second")];
    const sourceBytesTotal = sourceChunks.reduce((total, chunk) => total + chunk.length, 0);
    let uploadStartedBeforeSourceFinished = false;
    storage.getStream = vi.fn(async () => Readable.from((async function* () {
      for (const [index, chunk] of sourceChunks.entries()) {
        sourceBytesProduced += chunk.length;
        yield chunk;
        if (index === 0) await new Promise((resolve) => setTimeout(resolve, 5));
      }
      sourceFinished = true;
    })()));
    storage.putStream = vi.fn(async (_key, stream) => {
      uploadStartedBeforeSourceFinished = !sourceFinished;
      stream.once("data", () => {
        sourceBytesAtFirstArchiveChunk = sourceBytesProduced;
      });
      await collect(stream);
    });

    await exportAllApproved(storage, "campaign-1", "workspace-1", "png");

    expect(uploadStartedBeforeSourceFinished).toBe(true);
    expect(sourceBytesAtFirstArchiveChunk).toBeLessThan(sourceBytesTotal);
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("keeps source residency bounded relative to a larger archive", async () => {
    const { storage } = storageForTest();
    const sourceChunks = Array.from({ length: 64 }, (_, index) =>
      Buffer.alloc(1024, index % 255),
    );
    const sourceBytesTotal = sourceChunks.reduce((total, chunk) => total + chunk.length, 0);
    let sourceBytesProduced = 0;
    let sourceBytesAtFirstArchiveChunk: number | undefined;

    storage.getStream = vi.fn(async () => Readable.from((async function* () {
      for (const [index, chunk] of sourceChunks.entries()) {
        sourceBytesProduced += chunk.length;
        yield chunk;
        if (index % 4 === 0) await new Promise((resolve) => setTimeout(resolve, 1));
      }
    })()));
    storage.putStream = vi.fn(async (_key, stream) => {
      stream.once("data", () => {
        sourceBytesAtFirstArchiveChunk ??= sourceBytesProduced;
      });
      await collect(stream);
    });

    await exportAllApproved(storage, "campaign-1", "workspace-1", "png");

    expect(sourceBytesAtFirstArchiveChunk).toBeDefined();
    expect(sourceBytesAtFirstArchiveChunk).toBeLessThan(sourceBytesTotal);
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("propagates cancellation instead of silently skipping the archive", async () => {
    const { storage } = storageForTest();
    const controller = new AbortController();
    storage.getStream = vi.fn(async () => {
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    });

    await expect(
      exportAllApproved(storage, "campaign-1", "workspace-1", "png", controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(storage.putStream).not.toHaveBeenCalled();
  });

  it("destroys the ZIP stream when cancellation arrives during upload", async () => {
    const { storage } = storageForTest();
    const controller = new AbortController();
    storage.putStream = vi.fn(async (_key, stream, _contentType, signal) => new Promise<void>((resolve, reject) => {
      void _contentType;
      const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
      signal?.addEventListener("abort", onAbort, { once: true });
      stream.once("data", () => controller.abort());
      stream.once("end", () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      });
      stream.once("error", (error) => {
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      });
    }));

    await expect(
      exportAllApproved(storage, "campaign-1", "workspace-1", "png", controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.createExport).not.toHaveBeenCalled();
  });
});
