import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  updateResult: [] as unknown[],
  insertResult: [] as unknown[],
  transactionImpl: null as
    | ((callback: (tx: unknown) => Promise<unknown>) => Promise<unknown>)
    | null,
}));

vi.mock("../db", () => {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(async () => state.selectResults.shift() ?? []),
    then(resolve: (value: unknown) => void) {
      resolve(state.selectResults.shift() ?? []);
    },
  };

  const tx = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => state.insertResult),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(undefined)),
      })),
    })),
  };

  return {
    db: {
      select: vi.fn(() => chain),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => state.insertResult),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => state.updateResult),
          })),
        })),
      })),
      transaction: vi.fn(async (callback: (inner: typeof tx) => Promise<unknown>) => {
        if (state.transactionImpl) {
          return state.transactionImpl(callback);
        }
        return callback(tx);
      }),
    },
  };
});

vi.mock("./campaign", () => ({
  getCampaignById: vi.fn(),
}));

vi.mock("./client-reference", () => ({
  getClientProfile: vi.fn(),
  resolveCampaignClientProfileId: vi.fn(),
}));

import { getCampaignById } from "./campaign";
import { getClientProfile, resolveCampaignClientProfileId } from "./client-reference";
import {
  AssistantThreadValidationError,
  createAssistantThread,
  getAssistantThreadById,
  getOrCreateDefaultCampaignThread,
  linkThreadToCampaign,
  listAssistantThreads,
} from "./assistant-thread";

const mockGetCampaignById = vi.mocked(getCampaignById);
const mockGetClientProfile = vi.mocked(getClientProfile);
const mockResolveCampaignClientProfileId = vi.mocked(resolveCampaignClientProfileId);

describe("assistant-thread repository", () => {
  beforeEach(() => {
    state.selectResults = [];
    state.updateResult = [];
    state.insertResult = [];
    state.transactionImpl = null;
    vi.clearAllMocks();
  });

  it("creates client-level thread when profile belongs to workspace", async () => {
    mockGetClientProfile.mockResolvedValue({
      id: "profile-1",
      workspaceId: "ws-1",
    } as Awaited<ReturnType<typeof getClientProfile>>);
    state.insertResult = [
      {
        id: "thread-1",
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        campaignId: null,
        name: "Cliente",
        isDefault: false,
      },
    ];

    const thread = await createAssistantThread("ws-1", {
      clientProfileId: "profile-1",
    });

    expect(thread.campaignId).toBeNull();
    expect(thread.clientProfileId).toBe("profile-1");
  });

  it("returns null for cross-workspace thread lookup", async () => {
    state.selectResults.push([]);

    await expect(getAssistantThreadById("ws-1", "thread-x")).resolves.toBeNull();
  });

  it("rejects thread create when profile is missing", async () => {
    mockGetClientProfile.mockResolvedValue(null);

    await expect(
      createAssistantThread("ws-1", { clientProfileId: "missing" })
    ).rejects.toBeInstanceOf(AssistantThreadValidationError);
  });

  it("rejects campaign thread when profile alignment fails", async () => {
    mockGetClientProfile.mockResolvedValue({
      id: "profile-1",
      workspaceId: "ws-1",
    } as Awaited<ReturnType<typeof getClientProfile>>);
    mockGetCampaignById.mockResolvedValue({
      id: "camp-1",
      clientProfileId: "profile-other",
      client: null,
    } as Awaited<ReturnType<typeof getCampaignById>>);
    mockResolveCampaignClientProfileId.mockResolvedValue("profile-other");

    await expect(
      createAssistantThread("ws-1", {
        clientProfileId: "profile-1",
        campaignId: "camp-1",
      })
    ).rejects.toBeInstanceOf(AssistantThreadValidationError);
  });

  it("getOrCreateDefaultCampaignThread is idempotent", async () => {
    mockGetCampaignById.mockResolvedValue({
      id: "camp-1",
      clientProfileId: "profile-1",
      client: null,
    } as Awaited<ReturnType<typeof getCampaignById>>);
    mockResolveCampaignClientProfileId.mockResolvedValue("profile-1");

    const existing = {
      id: "thread-default",
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      campaignId: "camp-1",
      isDefault: true,
      name: "Padrão",
    };
    state.selectResults.push([existing]);
    state.selectResults.push([existing]);

    const first = await getOrCreateDefaultCampaignThread("ws-1", "profile-1", "camp-1");
    const second = await getOrCreateDefaultCampaignThread("ws-1", "profile-1", "camp-1");

    expect(first.id).toBe("thread-default");
    expect(second.id).toBe("thread-default");
  });

  it("linkThreadToCampaign rejects profile mismatch", async () => {
    state.selectResults.push([
      {
        id: "thread-1",
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        campaignId: null,
        migratedFromThreadId: null,
      },
    ]);
    mockGetCampaignById.mockResolvedValue({
      id: "camp-1",
      clientProfileId: "profile-2",
      client: null,
    } as Awaited<ReturnType<typeof getCampaignById>>);
    mockResolveCampaignClientProfileId.mockResolvedValue("profile-2");

    await expect(
      linkThreadToCampaign("ws-1", "thread-1", "camp-1")
    ).rejects.toBeInstanceOf(AssistantThreadValidationError);
  });

  it("lists threads scoped by workspace and client profile", async () => {
    state.selectResults.push([
      { id: "thread-1", clientProfileId: "profile-1", workspaceId: "ws-1" },
    ]);

    const threads = await listAssistantThreads("ws-1", {
      clientProfileId: "profile-1",
      campaignId: "camp-1",
    });

    expect(threads).toHaveLength(1);
  });
});
