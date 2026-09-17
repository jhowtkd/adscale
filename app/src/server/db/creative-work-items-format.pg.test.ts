/**
 * Pins DB/catalog parity for creative work formats (ICE-04 fix).
 *
 * The `creative_work_items_format_check` constraint once lagged behind the
 * catalog: 3:4 validated in zod but crashed inserts with a 500. Every format
 * the contract accepts must persist.
 *
 * Requires a migrated test database:
 *   DATABASE_URL=postgres://<user>@localhost:5432/adscale_test npm test -- src/server/db/creative-work-items-format.pg.test.ts
 */
import { describe, expect, it } from "vitest";
import { db } from "./index";
import { clientProfiles, creativeWorkItems, user, workspaces } from "./schema";
import { creativeWorkFormatSchema } from "../creative-work/contracts";

const RUN_ID = `fmt-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let seq = 0;

async function createScope(tag: string) {
  seq += 1;
  const name = `t-${RUN_ID}-${tag}-${seq}`;
  const userId = `user-${name}`;
  await db.insert(user).values({
    id: userId,
    name: "FormatParity",
    email: `${name}@example.com`,
    emailVerified: true,
  });
  const [workspace] = await db.insert(workspaces).values({ name, slug: name }).returning();
  const [profile] = await db
    .insert(clientProfiles)
    .values({ workspaceId: workspace.id, name })
    .returning();
  return { userId, workspaceId: workspace.id, clientProfileId: profile.id };
}

describe("creative_work_items format check", () => {
  it.each(creativeWorkFormatSchema.options)("persists format %s", async (format) => {
    const scope = await createScope(`format-${format.replace(":", "x")}`);
    const [work] = await db
      .insert(creativeWorkItems)
      .values({
        workspaceId: scope.workspaceId,
        clientProfileId: scope.clientProfileId,
        createdByUserId: scope.userId,
        title: `format parity ${format}`,
        request: "format parity probe",
        toolKind: "single",
        status: "draft",
        format,
        settings: { targetFormats: [] },
      })
      .returning();
    expect(work.format).toBe(format);
  });
});
