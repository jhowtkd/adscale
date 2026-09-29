import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";

vi.mock("@/server/validation/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: "test-secret-with-at-least-thirty-two-characters",
  },
}));

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)("Instagram OAuth nonce no Postgres", () => {
  let db: typeof import("@/server/db").db;
  let verification: typeof import("@/server/db/schema").verification;
  let createState: typeof import("./oauth-nonce").createEquipeIgOAuthState;
  let consumeState: typeof import("./oauth-nonce").consumeEquipeIgOAuthState;
  let verifyState: typeof import("./oauth").verifyEquipeIgState;
  let nonce: string;

  afterAll(async () => {
    if (!db || !verification || !nonce) return;
    await db.delete(verification).where(eq(verification.id, `equipe-instagram-oauth:${nonce}`));
  });

  it("persists and atomically consumes a state once across concurrent callbacks", async () => {
    const [{ db: database }, schema, nonceModule, oauth] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("./oauth-nonce"),
      import("./oauth"),
    ]);
    db = database;
    verification = schema.verification;
    createState = nonceModule.createEquipeIgOAuthState;
    consumeState = nonceModule.consumeEquipeIgOAuthState;
    verifyState = oauth.verifyEquipeIgState;

    const raw = await createState({
      workspaceId: "workspace-pg",
      accountId: "account-pg",
      custodianPersonId: "person-pg",
      userId: "user-pg",
      sessionId: "session-pg",
    });
    nonce = verifyState(raw)?.nonce ?? "";
    expect(nonce).toMatch(/^[a-f0-9]{64}$/);
    expect(await db.select().from(verification).where(eq(verification.id, `equipe-instagram-oauth:${nonce}`))).toHaveLength(1);

    const results = await Promise.all([
      consumeState(raw, nonce),
      consumeState(raw, nonce),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await consumeState(raw, nonce)).toBe(false);
  });
});
