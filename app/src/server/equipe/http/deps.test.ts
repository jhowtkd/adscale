// The request deps (ticket 11, part 2, review R1): the first open of the home asks the SAME "active paid access" the
// free plan's rule asks, so a classic payer never gets a free account.
import { beforeEach, describe, expect, it, vi } from "vitest";

const paid = vi.hoisted(() => vi.fn());
vi.mock("@/server/billing/access", () => ({ workspaceHasActivePaidAccess: (...a: unknown[]) => paid(...a) }));
vi.mock("@/server/jobs/client", () => ({ inngest: { send: vi.fn() } }));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/storage", () => ({ objectStorage: {} }));
vi.mock("../data/postgres", () => ({ createPostgresEquipeUnitOfWork: vi.fn(() => ({ repos: {} })) }));
vi.mock("../agents/gateway", () => ({ LiveAdscaleGateway: vi.fn() }));
vi.mock("../agents/ledger", () => ({ DrizzleLedgerStore: vi.fn() }));
vi.mock("../agents/free-balance", () => ({ createFreeBudgetReader: vi.fn(() => ({})) }));

import { createEquipeRouteDeps } from "./deps";

describe("createEquipeRouteDeps", () => {
  beforeEach(() => {
    paid.mockReset();
  });

  it("wires hasClassicPaidAccess to workspaceHasActivePaidAccess, with the workspace asked about", async () => {
    paid.mockResolvedValue(true);

    const deps = createEquipeRouteDeps("ws-1");

    expect(await deps.hasClassicPaidAccess?.("ws-1")).toBe(true);
    expect(paid).toHaveBeenCalledWith("ws-1");
    paid.mockResolvedValue(false);
    expect(await deps.hasClassicPaidAccess?.("ws-2")).toBe(false);
    expect(paid).toHaveBeenLastCalledWith("ws-2");
  });

  it("is present even for the staff deps (no workspace scope): the command asks about the workspace it opens", () => {
    expect(typeof createEquipeRouteDeps().hasClassicPaidAccess).toBe("function");
  });
});
