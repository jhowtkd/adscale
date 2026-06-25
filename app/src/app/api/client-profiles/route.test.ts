import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET, POST } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfiles: vi.fn(),
  createClientProfile: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import {
  getClientProfiles,
  createClientProfile,
} from "@/server/repositories/client-reference";

const mockGetClientProfiles = vi.mocked(getClientProfiles);
const mockCreateClientProfile = vi.mocked(createClientProfile);

function requestWith(body: unknown): Request {
  return new Request("http://localhost/api/client-profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/client-profiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns workspace profiles", async () => {
    const profiles = [
      { id: "p1", name: "Acme", workspaceId: "workspace-1" },
      { id: "p2", name: "Beta Corp", workspaceId: "workspace-1" },
    ];
    mockGetClientProfiles.mockResolvedValue(profiles as Awaited<ReturnType<typeof getClientProfiles>>);

    const res = await GET(new Request("http://localhost/api/client-profiles"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profiles).toEqual(profiles);
    expect(body.profiles).toHaveLength(2);
    expect(mockGetClientProfiles).toHaveBeenCalledWith("workspace-1");
  });
});

describe("POST /api/client-profiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a second profile in the same workspace", async () => {
    const profile = { id: "p2", name: "Beta Corp", workspaceId: "workspace-1" };
    mockCreateClientProfile.mockResolvedValue(profile as Awaited<ReturnType<typeof createClientProfile>>);

    const res = await POST(requestWith({ name: "Beta Corp" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.profile).toEqual(profile);
    expect(mockCreateClientProfile).toHaveBeenCalledWith("workspace-1", {
      name: "Beta Corp",
      description: undefined,
      visualNotes: undefined,
      toneNotes: undefined,
      constraints: undefined,
    });
  });

  it("validates name and creates a profile", async () => {
    const profile = { id: "p1", name: "Acme", workspaceId: "workspace-1" };
    mockCreateClientProfile.mockResolvedValue(profile as Awaited<ReturnType<typeof createClientProfile>>);

    const res = await POST(requestWith({ name: "Acme" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.profile).toEqual(profile);
  });

  it("rejects empty name", async () => {
    const res = await POST(requestWith({ name: "" }));
    expect(res.status).toBe(400);
  });
});
