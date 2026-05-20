import { describe, it, expect, vi, beforeEach } from "vitest";

const getSignedUrlMock = vi.fn();

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: getSignedUrlMock,
}));

vi.mock("@/server/validation/env", () => ({
  env: {
    R2_ACCOUNT_ID: "test-account",
    R2_ACCESS_KEY_ID: "test-access",
    R2_SECRET_ACCESS_KEY: "test-secret",
    R2_BUCKET: "test-bucket",
    R2_PUBLIC_BASE_URL: "https://r2.example.com",
  },
}));

describe("R2 presigned download URL cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useRealTimers();
  });

  it("reuses the same signed URL for repeated requests to the same key", async () => {
    getSignedUrlMock.mockResolvedValueOnce("https://cdn.example.com/file-1");

    const { getPresignedDownloadUrl } = await import("@/server/storage/r2");
    const first = await getPresignedDownloadUrl("campaigns/camp-1/file.png");
    const second = await getPresignedDownloadUrl("campaigns/camp-1/file.png");

    expect(first).toBe("https://cdn.example.com/file-1");
    expect(second).toBe("https://cdn.example.com/file-1");
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
  });

  it("signs a new URL for a different key", async () => {
    getSignedUrlMock
      .mockResolvedValueOnce("https://cdn.example.com/file-1")
      .mockResolvedValueOnce("https://cdn.example.com/file-2");

    const { getPresignedDownloadUrl } = await import("@/server/storage/r2");
    const first = await getPresignedDownloadUrl("campaigns/camp-1/file.png");
    const second = await getPresignedDownloadUrl("campaigns/camp-1/other.png");

    expect(first).toBe("https://cdn.example.com/file-1");
    expect(second).toBe("https://cdn.example.com/file-2");
    expect(getSignedUrlMock).toHaveBeenCalledTimes(2);
  });
});
