import { z } from "zod";
import { resolveEquipeProvider } from "../equipe/agents/provider";

const stripeServerKeySchema = z.string().refine((value) => value.startsWith("sk_") || value.startsWith("rk_"), {
  message: "Stripe server key must start with sk_ or rk_",
});

/**
 * Inngest signing key must be a real secret in production. The dev default
 * "local" disables signature verification and lets anyone POST fake jobs.
 */
const inngestSigningKeySchema = z.string().refine((value) => {
  if (process.env.NODE_ENV === "production" && value === "local") return false;
  return true;
}, {
  message: 'INNGEST_SIGNING_KEY must be a real secret in production (got "local")',
});

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  OPENAI_API_KEY: z.string().startsWith("sk-"),
  OPENAI_TEXT_MODEL: z.string().default("gpt-5.6-sol"),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-2-2026-04-21"),
  OPENAI_IMAGE_SUNBURST_PERCENT: z.coerce.number().int().min(0).max(100).default(0),
  OPENAI_IMAGE_SUNBURST_QUALITY: z.enum(["medium", "high", "xhigh", "max"]).default("max"),
  ATLASCLOUD_API_KEY: z.string().min(1).optional(),
  R2_ACCOUNT_ID: z.string(),
  R2_ACCESS_KEY_ID: z.string(),
  R2_SECRET_ACCESS_KEY: z.string(),
  R2_BUCKET: z.string(),
  R2_PUBLIC_BASE_URL: z.string().url(),
  INNGEST_EVENT_KEY: z.string(),
  INNGEST_SIGNING_KEY: inngestSigningKeySchema,
  RESEND_API_KEY: z.string().startsWith("re_"),
  EMAIL_FROM: z.string().min(3),
  APP_URL: z.string().url(),
  MARKETING_URL: z.string().url().optional(),
  STRIPE_SECRET_KEY: stripeServerKeySchema,
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  STRIPE_STARTER_PRICE_ID: z.string().startsWith("price_"),
  STRIPE_GROWTH_PRICE_ID: z.string().startsWith("price_"),
  STRIPE_SCALE_PRICE_ID: z.string().startsWith("price_"),
  STRIPE_SUCCESS_URL: z.string().url(),
  STRIPE_CANCEL_URL: z.string().url(),
  MEM0_API_KEY: z.string().optional(),
  MEM0_ENABLED: z.string().optional(),
  MEM0_USER_PREFIX: z.string().optional(),
  MEM0_ORGANIZATION_ID: z.string().optional(),
  MEM0_PROJECT_ID: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  BETA_ACCESS_CODES: z.string().optional(),
  NOTIFICATION_WEBHOOK_SECRET: z.string().min(16).optional(),
  /**
   * Temporary rollout switch (R-011): steers NEW creative work preparations
   * to the quality-recovery policy. Jobs follow the version frozen in each
   * work's input snapshot, never this live value. Removed after Gate 8.
   */
  CREATIVE_WORK_QUALITY_RECOVERY_ENABLED: z.enum(["true", "false"]).default("false"),
  /**
   * Per-feature pilot allowlists (ICE-05B): comma-separated workspace ids.
   * Non-empty scopes the feature to the listed workspaces; empty keeps the
   * legacy global behavior of the switch. Malformed entries fail closed at
   * resolve time instead of mis-scoping the pilot.
   */
  QUALITY_RECOVERY_PILOT_WORKSPACES: z.string().default(""),
  BRAND_CORTEX_PILOT_WORKSPACES: z.string().default(""),
  /**
   * ADScale Equipe pilot (#544): master switch plus CSV allowlist of
   * workspace ids. Unlike the quality pilot, an empty allowlist enables
   * nobody — see isEquipeEnabledForWorkspace (fails closed).
   */
  EQUIPE_ENABLED: z.enum(["true", "false"]).default("false"),
  EQUIPE_PILOT_WORKSPACES: z.string().default(""),
  /**
   * ADScale Equipe agents (#550, multi-provider #588): model per role.
   * The model id picks the provider (claude-* → Anthropic, muse-* →
   * Meta, anything else → OpenAI). The reviewer must differ from the
   * author models — enforced in superRefine below (a same-model review
   * defeats the purpose).
   */
  EQUIPE_MODEL_STRATEGIST: z.string().min(1).default("claude-opus-5-5"),
  EQUIPE_MODEL_RESEARCH: z.string().min(1).default("muse-spark-1.3-contributor"),
  EQUIPE_MODEL_REVIEWER: z.string().min(1).default("claude-opus-5-5"),
  /**
   * Reasoning level per role (#588). Meta offers `max` on the Standard
   * tier only; Anthropic has no `minimal` — both refused in superRefine.
   */
  EQUIPE_EFFORT_STRATEGIST: z.enum(["minimal", "low", "medium", "high", "xhigh", "max"]).default("high"),
  EQUIPE_EFFORT_RESEARCH: z.enum(["minimal", "low", "medium", "high", "xhigh", "max"]).default("xhigh"),
  EQUIPE_EFFORT_REVIEWER: z.enum(["minimal", "low", "medium", "high", "xhigh", "max"]).default("high"),
  /**
   * Provider keys for the non-OpenAI Equipe roles (#588). Dashboard
   * secrets (render.yaml `sync: false`); required in superRefine only
   * for providers a role actually uses.
   */
  META_MODEL_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  /**
   * Monthly per-account AI budget for Equipe agent work, in USD cents.
   * Prices are provider USD estimates (see agents/ledger.ts), and the
   * window is the current calendar month in America/Sao_Paulo — last
   * month's spend never counts. Generous default; the plan leaves the
   * number open. Past the cap, new agent work refuses and emits an
   * `agent.budget_exceeded` event.
   */
  EQUIPE_AI_MONTHLY_BUDGET_USD_CENTS: z.coerce.number().int().min(0).default(100000),
  /**
   * ADScale Equipe publication (#548): global kill switch for the dispatch.
   * "false" (default) sends nothing — due intents stay held. Both services
   * declare the frozen default; enabling is a deliberate deploy change.
   */
  EQUIPE_PUBLISH_ENABLED: z.enum(["true", "false"]).default("false"),
  /**
   * ADScale Equipe Instagram connection (#548): the Equipe's own app
   * credentials and token encryption key (base64 of 32 bytes, AES-256-GCM
   * `v1:` format shared with the Meta connection). Optional in the schema
   * so deploys without the IG app keep booting; connect/publish fail when
   * missing. Secrets stay out of git (render.yaml `sync: false`).
   */
  EQUIPE_IG_TOKEN_ENCRYPTION_KEY: z.string().min(1).optional(),
  EQUIPE_IG_APP_ID: z.string().min(1).optional(),
  EQUIPE_IG_APP_SECRET: z.string().min(1).optional(),
  /**
   * 3:4 creation switch (ICE-04B): steers NEW 3:4 creations in validated
   * protocols only (see three-four-capability). Reads, downloads and
   * finishing authorized 3:4 works never consult this value.
   */
  CREATIVE_WORK_34_CREATION_ENABLED: z.enum(["true", "false"]).default("false"),
  /** New Peça única snapshots consume the active published Brand Cortex version. */
  BRAND_CORTEX_SINGLE_PIECE_ENABLED: z.enum(["true", "false"]).default("false"),
  STUDIO_PROGRESSIVE_ROLLOUT_PERCENT: z.coerce.number().int().min(0).max(100).default(0),
  /**
   * Task 10: percentage of workspaces with the NEW Studio carousel creation
   * exposed. Both web and worker read the value, but only the authenticated
   * dashboard page uses it (a derived boolean — never the raw percentage).
   * Existing carousel works stay readable when the value returns to zero.
   */
  STUDIO_CAROUSEL_ROLLOUT_PERCENT: z.coerce.number().int().min(0).max(100).default(0),
  /**
   * Task 7: percentage of workspaces with the Studio entry interview exposed.
   * Both web and worker read the value, but only the authenticated dashboard
   * page uses it (a derived boolean — never the raw percentage). Uses the same
   * deterministic bucket as progressive Studio rollout.
   */
  STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT: z.coerce.number().int().min(0).max(100).default(0),
  /** MCP primeira fatia (#356 rev. 2): Bearer por workspace. OAuth+CIMD é a fatia seguinte. */
  MCP_BEARER_ENABLED: z.enum(["true", "false"]).default("false"),
  /**
   * Anúncios veiculados, PR de rotas (#347). Opcionais no schema para não
   * quebrar deploys sem Meta; exigidas no uso (connect/sync falham sem elas).
   */
  META_TOKEN_ENCRYPTION_KEY: z.string().min(1).optional(),
  META_APP_ID: z.string().min(1).optional(),
  META_APP_SECRET: z.string().min(1).optional(),
  /** Sem Meta App (#348 OPEN): Graph mockada determinística. */
  META_GRAPH_MOCK: z.enum(["true", "false"]).default("false"),
  /** Public home interactive island live (#440). */
  PUBLIC_STUDIO_HOME_ENABLED: z.enum(["true", "false"]).default("false"),
  /** Public home import path live (#442/#443). */
  PUBLIC_STUDIO_IMPORT_ENABLED: z.enum(["true", "false"]).default("false"),
  /** Public home reference attachments accepted (#444). */
  PUBLIC_STUDIO_ATTACHMENTS_ENABLED: z.enum(["true", "false"]).default("false"),
}).superRefine((data, ctx) => {
  // Mirror of the rule in src/lib/public-studio-config.ts (the build-time
  // gate in next.config.ts). Keep the two in sync if either changes.
  if (
    !data.PUBLIC_STUDIO_IMPORT_ENABLED ||
    data.PUBLIC_STUDIO_IMPORT_ENABLED === "false"
  ) {
    if (data.PUBLIC_STUDIO_HOME_ENABLED === "true") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PUBLIC_STUDIO_HOME_ENABLED"],
        message:
          "PUBLIC_STUDIO_HOME_ENABLED=true requires PUBLIC_STUDIO_IMPORT_ENABLED=true",
      });
    }
    if (data.PUBLIC_STUDIO_ATTACHMENTS_ENABLED === "true") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PUBLIC_STUDIO_ATTACHMENTS_ENABLED"],
        message:
          "PUBLIC_STUDIO_ATTACHMENTS_ENABLED=true requires PUBLIC_STUDIO_IMPORT_ENABLED=true",
      });
    }
  }
  // Equipe rules (#550, #588), enforced ONLY while the Equipe pilot is
  // on: env validation gates app boot, so an unconditional rule would
  // take the whole app down over a model collision in a feature nobody
  // can reach (e.g. a future OPENAI_TEXT_MODEL change).
  if (data.EQUIPE_ENABLED === "true") {
    // Reviewer (#550): the reviewer must run a different model from the
    // authors — the models that PRODUCE what is reviewed. The strategist
    // orchestrates and never writes the reviewed copy (copy comes from
    // the Studio writer, images from the engine), so it may share the
    // reviewer's model.
    const authorModels: Array<[string, string]> = [
      ["OPENAI_TEXT_MODEL", data.OPENAI_TEXT_MODEL],
      ["EQUIPE_MODEL_RESEARCH", data.EQUIPE_MODEL_RESEARCH],
    ];
    for (const [name, model] of authorModels) {
      if (data.EQUIPE_MODEL_REVIEWER === model) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["EQUIPE_MODEL_REVIEWER"],
          message: `EQUIPE_MODEL_REVIEWER must differ from the author model ${name} (${model})`,
        });
      }
    }
    // Provider keys (#588): the app must not boot without the key of
    // every provider a role uses. (The OpenAI key is schema-required
    // already, so only Meta and Anthropic need a check here.)
    const roleModels = [
      data.EQUIPE_MODEL_STRATEGIST,
      data.EQUIPE_MODEL_RESEARCH,
      data.EQUIPE_MODEL_REVIEWER,
    ];
    const providers = new Set(roleModels.map(resolveEquipeProvider));
    if (providers.has("meta") && !data.META_MODEL_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["META_MODEL_API_KEY"],
        message: "META_MODEL_API_KEY is required while an Equipe role uses a Meta (muse-*) model",
      });
    }
    if (providers.has("anthropic") && !data.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ANTHROPIC_API_KEY"],
        message:
          "ANTHROPIC_API_KEY is required while an Equipe role uses an Anthropic (claude-*) model",
      });
    }
    // Effort/model compatibility (#588), checked per role.
    const roleEfforts: Array<[string, string, string]> = [
      ["EQUIPE_EFFORT_STRATEGIST", data.EQUIPE_MODEL_STRATEGIST, data.EQUIPE_EFFORT_STRATEGIST],
      ["EQUIPE_EFFORT_RESEARCH", data.EQUIPE_MODEL_RESEARCH, data.EQUIPE_EFFORT_RESEARCH],
      ["EQUIPE_EFFORT_REVIEWER", data.EQUIPE_MODEL_REVIEWER, data.EQUIPE_EFFORT_REVIEWER],
    ];
    for (const [effortKey, model, effort] of roleEfforts) {
      if (effort === "max" && model.endsWith("-contributor")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [effortKey],
          message: "max reasoning is only available on the Meta Standard tier",
        });
      }
      if (effort === "minimal" && resolveEquipeProvider(model) === "anthropic") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [effortKey],
          message: "minimal reasoning is not an Anthropic effort level",
        });
      }
    }
  }
});

const parsed = envSchema.safeParse(process.env);

export const env: z.infer<typeof envSchema> = parsed.success
  ? parsed.data
  : new Proxy({} as z.infer<typeof envSchema>, {
      get(_, key: string) {
        const issue = parsed.error.issues.find((i) => i.path[0] === key);
        if (issue) {
          if (process.env.NODE_ENV === "test") {
            return undefined;
          }
          throw new Error(`Env validation failed for ${key}: ${issue.message}`);
        }
        return process.env[key];
      },
    });
