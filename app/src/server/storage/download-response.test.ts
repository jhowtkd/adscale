import { beforeEach, describe, expect, it, vi } from "vitest";
import { objectDownloadResponse } from "./download-response";

vi.mock("@/server/storage", () => ({
  objectStorage: {
    get: vi.fn(),
    head: vi.fn(),
  },
}));

import { objectStorage } from "@/server/storage";

const get = vi.mocked(objectStorage.get);
const head = vi.mocked(objectStorage.head);

describe("objectDownloadResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps R2 downloads as a 302 to the signed URL", async () => {
    const res = await objectDownloadResponse(
      "https://signed.example/creative-work/out.png",
      "creative-work/out.png",
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://signed.example/creative-work/out.png");
    expect(get).not.toHaveBeenCalled();
  });

  it("streams e2e-storage objects on the same origin", async () => {
    get.mockResolvedValue(Buffer.from("png-bytes"));
    head.mockResolvedValue({ contentType: "image/png", contentLength: 9 });

    const res = await objectDownloadResponse(
      "e2e-storage://download/e2e/visual-foundations/vf.svg",
      "e2e/visual-foundations/vf.svg",
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(await res.text()).toBe("png-bytes");
    expect(get).toHaveBeenCalledWith("e2e/visual-foundations/vf.svg");
  });
});
