import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PUT } from "./route";

vi.mock("@/server/ai/providers/e2e-controlled-provider", () => ({
  isE2EControlledProviderEnabled: vi.fn(() => true),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    get: vi.fn(),
    head: vi.fn(),
    put: vi.fn(),
  },
}));

import { isE2EControlledProviderEnabled } from "@/server/ai/providers/e2e-controlled-provider";
import { objectStorage } from "@/server/storage";

const enabled = vi.mocked(isE2EControlledProviderEnabled);
const storageGet = vi.mocked(objectStorage.get);
const storageHead = vi.mocked(objectStorage.head);
const storagePut = vi.mocked(objectStorage.put);

const params = (kind: string, key: string[]) => ({
  params: Promise.resolve({ kind, key }),
});

describe("GET/PUT /api/e2e-storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enabled.mockReturnValue(true);
  });

  it("returns 404 when the controlled provider seam is off", async () => {
    enabled.mockReturnValue(false);
    const res = await GET(
      new Request("http://localhost/api/e2e-storage/download/works/a.png"),
      params("download", ["works", "a.png"]),
    );
    expect(res.status).toBe(404);
    expect(storageGet).not.toHaveBeenCalled();
  });

  it("streams a stored object on the same origin for img-src self", async () => {
    storageGet.mockResolvedValue(Buffer.from("png-bytes"));
    storageHead.mockResolvedValue({ contentType: "image/png", contentLength: 9 });

    const res = await GET(
      new Request("http://localhost/api/e2e-storage/download/e2e/visual-foundations/vf.svg"),
      params("download", ["e2e", "visual-foundations", "vf.svg"]),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(await res.text()).toBe("png-bytes");
    expect(storageGet).toHaveBeenCalledWith("e2e/visual-foundations/vf.svg");
  });

  it("accepts a PUT to the signed upload URL", async () => {
    storagePut.mockResolvedValue(undefined);
    const res = await PUT(
      new Request("http://localhost/api/e2e-storage/upload/works/a.png", {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: Buffer.from("png-bytes"),
      }),
      params("upload", ["works", "a.png"]),
    );

    expect(res.status).toBe(204);
    expect(storagePut).toHaveBeenCalledWith("works/a.png", Buffer.from("png-bytes"), "image/png");
  });

  it("rejects GET on the upload kind", async () => {
    const res = await GET(
      new Request("http://localhost/api/e2e-storage/upload/works/a.png"),
      params("upload", ["works", "a.png"]),
    );
    expect(res.status).toBe(404);
    expect(storageGet).not.toHaveBeenCalled();
  });
});
