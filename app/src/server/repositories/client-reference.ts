import { eq, and, desc, inArray } from "drizzle-orm";
import { db } from "../db";
import { clientProfiles, clientReferences } from "../db/schema";

export type ClientReferenceKind =
  | "style"
  | "product"
  | "layout"
  | "logo"
  | "negative"
  | "other";

export interface CreateClientProfileInput {
  name: string;
  description?: string;
  visualNotes?: string;
  toneNotes?: string;
  constraints?: string;
}

export interface CreateClientReferenceInput {
  clientProfileId: string;
  assetKey: string;
  label: string;
  kind: ClientReferenceKind;
  notes?: string;
  sourceDerivationId?: string;
}

export async function createClientProfile(
  workspaceId: string,
  data: CreateClientProfileInput
) {
  const result = await db
    .insert(clientProfiles)
    .values({
      workspaceId,
      name: data.name,
      description: data.description ?? null,
      visualNotes: data.visualNotes ?? null,
      toneNotes: data.toneNotes ?? null,
      constraints: data.constraints ?? null,
    })
    .returning();
  return result[0];
}

export async function getClientProfiles(workspaceId: string) {
  return db
    .select()
    .from(clientProfiles)
    .where(eq(clientProfiles.workspaceId, workspaceId))
    .orderBy(desc(clientProfiles.updatedAt));
}

export async function getClientProfile(workspaceId: string, id: string) {
  const result = await db
    .select()
    .from(clientProfiles)
    .where(and(eq(clientProfiles.workspaceId, workspaceId), eq(clientProfiles.id, id)))
    .limit(1);
  return result[0] ?? null;
}

export async function createClientReference(
  workspaceId: string,
  data: CreateClientReferenceInput
) {
  const result = await db
    .insert(clientReferences)
    .values({
      workspaceId,
      clientProfileId: data.clientProfileId,
      assetKey: data.assetKey,
      label: data.label,
      kind: data.kind,
      notes: data.notes ?? null,
      sourceDerivationId: data.sourceDerivationId ?? null,
    })
    .returning();
  return result[0];
}

export async function getClientReferences(
  workspaceId: string,
  clientProfileId: string
) {
  return db
    .select()
    .from(clientReferences)
    .where(
      and(
        eq(clientReferences.workspaceId, workspaceId),
        eq(clientReferences.clientProfileId, clientProfileId)
      )
    )
    .orderBy(desc(clientReferences.createdAt));
}

export async function getClientReferencesByIds(
  workspaceId: string,
  ids: string[]
) {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(clientReferences)
    .where(
      and(
        eq(clientReferences.workspaceId, workspaceId),
        inArray(clientReferences.id, ids)
      )
    )
    .orderBy(desc(clientReferences.createdAt));
}
