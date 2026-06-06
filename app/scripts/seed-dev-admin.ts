/**
 * Dev-only: grant active subscription + credits to a workspace so AI actions work locally.
 *
 * Usage:
 *   npx tsx scripts/seed-dev-admin.ts --email=you@example.com
 *   npx tsx scripts/seed-dev-admin.ts --create --email=dev@adscale.local --password='DevAdmin123!'
 *   npx tsx scripts/seed-dev-admin.ts --repair --create --email=you@example.com
 *
 * Sign-up (--create) calls Better Auth on BETTER_AUTH_URL; the app must be reachable.
 */
import "./load-env";

import { eq } from "drizzle-orm";
import { db } from "../src/server/db";
import { user, workspaceMembers } from "../src/server/db/schema";
import { repairDevAdminAccount } from "../src/server/auth/dev-admin";
import { env } from "../src/server/validation/env";
import {
  createCreditGrant,
  getActiveSubscriptionByWorkspace,
  getAvailableCreditGrants,
  saveBillingCustomer,
  upsertSubscription,
} from "../src/server/repositories/billing";

function parseArgs(argv: string[]) {
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  for (const arg of argv) {
    if (arg.startsWith("--") && arg.includes("=")) {
      const [key, ...rest] = arg.slice(2).split("=");
      values[key] = rest.join("=");
    } else if (arg.startsWith("--")) {
      flags.add(arg.slice(2));
    }
  }
  return { flags, values };
}

async function signUpDevAccount(email: string, password: string, name: string) {
  const base = env.BETTER_AUTH_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      Referer: `${base}/signup`,
    },
    body: JSON.stringify({ email, password, name }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof body === "object" && body && "message" in body
        ? String((body as { message: unknown }).message)
        : JSON.stringify(body);
    throw new Error(`Sign-up failed (${res.status}): ${message}`);
  }
  return body;
}

async function resolveUserByEmail(email: string) {
  const normalized = email.toLowerCase().trim();
  const rows = await db
    .select()
    .from(user)
    .where(eq(user.email, normalized))
    .limit(1);
  return rows[0] ?? null;
}

async function grantDevBilling(
  workspaceId: string,
  options: { credits: number; planKey: "starter" | "growth" | "scale" }
) {
  const stripeCustomerId = `cus_dev_${workspaceId.replace(/-/g, "").slice(0, 24)}`;
  const stripeSubscriptionId = `sub_dev_${workspaceId.replace(/-/g, "").slice(0, 24)}`;

  const priceIdByPlan = {
    starter: env.STRIPE_STARTER_PRICE_ID,
    growth: env.STRIPE_GROWTH_PRICE_ID,
    scale: env.STRIPE_SCALE_PRICE_ID,
  } as const;

  await saveBillingCustomer({ workspaceId, stripeCustomerId });

  const periodEnd = new Date();
  periodEnd.setFullYear(periodEnd.getFullYear() + 1);

  await upsertSubscription({
    workspaceId,
    stripeSubscriptionId,
    stripeCustomerId,
    status: "active",
    planKey: options.planKey,
    priceId: priceIdByPlan[options.planKey],
    currentPeriodStart: new Date(),
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
  });

  await createCreditGrant({
    workspaceId,
    source: "dev_admin_seed",
    sourceId: `seed-${Date.now()}`,
    amount: options.credits,
    expiresAt: null,
  });
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const email = (values.email ?? process.env.DEV_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = values.password ?? "DevAdmin123!";
  const name = values.name ?? "Dev Admin";
  const credits = Number(values.credits ?? "10000");
  const planKey = (values.plan ?? "scale") as "starter" | "growth" | "scale";

  if (!email) {
    console.error(
      "Usage:\n" +
        "  npx tsx scripts/seed-dev-admin.ts --email=you@example.com\n" +
        "  npx tsx scripts/seed-dev-admin.ts --create --email=dev@adscale.local --password='DevAdmin123!'\n" +
        "  npx tsx scripts/seed-dev-admin.ts --repair --create --email=you@example.com"
    );
    process.exit(1);
  }

  if (flags.has("repair")) {
    const removed = await repairDevAdminAccount(email);
    console.log(`Removed ${removed} existing user row(s) for ${email}.`);
  }

  if (flags.has("create")) {
    console.log(`Creating account ${email} via ${env.BETTER_AUTH_URL} ...`);
    await signUpDevAccount(email, password, name);
    console.log("Account created (or already exists — continuing).");
  }

  const account = await resolveUserByEmail(email);
  if (!account) {
    console.error(
      `No user found for ${email}. Sign up at /signup or rerun with --create.`
    );
    process.exit(1);
  }

  await db
    .update(user)
    .set({
      emailVerified: true,
      onboardingCompletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(user.id, account.id));

  const membership = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, account.id))
    .limit(1);

  if (!membership[0]) {
    console.error("User has no workspace membership.");
    process.exit(1);
  }

  const workspaceId = membership[0].workspaceId;

  if (membership[0].role !== "owner") {
    await db
      .update(workspaceMembers)
      .set({ role: "owner" })
      .where(eq(workspaceMembers.id, membership[0].id));
  }

  await grantDevBilling(workspaceId, { credits, planKey });

  const [sub, grants] = await Promise.all([
    getActiveSubscriptionByWorkspace(workspaceId),
    getAvailableCreditGrants(workspaceId),
  ]);
  const balance = grants.reduce((sum, g) => sum + g.remaining, 0);

  console.log("\nDev billing enabled:");
  console.log(`  email:      ${email}`);
  console.log(`  password:   ${flags.has("create") || flags.has("repair") ? password : "(your existing password)"}`);
  console.log(`  workspace:  ${workspaceId}`);
  console.log(`  role:       owner`);
  console.log(`  plan:       ${sub?.planKey ?? planKey} (${sub?.status ?? "active"})`);
  console.log(`  credits:    ${balance} remaining (added ${credits})`);
  console.log(
    "\nWhen DEV_ADMIN_EMAIL matches this account, production skips email verification and credit debits."
  );
  console.log("\nLog in at /login and retry preflight / plan generation.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
