export type DecisionAuthorType = "human" | "agent" | "equipe_actor";

export interface DecisionAuthor {
  authorType?: DecisionAuthorType;
  actorId?: string | null;
  actorRole?: string | null;
  equipeEventId?: string | null;
}

export function isHumanDecisionAuthor(author: { authorType?: string }): boolean {
  return author.authorType === undefined || author.authorType === "human" || author.authorType === "equipe_actor";
}

export function validateDecisionAuthor(author: DecisionAuthor, userId: string | null): string[] {
  const type = author.authorType ?? "human";
  if (!["human", "agent", "equipe_actor"].includes(type)) return ["authorType is invalid"];
  if (type === "equipe_actor") {
    return author.actorId?.trim() && author.actorRole?.trim() && author.equipeEventId
      ? [] : ["Equipe author requires actorId, actorRole and equipeEventId"];
  }
  return userId?.trim() ? [] : ["Application user is required for direct authors"];
}

