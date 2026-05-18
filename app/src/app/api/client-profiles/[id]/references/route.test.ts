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
  getClientReferences: vi.fn(),
  createClientReference: vi.fn(),
  getClientProfile: vi.fn(() => Promise.resolve({ id: "profile-id", workspaceId: "workspace-1" })),
  isWorkspaceReferenceAssetKey: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import {
  getClientReferences,
  createClientReference,
  getClientProfile,
  isWorkspaceReferenceAssetKey,
} from "@/server/repositories/client-reference";

const mockGetClientReferences = vi.mocked(getClientReferences);
const mockCreateClientReference = vi.mocked(createClientReference);
const mockGetClientProfile = vi.mocked(getClientProfile);
const mockIsWorkspaceReferenceAssetKey = vi.mocked(isWorkspaceReferenceAssetKey);

function requestWith(body: unknown): Request {
  return new Request(
    "http://localhost/api/client-profiles/profile-id/references",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function paramsWith(id: string) {
  return Promise.resolve({ id });
}

describe("GET /api/client-profiles/[id]/references", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns references for that client", async () => {
    const references = [
      { id: "r1", label: "Hero", clientProfileId: "profile-id" },
    ];
    mockGetClientReferences.mockResolvedValue(
      references as Awaited<ReturnType<typeof getClientReferences>>
    );

    const res = await GET(
      new Request(
        "http://localhost/api/client-profiles/profile-id/references"
      ),
      { params: paramsWith("profile-id") }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.references).toEqual(references);
  });
});

describe("POST /api/client-profiles/[id]/references", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates metadata for an existing uploaded asset key", async () => {
    const reference = {
      id: "r1",
      label: "Hero",
      assetKey: "assets/key.png",
      kind: "style",
      clientProfileId: "profile-id",
    };
    mockCreateClientReference.mockResolvedValue(
      reference as Awaited<ReturnType<typeof createClientReference>>
    );

    const res = await POST(requestWith({ assetKey: "assets/key.png", label: "Hero", kind: "style" }), {
      params: paramsWith("profile-id"),
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.reference).toEqual(reference);
    expect(mockIsWorkspaceReferenceAssetKey).toHaveBeenCalledWith(
      "workspace-1",
      "assets/key.png"
    );
  });

  it("rejects asset keys that do not belong to the workspace", async () => {
    mockIsWorkspaceReferenceAssetKey.mockResolvedValueOnce(false);

    const res = await POST(requestWith({ assetKey: "assets/key.png", label: "Hero", kind: "style" }), {
      params: paramsWith("profile-id"),
    });

    expect(res.status).toBe(400);
    expect(mockCreateClientReference).not.toHaveBeenCalled();
  });

  it("rejects missing assetKey", async () => {
    const res = await POST(requestWith({ label: "Hero" }), {
      params: paramsWith("profile-id"),
    });
    expect(res.status).toBe(400);
  });

  it("rejects profile outside workspace", async () => {
    mockGetClientProfile.mockResolvedValueOnce(null);

    const res = await POST(requestWith({ assetKey: "assets/key.png", label: "Hero", kind: "style" }), {
      params: paramsWith("profile-id"),
    });

    expect(res.status).toBe(404);
    expect(mockCreateClientReference).not.toHaveBeenCalled();
  });
});
