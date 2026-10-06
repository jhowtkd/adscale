// saveBillingCustomer (PR 626 review): two saves of the same NEW customer at once can raise a unique violation (23505,
// the OTHER unique key) or make Postgres pick a deadlock victim (40P01) while the other save commits. The whole statement
// is idempotent, so it runs again, at most SAVE_BILLING_CUSTOMER_RETRIES more times; anything else fails at once. The
// real concurrency is in billing/events.pg.test.ts; here the retry policy is pinned call by call.
import { beforeEach, describe, expect, it, vi } from "vitest";

const returning = vi.hoisted(() => vi.fn());
vi.mock("../db", () => ({
  db: {
    insert: () => ({ values: () => ({ onConflictDoUpdate: () => ({ returning: (...args: unknown[]) => returning(...args) }) }) }),
  },
}));

import { SAVE_BILLING_CUSTOMER_RETRIES, saveBillingCustomer } from "./billing";

const DATA = { workspaceId: "workspace-1", stripeCustomerId: "cus_1" };
const ROW = { id: "row-1", workspaceId: "workspace-1", stripeCustomerId: "cus_1" };
/** A driver error as Drizzle wraps it: the SQLSTATE on `cause`. */
const wrapped = (code: string, message = `pg ${code}`) => Object.assign(new Error(`Failed query: ${message}`), { cause: Object.assign(new Error(message), { code }) });
/** A driver error carrying the SQLSTATE on the error itself. */
const bare = (code: string, message = `pg ${code}`) => Object.assign(new Error(message), { code });

describe("saveBillingCustomer", () => {
  beforeEach(() => {
    returning.mockReset();
  });

  it("the retry budget is 2 more runs (3 in total)", () => {
    expect(SAVE_BILLING_CUSTOMER_RETRIES).toBe(2);
  });

  it("success at once: the row, one run", async () => {
    returning.mockResolvedValueOnce([ROW]);

    expect(await saveBillingCustomer(DATA)).toEqual(ROW);
    expect(returning).toHaveBeenCalledTimes(1);
  });

  it.each([["23505"], ["40P01"]])("%s once, then success: the row, two runs", async (code) => {
    returning.mockRejectedValueOnce(wrapped(code)).mockResolvedValueOnce([ROW]);

    expect(await saveBillingCustomer(DATA)).toEqual(ROW);
    expect(returning).toHaveBeenCalledTimes(2);
  });

  it("40P01 twice, then success: the row, three runs (the whole budget)", async () => {
    returning.mockRejectedValueOnce(wrapped("40P01")).mockRejectedValueOnce(wrapped("40P01")).mockResolvedValueOnce([ROW]);

    expect(await saveBillingCustomer(DATA)).toEqual(ROW);
    expect(returning).toHaveBeenCalledTimes(3);
  });

  it("a mix of 23505 and 40P01 shares the same budget", async () => {
    returning.mockRejectedValueOnce(wrapped("23505")).mockRejectedValueOnce(wrapped("40P01")).mockResolvedValueOnce([ROW]);

    expect(await saveBillingCustomer(DATA)).toEqual(ROW);
    expect(returning).toHaveBeenCalledTimes(3);
  });

  it("a persistent 40P01 throws its own error after exactly 3 runs (1 + 2)", async () => {
    const deadlock = wrapped("40P01", "deadlock detected");
    returning.mockRejectedValue(deadlock);

    await expect(saveBillingCustomer(DATA)).rejects.toBe(deadlock);
    expect(returning).toHaveBeenCalledTimes(3);
  });

  it("a persistent 23505 (the customer of ANOTHER workspace) throws after exactly 3 runs: the retry does not hide a real conflict", async () => {
    const conflict = wrapped("23505", 'duplicate key value violates unique constraint "billing_customers_stripe_customer_id_unique"');
    returning.mockRejectedValue(conflict);

    await expect(saveBillingCustomer(DATA)).rejects.toBe(conflict);
    expect(returning).toHaveBeenCalledTimes(3);
  });

  it.each([["23505"], ["40P01"]])("the SQLSTATE %s is read from the error itself too (a driver that does not wrap it)", async (code) => {
    returning.mockRejectedValueOnce(bare(code)).mockResolvedValueOnce([ROW]);

    expect(await saveBillingCustomer(DATA)).toEqual(ROW);
    expect(returning).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["another SQLSTATE (foreign key violation, 23503)", wrapped("23503")],
    ["another SQLSTATE on the error itself (serialization failure, 40001)", bare("40001")],
    ["an error with no code", new Error("connection reset")],
    ["a code that is not a string", Object.assign(new Error("odd"), { code: 40001 })],
    ["a non-Error value", "boom"],
    ["null", null],
  ])("%s fails at once: one run, the same error", async (_name, error) => {
    returning.mockRejectedValue(error);

    await expect(saveBillingCustomer(DATA)).rejects.toBe(error);
    expect(returning).toHaveBeenCalledTimes(1);
  });

  it("a non-concurrency error after a retry still fails at once (it does not consume more runs)", async () => {
    const other = wrapped("23503");
    returning.mockRejectedValueOnce(wrapped("40P01")).mockRejectedValueOnce(other);

    await expect(saveBillingCustomer(DATA)).rejects.toBe(other);
    expect(returning).toHaveBeenCalledTimes(2);
  });
});
