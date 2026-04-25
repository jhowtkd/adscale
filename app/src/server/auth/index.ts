import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import * as schema from "../db/schema";
import { env } from "../validation/env";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  socialProviders: {},
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
