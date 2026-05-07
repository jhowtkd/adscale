import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock env BEFORE any module loads it
vi.mock("@/server/validation/env", () => ({
  env: {
    DATABASE_URL: "postgres://test",
    OPENAI_API_KEY: "sk-test",
    OPENAI_IMAGE_MODEL: "gpt-image-1",
    OPENAI_TEXT_MODEL: "gpt-4o",
    R2_ENDPOINT: "https://test.r2.cloudflarestorage.com",
    R2_ACCESS_KEY_ID: "test",
    R2_SECRET_ACCESS_KEY: "test",
    R2_BUCKET_NAME: "test",
    BETTER_AUTH_SECRET: "test-secret",
    BETTER_AUTH_URL: "http://localhost:3000",
    GOOGLE_CLIENT_ID: "test",
    GOOGLE_CLIENT_SECRET: "test",
    INNGEST_EVENT_KEY: "test",
    INNGEST_SIGNING_KEY: "test",
  },
}));

// Mock db BEFORE any repository loads it
vi.mock("@/server/db", () => ({
  db: {},
}));

// Mock dependencies BEFORE importing the route handler
vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/server/repositories/user", () => ({
  getUserLocale: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  createCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/asset", () => ({
  createAsset: vi.fn(),
}));

vi.mock("@/server/repositories/derivation", () => ({
  createDerivation: vi.fn(),
}));

vi.mock("@/server/storage/r2", () => ({
  uploadBuffer: vi.fn().mockResolvedValue(undefined),
  deleteObject: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getUserLocale } from "@/server/repositories/user";
import { createCampaign } from "@/server/repositories/campaign";
import { POST, parseStyleIntensity } from "@/app/api/quick-tools/restyling/route";

describe("parseStyleIntensity", () => {
  it("parses valid intensities", () => {
    expect(parseStyleIntensity("soft")).toBe("soft");
    expect(parseStyleIntensity("medium")).toBe("medium");
    expect(parseStyleIntensity("strong")).toBe("strong");
  });

  it("defaults null to medium", () => {
    expect(parseStyleIntensity(null)).toBe("medium");
  });

  it("defaults undefined to medium", () => {
    expect(parseStyleIntensity(undefined)).toBe("medium");
  });

  it("rejects invalid string values", () => {
    expect(parseStyleIntensity("extreme")).toBeNull();
    expect(parseStyleIntensity("")).toBeNull();
    expect(parseStyleIntensity("hard")).toBeNull();
  });

  it("rejects non-string values", () => {
    expect(parseStyleIntensity(123 as unknown as string)).toBeNull();
    expect(parseStyleIntensity({} as unknown as string)).toBeNull();
  });
});

describe("POST /api/quick-tools/restyling", () => {
  const TEST_TIMEOUT = 15000;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireWorkspaceAccess).mockResolvedValue({
      user: { id: "user-1" },
      workspace: { id: "ws-1" },
    } as never);
    vi.mocked(getUserLocale).mockResolvedValue("pt-BR");
    vi.mocked(createCampaign).mockResolvedValue({ id: "camp-1" } as never);
  });

  it("creates restyling campaign with selected styleIntensity", async () => {
    const formData = new FormData();
    formData.append("name", "Restyle");
    formData.append("styleIntensity", "strong");
    formData.append("baseImage", new File(["base"], "base.png", { type: "image/png" }));
    formData.append("styleImage", new File(["style"], "style.png", { type: "image/png" }));

    const response = await POST(new Request("http://localhost/api/quick-tools/restyling", {
      method: "POST",
      body: formData,
    }));

    expect(response.status).toBe(201);
    expect(createCampaign).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ styleIntensity: "strong" })
    );
  }, TEST_TIMEOUT);

  it("defaults missing styleIntensity to medium", async () => {
    const formData = new FormData();
    formData.append("name", "Restyle");
    formData.append("baseImage", new File(["base"], "base.png", { type: "image/png" }));
    formData.append("styleImage", new File(["style"], "style.png", { type: "image/png" }));

    await POST(new Request("http://localhost/api/quick-tools/restyling", {
      method: "POST",
      body: formData,
    }));

    expect(createCampaign).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ styleIntensity: "medium" })
    );
  }, TEST_TIMEOUT);

  it("rejects invalid styleIntensity", async () => {
    const formData = new FormData();
    formData.append("name", "Restyle");
    formData.append("styleIntensity", "extreme");
    formData.append("baseImage", new File(["base"], "base.png", { type: "image/png" }));
    formData.append("styleImage", new File(["style"], "style.png", { type: "image/png" }));

    const response = await POST(new Request("http://localhost/api/quick-tools/restyling", {
      method: "POST",
      body: formData,
    }));

    expect(response.status).toBe(400);
  }, TEST_TIMEOUT);
});
