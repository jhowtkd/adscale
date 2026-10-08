import { beforeEach, describe, expect, it, vi } from "vitest";

// The equipe accounts table, as the fake db answers it: account id -> the client profile (brand) it belongs to.
const state = vi.hoisted(() => ({ accountProfile: new Map<string, string>() }));
const mocks = vi.hoisted(() => ({
  getClientProfiles: vi.fn(),
  findFreePlanAccount: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("drizzle-orm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("drizzle-orm")>()),
  // Keep the id the lookup asks for, so the fake db answers by account and a wrong id finds no brand.
  eq: (_column: unknown, value: unknown) => ({ value }),
}));
vi.mock("@/server/db/equipe-schema", () => ({ equipeAccounts: { id: "id", clientProfileId: "clientProfileId" } }));
vi.mock("@/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (condition: { value: string }) => ({
          limit: async () => {
            const profileId = state.accountProfile.get(condition.value);
            return profileId ? [{ clientProfileId: profileId }] : [];
          },
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

const setCookie = (value: string | undefined) =>
  mocks.cookies.mockResolvedValue({ get: (name: string) => (value === undefined ? undefined : { name, value }) });

beforeEach(() => {
  vi.clearAllMocks();
  state.accountProfile.clear();
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

  it("when the request cookies cannot be read, the oldest brand", async () => {
    mocks.cookies.mockImplementation(() => {
      throw new Error("no request cookie store");
    });

    await expect(resolveActiveBrand("ws-throws")).resolves.toEqual({ id: "b-livraria", name: "Livraria Norte" });
  });
});
