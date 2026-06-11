/**
 * Offline + optional live Stripe billing preflight for production go-live.
 *
 * Never prints full secret values — only env var NAMES and masked prefixes.
 *
 * Usage:
 *   npx tsx scripts/preflight-stripe-billing.ts [--offline] [--app-url=https://...]
 *
 * Requires .env.local (or Render Shell env) with STRIPE_* vars for live checks.
 */
import "./load-env";
import { billingPlanKeys, planCreditGrants } from "../src/server/billing/plans";
import { envSchema } from "../src/server/validation/env";
import Stripe from "stripe";

const REQUIRED_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

const STRIPE_ENV_NAMES = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_STARTER_PRICE_ID",
  "STRIPE_GROWTH_PRICE_ID",
  "STRIPE_SCALE_PRICE_ID",
  "STRIPE_SUCCESS_URL",
  "STRIPE_CANCEL_URL",
] as const;

function arg(name: string) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function maskSecret(value: string) {
  if (!value || value.length < 8) return "(unset or too short)";
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function stripeMode(key: string) {
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return "live";
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
  return "unknown";
}

type StepResult = { id: string; ok: boolean; detail: string };

const results: StepResult[] = [];

function record(id: string, ok: boolean, detail: string) {
  results.push({ id, ok, detail });
  const icon = ok ? "PASS" : "FAIL";
  console.log(`[${icon}] ${id}: ${detail}`);
}

async function main() {
  const offline = hasFlag("offline");
  const appUrlOverride = arg("app-url");

  console.log("\nStripe billing preflight");
  console.log(`  mode: ${offline ? "offline (no Stripe API)" : "live API checks enabled"}`);
  console.log("  secrets: masked — only env var NAMES logged in full\n");

  // Step 1: required env var presence (names only)
  for (const name of STRIPE_ENV_NAMES) {
    const raw = process.env[name];
    const present = Boolean(raw && !raw.includes("replace"));
    record(
      `env.${name}`,
      present,
      present ? `set (${maskSecret(raw!)})` : "missing or placeholder"
    );
  }

  // Step 2: zod schema validation
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "env");
      if (key.startsWith("STRIPE_") || key === "APP_URL") {
        record(`schema.${key}`, false, issue.message);
      }
    }
  } else {
    record("schema.stripe", true, "envSchema accepts all STRIPE_* and APP_URL");
  }

  const env = parsed.success ? parsed.data : null;
  const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
  const mode = stripeMode(secretKey);
  record("stripe.mode", mode !== "unknown", `detected ${mode} from STRIPE_SECRET_KEY prefix`);

  // Step 3: plans.ts ↔ env price ID alignment
  if (env) {
    for (const planKey of billingPlanKeys) {
      const envName = `STRIPE_${planKey.toUpperCase()}_PRICE_ID` as const;
      const priceId = env[`STRIPE_${planKey.toUpperCase()}_PRICE_ID` as keyof typeof env] as string;
      record(
        `plans.${planKey}`,
        priceId.startsWith("price_"),
        `${envName}=${priceId} → ${planCreditGrants[planKey]} credits/mo`
      );
    }
  }

  // Step 4: success/cancel URLs should share APP_URL origin
  if (env) {
    const appOrigin = new URL(appUrlOverride ?? env.APP_URL).origin;
    const successOrigin = new URL(env.STRIPE_SUCCESS_URL).origin;
    const cancelOrigin = new URL(env.STRIPE_CANCEL_URL).origin;
    record(
      "urls.success",
      successOrigin === appOrigin,
      `STRIPE_SUCCESS_URL origin ${successOrigin} vs APP_URL ${appOrigin}`
    );
    record(
      "urls.cancel",
      cancelOrigin === appOrigin,
      `STRIPE_CANCEL_URL origin ${cancelOrigin} vs APP_URL ${appOrigin}`
    );
    record(
      "urls.webhook",
      true,
      `register POST ${appOrigin}/api/billing/webhook in Stripe Dashboard`
    );
  }

  // Step 5: webhook events checklist (documentation)
  record(
    "webhook.events",
    true,
    `required events: ${REQUIRED_WEBHOOK_EVENTS.join(", ")}`
  );

  if (offline || !env || secretKey.includes("replace")) {
    summarize();
    return;
  }

  // Step 6: Stripe API — verify prices exist and are recurring
  const stripe = new Stripe(secretKey);
  for (const planKey of billingPlanKeys) {
    const priceId = env[`STRIPE_${planKey.toUpperCase()}_PRICE_ID` as keyof typeof env] as string;
    try {
      const price = await stripe.prices.retrieve(priceId);
      const recurring = price.recurring?.interval === "month";
      const livemode = price.livemode;
      const modeMatch =
        (mode === "live" && livemode) || (mode === "test" && !livemode);
      record(
        `api.price.${planKey}`,
        recurring && modeMatch,
        `${priceId} active=${price.active} livemode=${livemode} interval=${price.recurring?.interval ?? "none"}`
      );
    } catch (err) {
      record(
        `api.price.${planKey}`,
        false,
        `${priceId} retrieve failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Step 7: portal configuration exists (production needs at least one)
  try {
    const configs = await stripe.billingPortal.configurations.list({ limit: 1 });
    record(
      "api.portal",
      configs.data.length > 0,
      configs.data.length > 0
        ? `portal configuration ${configs.data[0].id} found`
        : "no billing portal configuration — create in Stripe Dashboard or run seed:stripe (test only)"
    );
  } catch (err) {
    record(
      "api.portal",
      false,
      `portal list failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  summarize();
}

function summarize() {
  const failed = results.filter((r) => !r.ok);
  console.log("\n--- Summary ---");
  console.log(`  passed: ${results.length - failed.length}/${results.length}`);
  if (failed.length > 0) {
    console.log("  failures:");
    for (const f of failed) {
      console.log(`    - ${f.id}: ${f.detail}`);
    }
    process.exit(1);
  }
  console.log("  all checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
