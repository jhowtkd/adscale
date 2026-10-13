import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { equipeAccounts, equipeEvents } from "../db/equipe-schema";
import { validateDecisionAuthor, type DecisionAuthor } from "./output-decision-author";

export async function verifyDecisionAuthor(input: DecisionAuthor & {
  workspaceId: string;
  clientProfileId?: string | null;
}, userId: string | null): Promise<void> {
  const errors = validateDecisionAuthor(input, userId);
  if (errors.length) throw new Error(`Invalid decision author: ${errors.join(", ")}`);
  if (input.authorType !== "equipe_actor") return;
  if (!input.clientProfileId) throw new Error("Equipe decision requires a brand");
  const [event] = await db.select({
    actorType: equipeEvents.actorType, actorId: equipeEvents.actorId,
    actorRole: equipeEvents.actorRole, eventType: equipeEvents.eventType,
  }).from(equipeEvents).innerJoin(equipeAccounts, and(
    eq(equipeAccounts.id, equipeEvents.accountId),
    eq(equipeAccounts.workspaceId, input.workspaceId),
    eq(equipeAccounts.clientProfileId, input.clientProfileId),
  )).where(and(
    eq(equipeEvents.id, input.equipeEventId!), eq(equipeEvents.workspaceId, input.workspaceId),
  )).limit(1);
  if (!event || !["client_person", "staff"].includes(event.actorType) ||
      !event.eventType.trim() || event.actorId !== input.actorId || event.actorRole !== input.actorRole) {
    throw new Error("Equipe decision author does not match a typed event in this brand/workspace");
  }
}
