import "./load-env";
import { eq } from "drizzle-orm";
import { db } from "../src/server/db";
import { clientProfiles, user, workspaceMembers } from "../src/server/db/schema";

/** Seed a brandless workspace member for guest-home W01. */
const BASE_URL = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const NO_BRAND_EMAIL = "guest-no-brand@example.test";
export const NO_BRAND_PASSWORD = process.env.GUEST_NO_BRAND_PASSWORD ?? "GuestNoBrand123!";

async function main() {
  const existing = await db.select().from(user).where(eq(user.email, NO_BRAND_EMAIL)).limit(1);
  if (!existing[0]) {
    const signUp = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: BASE_URL,
        referer: `${BASE_URL}/signup`,
      },
      body: JSON.stringify({ email: NO_BRAND_EMAIL, password: NO_BRAND_PASSWORD, name: "Guest No Brand" }),
    });
    if (!signUp.ok) throw new Error(`sign-up failed: ${signUp.status} ${await signUp.text()}`);
  }
  const rows = await db.select().from(user).where(eq(user.email, NO_BRAND_EMAIL)).limit(1);
  const userId = rows[0]?.id;
  if (!userId) throw new Error("seed account missing after sign-up");
  await db.update(user).set({ emailVerified: true, locale: "pt-BR", updatedAt: new Date() })
    .where(eq(user.id, userId));
  const membership = await db.select().from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId)).limit(1);
  if (!membership[0]) throw new Error("seed account has no workspace");
  await db.delete(clientProfiles).where(eq(clientProfiles.workspaceId, membership[0].workspaceId));
  console.log(`guest-no-brand seed ready: ${NO_BRAND_EMAIL} (0 brands)`);
}

void main();
