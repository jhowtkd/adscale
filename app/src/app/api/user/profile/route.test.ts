import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/session", () => ({
  getSessionFromHeaders: vi.fn(),
}));

vi.mock("@/server/repositories/user-profile", () => ({
  getUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
  toUserProfileResponse: vi.fn((row, email) => ({
    firstName: row.name.split(" ")[0] ?? "",
    lastName: row.name.split(" ").slice(1).join(" ") ?? "",
    email,
    bio: row.bio ?? "",
    timezone: row.timezone ?? "",
    avatarUrl: row.image ?? null,
  })),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getSessionFromHeaders } from "@/server/auth/session";
import {
  getUserProfile,
  updateUserProfile,
} from "@/server/repositories/user-profile";
import { GET, PATCH } from "./route";

const mockGetSession = vi.mocked(getSessionFromHeaders);
const mockGetUserProfile = vi.mocked(getUserProfile);
const mockUpdateUserProfile = vi.mocked(updateUserProfile);

const session = {
  user: { id: "user-1", email: "jane@example.com", name: "Jane Doe" },
};

const profileRow = {
  id: "user-1",
  name: "Jane Doe",
  bio: "Designer",
  timezone: "America/Sao_Paulo",
  image: "https://cdn.example/avatar.png",
};

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/user/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/user/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without session", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/user/profile"));

    expect(res.status).toBe(401);
  });

  it("returns profile fields from database and session email", async () => {
    mockGetSession.mockResolvedValue(session as Awaited<ReturnType<typeof getSessionFromHeaders>>);
    mockGetUserProfile.mockResolvedValue(profileRow);

    const res = await GET(new Request("http://localhost/api/user/profile"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      bio: "Designer",
      timezone: "America/Sao_Paulo",
      avatarUrl: "https://cdn.example/avatar.png",
    });
    expect(mockGetUserProfile).toHaveBeenCalledWith("user-1");
  });
});

describe("PATCH /api/user/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(session as Awaited<ReturnType<typeof getSessionFromHeaders>>);
    mockUpdateUserProfile.mockResolvedValue({
      ...profileRow,
      name: "Jane Smith",
      bio: "Updated bio",
      timezone: "UTC",
    });
  });

  it("returns 401 without session", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await PATCH(patchRequest({ firstName: "Jane" }));

    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid body", async () => {
    const res = await PATCH(patchRequest({ firstName: "x".repeat(61) }));

    expect(res.status).toBe(400);
  });

  it("rejects email changes in body", async () => {
    const res = await PATCH(
      patchRequest({ firstName: "Jane", email: "hacker@example.com" })
    );

    expect(res.status).toBe(400);
    expect(mockUpdateUserProfile).not.toHaveBeenCalled();
  });

  it("updates profile fields and returns response", async () => {
    const res = await PATCH(
      patchRequest({
        firstName: "Jane",
        lastName: "Smith",
        bio: "Updated bio",
        timezone: "UTC",
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockUpdateUserProfile).toHaveBeenCalledWith("user-1", {
      firstName: "Jane",
      lastName: "Smith",
      bio: "Updated bio",
      timezone: "UTC",
    });
    expect(body.firstName).toBe("Jane");
    expect(body.lastName).toBe("Smith");
    expect(body.bio).toBe("Updated bio");
    expect(body.timezone).toBe("UTC");
    expect(body.email).toBe("jane@example.com");
  });
});
