import { eq, inArray, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { db } from "@/server/db";
import { user, workspaceMembers, workspaces } from "@/server/db/schema";
import {
  grantTesterEntitlement,
  listActiveTesterEntitlements,
  type TesterEntitlementMetadata,
} from "@/server/repositories/entitlements";
import { getWorkspaceForUser } from "@/server/repositories/workspace";
import { getUserByEmail } from "@/server/repositories/user";

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);

    const entitlements = await listActiveTesterEntitlements();
    if (entitlements.length === 0) {
      return NextResponse.json({ testers: [] });
    }

    const workspaceIds = entitlements.map((entry) => entry.workspaceId);
    const [workspaceRows, ownerRows] = await Promise.all([
      db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          slug: workspaces.slug,
        })
        .from(workspaces)
        .where(inArray(workspaces.id, workspaceIds)),
      db
        .select({
          workspaceId: workspaceMembers.workspaceId,
          email: user.email,
          name: user.name,
        })
        .from(workspaceMembers)
        .innerJoin(user, eq(workspaceMembers.userId, user.id))
        .where(
          and(
            inArray(workspaceMembers.workspaceId, workspaceIds),
            eq(workspaceMembers.role, "owner")
          )
        ),
    ]);

    const workspaceById = new Map(workspaceRows.map((row) => [row.id, row]));
    const ownerByWorkspaceId = new Map(
      ownerRows
        .filter((row) => row.workspaceId)
        .map((row) => [row.workspaceId, row])
    );

    const testers = entitlements.map((entry) => {
      const workspace = workspaceById.get(entry.workspaceId);
      const owner = ownerByWorkspaceId.get(entry.workspaceId);
      const metadata = (entry.metadata ?? {}) as TesterEntitlementMetadata;

      return {
        id: entry.id,
        workspaceId: entry.workspaceId,
        workspaceName: workspace?.name ?? "—",
        workspaceSlug: workspace?.slug ?? "—",
        ownerEmail: owner?.email ?? "—",
        ownerName: owner?.name ?? null,
        notes: metadata.notes ?? null,
        grantedByEmail: metadata.grantedByEmail ?? null,
        expiresAt: entry.expiresAt?.toISOString() ?? null,
        createdAt: entry.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ testers });
  } catch (error) {
    return handleApiError(error, "admin.testers.GET");
  }
}

const grantSchema = z.object({
  email: z.string().email(),
  notes: z.string().trim().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  try {
    const { user: ownerUser } = await requirePlatformOwner(request);
    const body = grantSchema.parse(await request.json());

    const account = await getUserByEmail(body.email);
    if (!account) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const workspace = await getWorkspaceForUser(account.id);
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found for user" }, { status: 404 });
    }

    const entitlement = await grantTesterEntitlement({
      workspaceId: workspace.id,
      grantedByUserId: ownerUser.id,
      grantedByEmail: ownerUser.email ?? undefined,
      notes: body.notes,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    });

    return NextResponse.json({
      tester: {
        id: entitlement.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspaceSlug: workspace.slug,
        ownerEmail: account.email,
        ownerName: account.name,
        notes: body.notes ?? null,
        grantedByEmail: ownerUser.email ?? null,
        expiresAt: entitlement.expiresAt?.toISOString() ?? null,
        createdAt: entitlement.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error, "admin.testers.POST");
  }
}
