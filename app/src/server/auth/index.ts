import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import * as schema from "../db/schema";
import { env } from "../validation/env";
import {
  sendPasswordResetEmail as sendPasswordResetMessage,
  sendVerificationEmail as sendVerificationMessage,
} from "../services/email";
import { buildTrustedOrigins } from "./config";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: buildTrustedOrigins({
    betterAuthUrl: env.BETTER_AUTH_URL,
    appUrl: env.APP_URL,
    isDevelopment: process.env.NODE_ENV !== "production",
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetMessage({ to: user.email, url });
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
      await sendVerificationMessage({ to: user.email, url });
    },
  },
  databaseHooks: {
    user: {
      create: {
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
