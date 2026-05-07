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

// Use global File if available (Node 18+), otherwise create a minimal implementation
const GlobalFile = typeof File !== "undefined" ? File : class FilePolyfill {
  name: string;
  type: string;
  size: number;
  constructor(parts: BlobPart[], name: string, options?: FilePropertyBag) {
    this.name = name;
    this.type = options?.type ?? "";
    this.size = 4;
  }
  arrayBuffer(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(4));
  }
  slice(): Blob {
    return new Blob([]);
  }
  text(): Promise<string> {
    return Promise.resolve("test");
  }
  stream(): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([116, 101, 115, 116]));
        controller.close();
      }
    });
  }
};

// Create a mock FormData that avoids using native FormData which has issues with File in Node
function createMockFormData(entries: Record<string, string | InstanceType<typeof GlobalFile>>) {
  const data = new Map<string, string | InstanceType<typeof GlobalFile>>();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return {
    get: (key: string) => data.get(key) ?? null,
    append: (key: string, value: string | InstanceType<typeof GlobalFile>) => data.set(key, value),
    has: (key: string) => data.has(key),
    [Symbol.iterator]: function* () {
      for (const [key, value] of data) {
        yield [key, value];
      }
    },
  };
}

// Create a mock Request with custom formData
function createMockRequest(entries: Record<string, string | InstanceType<typeof GlobalFile>>) {
  const formData = createMockFormData(entries);
  return {
    formData: () => Promise.resolve(formData),
  } as unknown as Request;
}

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
    const request = createMockRequest({
      name: "Restyle",
      styleIntensity: "strong",
      baseImage: new GlobalFile([], "base.png", { type: "image/png" }),
      styleImage: new GlobalFile([], "style.png", { type: "image/png" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(createCampaign).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ styleIntensity: "strong" })
    );
  }, TEST_TIMEOUT);

  it("defaults missing styleIntensity to medium", async () => {
    const request = createMockRequest({
      name: "Restyle",
      baseImage: new GlobalFile([], "base.png", { type: "image/png" }),
      styleImage: new GlobalFile([], "style.png", { type: "image/png" }),
    });

    await POST(request);

    expect(createCampaign).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ styleIntensity: "medium" })
    );
  }, TEST_TIMEOUT);

  it("rejects invalid styleIntensity", async () => {
    const request = createMockRequest({
      name: "Restyle",
      styleIntensity: "extreme",
      baseImage: new GlobalFile([], "base.png", { type: "image/png" }),
      styleImage: new GlobalFile([], "style.png", { type: "image/png" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  }, TEST_TIMEOUT);
});
