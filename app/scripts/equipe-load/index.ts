// Entry point: parse the bootstrap flags, set process.env BEFORE any server
// module loads (env.ts validates at import), enforce the safety guards,
// then run.

import { preparseBootstrap } from "./config";
import { assertSafeToWrite } from "./guards";

const boot = preparseBootstrap(process.argv.slice(2));

if (!boot.databaseUrl) {
  console.error("equipe-load: set --database-url or EQUIPE_LOAD_DATABASE_URL");
  process.exit(2);
}

// Server modules validate env at import; writes only ever go to the guarded
// database below. Dummy secrets: the harness makes no real network calls
// (fake publisher, fake model client, in-memory notification sink).
process.env.DATABASE_URL = boot.databaseUrl;
const dummies: Record<string, string> = {
  BETTER_AUTH_SECRET: "equipe-load-throwaway-secret-00000000",
  BETTER_AUTH_URL: "http://localhost:3000",
  OPENAI_API_KEY: "sk-equipe-load-no-network",
  R2_ACCOUNT_ID: "load",
  R2_ACCESS_KEY_ID: "load",
  R2_SECRET_ACCESS_KEY: "load",
  R2_BUCKET: "load",
  R2_PUBLIC_BASE_URL: "http://localhost:55435/load",
  INNGEST_EVENT_KEY: "equipe-load-no-network",
  INNGEST_SIGNING_KEY: "local",
  RESEND_API_KEY: "re_equipe_load_no_network",
  EMAIL_FROM: "load@example.test",
  APP_URL: "http://localhost:3000",
  STRIPE_SECRET_KEY: "sk_test_equipe_load_throwaway_000",
  STRIPE_WEBHOOK_SECRET: "whsec_equipe_load_throwaway_000",
  STRIPE_STARTER_PRICE_ID: "price_load_starter",
  STRIPE_GROWTH_PRICE_ID: "price_load_growth",
  STRIPE_SCALE_PRICE_ID: "price_load_scale",
  STRIPE_SUCCESS_URL: "http://localhost:3000/success",
  STRIPE_CANCEL_URL: "http://localhost:3000/cancel",
};
for (const [key, value] of Object.entries(dummies)) {
  process.env[key] ??= value;
}

try {
  const name = assertSafeToWrite({
    target: boot.target,
    databaseUrl: boot.databaseUrl,
    iKnowThisWrites: boot.iKnowThisWrites,
    nodeEnv: process.env.NODE_ENV,
  });
  console.log(`equipe-load: target=${boot.target} database=${name}`);
} catch (error) {
  console.error(`equipe-load: ${error instanceof Error ? error.message : "refused"}`);
  process.exit(2);
}

void import("./run");
