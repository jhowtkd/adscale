import { handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { db } from "@/server/db";
import {
  campaigns,
  derivations,
  campaignAssets,
  creativePlans,
  workspaces,
  user as userTable,
} from "@/server/db/schema";
import { and, asc, eq, gt } from "drizzle-orm";

const PAGE_SIZE = 100;
const encoder = new TextEncoder();

async function writeRows<T extends { id: string }>(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  name: string,
  page: (after?: string) => Promise<T[]>,
  project: (row: T) => unknown
) {
  await writer.write(encoder.encode(`,${JSON.stringify(name)}:[`));
  let after: string | undefined;
  let first = true;
  for (;;) {
    const rows = await page(after);
    if (rows.length === 0) break;
    await writer.write(encoder.encode(
      `${first ? "" : ","}${rows.map((row) => JSON.stringify(project(row))).join(",")}`
    ));
    first = false;
    if (rows.length < PAGE_SIZE) break;
    after = rows[rows.length - 1].id;
  }
  await writer.write(encoder.encode("]"));
}

export async function GET(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();

    void db.transaction(async (tx) => {
      const [userData, workspaceData] = await Promise.all([
        tx.select().from(userTable).where(eq(userTable.id, user.id)).limit(1),
        tx.select().from(workspaces).where(eq(workspaces.id, workspace.id)).limit(1),
      ]);
      await writer.write(encoder.encode(JSON.stringify({
        exportedAt: new Date().toISOString(),
        user: {
          id: userData[0]?.id,
          name: userData[0]?.name,
          email: userData[0]?.email,
          createdAt: userData[0]?.createdAt?.toISOString(),
        },
        workspace: {
          id: workspaceData[0]?.id,
          name: workspaceData[0]?.name,
          createdAt: workspaceData[0]?.createdAt?.toISOString(),
        },
      }).slice(0, -1)));

      await writeRows(writer, "campaigns", (after) =>
        tx.select({
          id: campaigns.id,
          name: campaigns.name,
          client: campaigns.client,
          status: campaigns.status,
          generationMode: campaigns.generationMode,
          createdAt: campaigns.createdAt,
          updatedAt: campaigns.updatedAt,
        }).from(campaigns).where(and(
          eq(campaigns.workspaceId, workspace.id),
          after ? gt(campaigns.id, after) : undefined
        )).orderBy(asc(campaigns.id)).limit(PAGE_SIZE),
        (c) => ({
          id: c.id,
          name: c.name,
          client: c.client,
          status: c.status,
          generationMode: c.generationMode,
          createdAt: c.createdAt?.toISOString(),
          updatedAt: c.updatedAt?.toISOString(),
        })
      );

      await writeRows(writer, "derivations", (after) =>
        tx.select({
          id: derivations.id,
          campaignId: derivations.campaignId,
          status: derivations.status,
          format: derivations.format,
          generationMode: derivations.generationMode,
          createdAt: derivations.createdAt,
        }).from(derivations).where(and(
          eq(derivations.workspaceId, workspace.id),
          after ? gt(derivations.id, after) : undefined
        )).orderBy(asc(derivations.id)).limit(PAGE_SIZE),
        (d) => ({
          id: d.id,
          campaignId: d.campaignId,
          status: d.status,
          format: d.format,
          generationMode: d.generationMode,
          createdAt: d.createdAt?.toISOString(),
        })
      );

      await writeRows(writer, "assets", (after) =>
        tx.select({
          id: campaignAssets.id,
          campaignId: campaignAssets.campaignId,
          key: campaignAssets.key,
          role: campaignAssets.role,
          createdAt: campaignAssets.createdAt,
        }).from(campaignAssets).where(and(
          eq(campaignAssets.workspaceId, workspace.id),
          after ? gt(campaignAssets.id, after) : undefined
        )).orderBy(asc(campaignAssets.id)).limit(PAGE_SIZE),
        (a) => ({
          id: a.id,
          campaignId: a.campaignId,
          key: a.key,
          role: a.role,
          createdAt: a.createdAt?.toISOString(),
        })
      );

      await writeRows(writer, "plans", (after) =>
        tx.select({
          id: creativePlans.id,
          campaignId: creativePlans.campaignId,
          strategy: creativePlans.strategy,
          status: creativePlans.status,
          createdAt: creativePlans.createdAt,
        }).from(creativePlans).where(and(
          eq(creativePlans.workspaceId, workspace.id),
          after ? gt(creativePlans.id, after) : undefined
        )).orderBy(asc(creativePlans.id)).limit(PAGE_SIZE),
        (p) => ({
          id: p.id,
          campaignId: p.campaignId,
          strategy: p.strategy,
          status: p.status,
          createdAt: p.createdAt?.toISOString(),
        })
      );
      await writer.write(encoder.encode("}"));
    }, { isolationLevel: "repeatable read", accessMode: "read only" })
      .then(() => writer.close(), (error) => writer.abort(error))
      .catch(() => undefined);

    return new Response(readable, {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    return handleApiError(error, "user.export.GET");
  }
}
