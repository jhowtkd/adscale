import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/server/db";
import { verification } from "@/server/db/schema";
import { signEquipeIgState, STATE_TTL_MS, type EquipeIgOAuthState } from "./oauth";

const IDENTIFIER = "equipe-instagram-oauth";

/** Reuse the auth verification store; a cookie alone cannot prevent parallel replay. */
export async function createEquipeIgOAuthState(
  input: Omit<EquipeIgOAuthState, "nonce">,
): Promise<string> {
  const now = Date.now();
  const nonce = randomBytes(32).toString("hex");
  const state = signEquipeIgState({ ...input, nonce }, now);
  await db.insert(verification).values({
    id: `${IDENTIFIER}:${nonce}`,
    identifier: IDENTIFIER,
    value: state,
    expiresAt: new Date(now + STATE_TTL_MS),
  });
  return state;
}

/** DELETE RETURNING gives exactly one winner across processes and concurrent callbacks. */
export async function consumeEquipeIgOAuthState(raw: string, nonce: string): Promise<boolean> {
  const rows = await db.delete(verification).where(and(
    eq(verification.id, `${IDENTIFIER}:${nonce}`),
    eq(verification.identifier, IDENTIFIER),
    eq(verification.value, raw),
    gt(verification.expiresAt, new Date()),
  )).returning({ id: verification.id });
  return rows.length === 1;
}
