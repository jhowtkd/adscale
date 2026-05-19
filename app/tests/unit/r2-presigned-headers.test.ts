import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: {
    R2_ACCOUNT_ID: "test-account",
    R2_ACCESS_KEY_ID: "test-access",
    R2_SECRET_ACCESS_KEY: "test-secret",
    R2_BUCKET: "test-bucket",
    R2_PUBLIC_BASE_URL: "https://r2.example.com",
  },
}));

import { getPresignedUploadUrl } from "@/server/storage/r2";

describe("R2 presigned upload URL", () => {
  it("includes content-type in signed headers", async () => {
    const url = await getPresignedUploadUrl(
      "campaigns/camp-1/test.png",
      "image/png",
      1024
    );
    const parsed = new URL(url);
    const signedHeaders = parsed.searchParams.get("X-Amz-SignedHeaders");
    expect(signedHeaders).toContain("content-type");
  });
});
