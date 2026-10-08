import { beforeEach, describe, expect, it, vi } from "vitest";

// The equipe accounts table, as the fake db answers it: account id -> the client profile (brand) it belongs to, plus the
// rows the live-account lookup filters (by workspace and status) and orders (by the columns the query asks for).
type AccountRow = { id: string; workspaceId: string; clientProfileId: string; status: string; createdAt: Date };
const state = vi.hoisted(() => ({
  accountProfile: new Map<string, string>(),
  accounts: [] as AccountRow[],
}));
const mocks = vi.hoisted(() => ({
  getClientProfiles: vi.fn(),
  findFreePlanAccount: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("drizzle-orm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("drizzle-orm")>()),
  // Keep what each condition asks for, so the fake db answers by account (or by workspace and status) and a wrong value finds nothing.
  eq: (_column: unknown, value: unknown) => ({ value }),
  ne: (_column: unknown, value: unknown) => ({ not: value }),
  and: (...conditions: unknown[]) => ({ all: conditions }),
  asc: (column: unknown) => column,
}));
vi.mock("@/server/db/equipe-schema", () => ({
  equipeAccounts: { id: "id", workspaceId: "workspaceId", clientProfileId: "clientProfileId", status: "status", createdAt: "createdAt" },
}));
vi.mock("@/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (condition: { value?: string; all?: [{ value: string }, { not: string }] }) => ({
          // The free plan's lookup: one account, by id.
          limit: async () => {
            const profileId = condition.value ? state.accountProfile.get(condition.value) : undefined;
            return profileId ? [{ clientProfileId: profileId }] : [];
          },
          // The live-account lookup: the workspace's accounts that are not in the excluded status, in the order the query asks for.
          orderBy: (...columns: Array<"createdAt" | "id">) => ({
            limit: async (count: number) => {
              const [workspace, excluded] = condition.all ?? [];
              const compare = (a: AccountRow, b: AccountRow) => {
                for (const column of columns) {
                  const delta = column === "createdAt" ? a.createdAt.getTime() - b.createdAt.getTime() : a.id.localeCompare(b.id);
                  if (delta !== 0) return delta;
                }
                return 0;
              };
              return state.accounts
                .filter((row) => row.workspaceId === workspace?.value && row.status !== excluded?.not)
                .sort(compare)
                .slice(0, count)
                .map(({ clientProfileId }) => ({ clientProfileId }));
            },
          }),
        }),
      }),
    }),
  },
}));
vi.mock("@/server/repositories/client-reference", () => ({ getClientProfiles: mocks.getClientProfiles }));
vi.mock("@/server/equipe/module/free-plan", () => ({ findFreePlanAccount: mocks.findFreePlanAccount }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { resolveActiveBrand } from "./active-brand";

const brand = (id: string, name: string, day: number) => ({ id, name, createdAt: new Date(Date.UTC(2026, 0, day)) });
const CAFE = brand("b-cafe", "Café Aurora", 2);
const LIVRARIA = brand("b-livraria", "Livraria Norte", 1); // the oldest
const STUDIO = brand("b-studio", "Studio Lume", 3);
const BRANDS = [CAFE, LIVRARIA, STUDIO];

const account = (id: string, workspaceId: string, clientProfileId: string, status: string, day: number): AccountRow => ({
  id, workspaceId, clientProfileId, status, createdAt: new Date(Date.UTC(2026, 1, day)),
});

const setCookie = (value: string | undefined) =>
  mocks.cookies.mockResolvedValue({ get: (name: string) => (value === undefined ? undefined : { name, value }) });

beforeEach(() => {
  vi.clearAllMocks();
  state.accountProfile.clear();
  state.accounts = [];
  mocks.getClientProfiles.mockResolvedValue(BRANDS);
  mocks.findFreePlanAccount.mockResolvedValue(null);
  setCookie(undefined);
});

describe("resolveActiveBrand (spec 2026-10-07 §3, server reader)", () => {
  it("a free account's brand wins over a cookie naming another brand of the workspace", async () => {
    mocks.findFreePlanAccount.mockResolvedValue({ accountId: "acc-free" });
    state.accountProfile.set("acc-free", "b-cafe");
    setCookie("b-studio");

    await expect(resolveActiveBrand("ws-free")).resolves.toEqual({ id: "b-cafe", name: "Café Aurora" });
  });

  it("only a closed free account keeps its brand for the workspace, ignoring the cookie", async () => {
    mocks.findFreePlanAccount.mockResolvedValue({ accountId: null, closedAccountId: "acc-closed" });
    state.accountProfile.set("acc-closed", "b-studio");
    setCookie("b-livraria");

    await expect(resolveActiveBrand("ws-closed")).resolves.toEqual({ id: "b-studio", name: "Studio Lume" });
  });

  it("without a free plan, the cookie's brand", async () => {
    setCookie("b-studio");

    await expect(resolveActiveBrand("ws-none")).resolves.toEqual({ id: "b-studio", name: "Studio Lume" });
  });

  describe("without a cookie or a free plan, the brand of the oldest live account (owner decision 2026-10-08)", () => {
    it("is the brand a live account runs on, even a newer one than the oldest brand", async () => {
      state.accounts = [account("acc-studio", "ws-live", "b-studio", "active", 1)];

      await expect(resolveActiveBrand("ws-live")).resolves.toEqual({ id: "b-studio", name: "Studio Lume" });
    });

    it("skips a closed account and takes the oldest of the others", async () => {
      state.accounts = [
        account("acc-livraria", "ws-live", "b-livraria", "closed", 1),
        account("acc-studio", "ws-live", "b-studio", "active", 6),
        account("acc-cafe", "ws-live", "b-cafe", "paused", 5),
      ];

      await expect(resolveActiveBrand("ws-live")).resolves.toEqual({ id: "b-cafe", name: "Café Aurora" });
    });

    it("breaks a tie on the creation time by the account id", async () => {
      state.accounts = [
        account("acc-b", "ws-live", "b-studio", "active", 4),
        account("acc-a", "ws-live", "b-cafe", "active", 4),
      ];

      await expect(resolveActiveBrand("ws-live")).resolves.toEqual({ id: "b-cafe", name: "Café Aurora" });
    });

    it("ignores the accounts of other workspaces", async () => {
      state.accounts = [account("acc-elsewhere", "ws-other", "b-studio", "active", 1)];

      await expect(resolveActiveBrand("ws-live")).resolves.toEqual({ id: "b-livraria", name: "Livraria Norte" });
    });

    it("falls back to the oldest brand when every account is closed", async () => {
      state.accounts = [account("acc-studio", "ws-live", "b-studio", "closed", 1)];

      await expect(resolveActiveBrand("ws-live")).resolves.toEqual({ id: "b-livraria", name: "Livraria Norte" });
    });

    it("falls back to the oldest brand when the live account's brand is not among the workspace's", async () => {
      state.accounts = [account("acc-gone", "ws-live", "b-not-listed", "active", 1)];

      await expect(resolveActiveBrand("ws-live")).resolves.toEqual({ id: "b-livraria", name: "Livraria Norte" });
    });

    it("loses to the cookie's brand", async () => {
      state.accounts = [account("acc-studio", "ws-live", "b-studio", "active", 1)];
      setCookie("b-cafe");

      await expect(resolveActiveBrand("ws-live")).resolves.toEqual({ id: "b-cafe", name: "Café Aurora" });
    });

    it("loses to the free plan's lock", async () => {
      mocks.findFreePlanAccount.mockResolvedValue({ accountId: "acc-free" });
      state.accountProfile.set("acc-free", "b-cafe");
      state.accounts = [account("acc-studio", "ws-live", "b-studio", "active", 1)];

      await expect(resolveActiveBrand("ws-live")).resolves.toEqual({ id: "b-cafe", name: "Café Aurora" });
    });

    it("also applies when the request cookies cannot be read", async () => {
      mocks.cookies.mockImplementation(() => {
        throw new Error("no request cookie store");
      });
      state.accounts = [account("acc-studio", "ws-live", "b-studio", "active", 1)];

      await expect(resolveActiveBrand("ws-live")).resolves.toEqual({ id: "b-studio", name: "Studio Lume" });
    });
  });

  it("when the request cookies cannot be read, the oldest brand", async () => {
    mocks.cookies.mockImplementation(() => {
      throw new Error("no request cookie store");
    });

    await expect(resolveActiveBrand("ws-throws")).resolves.toEqual({ id: "b-livraria", name: "Livraria Norte" });
  });
});
