import { describe, expect, it } from "vitest";
import type {
  AccountScope,
  EquipeRepositories,
  EquipeUnitOfWork,
  InternalEquipeRepositories,
  NewEquipeEvent,
} from "../data";
import { executeCommand } from "./commands";
import { contextVersionHash } from "./context";
import { makeTestDeps, openTestAccount, seedStaff } from "./testing/deps";

/**
 * A mid-command storage failure must leave no state, no events and no
 * receipts behind. The sabotage below fails the SECOND event write of the
 * approval — after the receipt and the version update already happened —
 * proving the whole transaction rolls back.
 */
function sabotageSecondEventWrite(uow: EquipeUnitOfWork): void {
  const innerRun = uow.run.bind(uow);
  uow.run = async <T,>(
    fn: (repos: EquipeRepositories, internal: InternalEquipeRepositories) => Promise<T>,
  ): Promise<T> => {
    return innerRun(async (repos, internal) => {
      let eventWrites = 0;
      const events = repos.events;
      const breaking: EquipeRepositories = {
        ...repos,
        events: {
          ...events,
          create: async (scope: AccountScope, input: NewEquipeEvent) => {
            eventWrites += 1;
            if (eventWrites === 2) throw new Error("storage boom");
            return events.create(scope, input);
          },
        },
      };
      return fn(breaking, internal);
    });
  };
}

describe("atomicity", () => {
  it("rolls back state, events and receipts when storage fails mid-command", async () => {
    const t = makeTestDeps();
    const { workspaceId, accountId, actors } = await openTestAccount(t);
    const scope = { workspaceId, accountId };
    const fields = { offer: { status: "sustained" as const, value: "x" } };
    expect(
      (
        await executeCommand(t.deps, { actor: actors.agent, workspaceId, accountId }, {
          type: "propose_context_section",
          payload: { section: "oferta", fields },
        })
      ).ok,
    ).toBe(true);

    sabotageSecondEventWrite(t.deps.uow);
    await expect(
      executeCommand(t.deps, { actor: actors.approver, workspaceId, accountId }, {
        type: "approve_context_section",
        payload: { section: "oferta", expectedVersionHash: contextVersionHash(fields) },
      }),
    ).rejects.toThrow("storage boom");

    // The proposal is untouched, and nothing leaked: no receipt, no events.
    const versions = await t.deps.uow.repos.contexts.list(scope);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.status).toBe("proposed");
    expect(versions[0]?.receiptId).toBeNull();
    expect(await t.deps.uow.repos.receipts.list(scope)).toHaveLength(0);
    const events = await t.deps.uow.repos.events.list(scope);
    expect(events.map((e) => e.eventType)).toEqual([
      "account.opened",
      "notification.requested",
      "context_section.proposed",
      "notification.requested",
    ]);
  });

  it("rolls back the whole open_account when a late write fails", async () => {
    const t = makeTestDeps();
    const operations = await seedStaff(t, "operations");
    const workspaceId = crypto.randomUUID();
    const profileId = crypto.randomUUID();
    t.gateway.addProfile({ id: profileId, workspaceId });
    sabotageSecondEventWrite(t.deps.uow);
    await expect(
      executeCommand(t.deps, { actor: operations, workspaceId }, {
        type: "open_account",
        payload: {
          clientProfileId: profileId,
          fronts: ["social_instagram"],
          people: [{ name: "Ana", role: "approver" }],
        },
      }),
    ).rejects.toThrow("storage boom");

    // No account row survived: people/fronts/steps cascade from it.
    expect(await t.deps.uow.repos.accounts.list(workspaceId)).toHaveLength(0);
  });
});
