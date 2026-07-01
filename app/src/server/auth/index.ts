import { betterAuth } from "better-auth";
import "server-only";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins/magic-link";
import { db } from "../db";
import * as schema from "../db/schema";
import { env } from "../validation/env";
import {
  sendPasswordResetEmail as sendPasswordResetMessage,
  sendVerificationEmail as sendVerificationMessage,
  sendMagicLinkEmail as sendMagicLinkMessage,
} from "../services/email";
import { getLocaleByEmail, getUserLocale } from "../repositories/user";
import { buildTrustedOrigins } from "./config";
import { isRateLimitDisabled, isDevOnlyFeatureEnabled } from "@/lib/rate-limit";
import { rememberResetUrl } from "./e2e-reset-store";
import {
  ensureDevAdminEmailVerified,
  isDevAdminEmail,
} from "./dev-admin";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  // Built-in limiter is enabled in production by default (strict 3/10s on /sign-in/email).
  // Disable only for local E2E (TestSprite/Playwright) via E2E_DISABLE_RATE_LIMIT.
  ...(isRateLimitDisabled() ? { rateLimit: { enabled: false } } : {}),
  trustedOrigins: buildTrustedOrigins({
    betterAuthUrl: env.BETTER_AUTH_URL,
    appUrl: env.APP_URL,
    isDevelopment: process.env.NODE_ENV !== "production",
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: process.env.NODE_ENV === "production",
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // E2E only: stash the reset URL so the dev endpoint can hand it to the
      // test runner (no inbox to read in the cloud browser). Hard-gated by
      // NODE_ENV so this never stashes tokens in a production deploy.
      if (isDevOnlyFeatureEnabled()) {
        rememberResetUrl(user.email, url);
      }
      const locale = await getUserLocale(user.id);
      await sendPasswordResetMessage({ to: user.email, url, locale });
    },
  },
  socialProviders: {
    google: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        }
      : undefined,
    github: env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
        }
      : undefined,
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      if (isDevAdminEmail(user.email)) {
        await ensureDevAdminEmailVerified(user.email);
        return;
      }
      const locale = await getUserLocale(user.id);
      await sendVerificationMessage({ to: user.email, url, locale });
    },
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        const locale = await getLocaleByEmail(email);
        await sendMagicLinkMessage({ to: email, url, locale });
      },
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (userData) => {
          const normalizedEmail = userData.email.trim().toLowerCase();
          const base = {
            ...userData,
            email: normalizedEmail,
            locale: userData.locale ?? "pt-BR",
          };

          if (!isDevAdminEmail(normalizedEmail)) {
            return { data: base };
          }

          return {
            data: {
              ...base,
              emailVerified: true,
              onboardingCompletedAt: new Date(),
            },
          };
        },
        after: async (user) => {
          const workspace = await db
            .insert(schema.workspaces)
            .values({
              name: `${user.name || user.email}'s Workspace`,
              slug: `workspace-${user.id.slice(0, 8)}`,
            })
            .returning();
          await db.insert(schema.workspaceMembers).values({
            workspaceId: workspace[0].id,
            userId: user.id,
            role: "owner",
          });
        },
      },
    },
  },
});
