import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/session", () => ({
  getSessionFromHeaders: vi.fn(),
}));

vi.mock("@/server/storage/r2", () => ({
  uploadBuffer: vi.fn(),
  getPublicUrl: vi.fn((key: string) => `https://cdn.example/${key}`),
}));

vi.mock("@/lib/upload-config", () => ({
  isAllowedImageType: vi.fn((type: string) => type === "image/png"),
  validateImageMagicBytes: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("@/server/repositories/user-profile", () => ({
  updateUserAvatar: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getSessionFromHeaders } from "@/server/auth/session";
import { uploadBuffer } from "@/server/storage/r2";
import { isAllowedImageType, validateImageMagicBytes } from "@/lib/upload-config";
import { updateUserAvatar } from "@/server/repositories/user-profile";
import { POST } from "./route";

const mockGetSession = vi.mocked(getSessionFromHeaders);
const mockUploadBuffer = vi.mocked(uploadBuffer);
const mockIsAllowedImageType = vi.mocked(isAllowedImageType);
const mockValidateMagicBytes = vi.mocked(validateImageMagicBytes);
const mockUpdateUserAvatar = vi.mocked(updateUserAvatar);

const session = {
  user: { id: "user-1", email: "jane@example.com", name: "Jane Doe" },
};

function avatarRequest(file?: File | null): Request {
  const req = new Request("http://localhost/api/user/profile/avatar", {
    method: "POST",
  });

  const entries: Record<string, File | null> = {
    file: file ?? null,
  };

  vi.spyOn(req, "formData").mockResolvedValue({
    get: (name: string) => entries[name] ?? null,
  } as unknown as FormData);

  return req;
}

describe("POST /api/user/profile/avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(session as Awaited<ReturnType<typeof getSessionFromHeaders>>);
    mockUpdateUserAvatar.mockResolvedValue("https://cdn.example/users/user-1/avatar/test.png");
  });

  it("returns 401 without session", async () => {
    mockGetSession.mockResolvedValue(null);

    const file = new File([new Uint8Array([1, 2, 3])], "avatar.png", {
      type: "image/png",
    });
    const res = await POST(avatarRequest(file));

    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid file", async () => {
    const { isAllowedImageType } = await import("@/lib/upload-config");
    vi.mocked(isAllowedImageType).mockReturnValueOnce(false);

    const file = new File([new Uint8Array([1, 2, 3])], "avatar.gif", {
      type: "image/gif",
    });
    const res = await POST(avatarRequest(file));

    expect(res.status).toBe(400);
    expect(mockUploadBuffer).not.toHaveBeenCalled();
  });

  it("returns 400 when file field is missing", async () => {
    const res = await POST(avatarRequest());

    expect(res.status).toBe(400);
  });

  it("uploads to R2 and persists avatar URL on user", async () => {
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "avatar.png", {
      type: "image/png",
    });
    const res = await POST(avatarRequest(file));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockUploadBuffer).toHaveBeenCalled();
    const uploadKey = mockUploadBuffer.mock.calls[0]?.[0] as string;
    expect(uploadKey).toMatch(/^users\/user-1\/avatar\/.+-avatar\.png$/);
    expect(mockUpdateUserAvatar).toHaveBeenCalledWith(
      "user-1",
      "https://cdn.example/" + uploadKey
    );
    expect(body.avatarUrl).toBe("https://cdn.example/" + uploadKey);
  });
});
