import { z } from "zod";
import { semanticDigest } from "./semantic-review-evaluation";

const approvalSchema = z.object({
  reference: z.string().url().max(2048).refine((value) => { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.hash && !value.includes("?"); }),
  authorizedBy: z.string().trim().min(1).max(200), approvedAt: z.string().datetime(), expiresAt: z.string().datetime(),
  purpose: z.literal("blind_semantic_review_export"), workspaceId: z.string().uuid(),
  clientProfileIds: z.array(z.string().uuid()).min(1).max(100), reviewIds: z.array(z.string().uuid()).min(1).max(100),
  planHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export function validateSemanticExportApproval(raw: unknown, workspaceId: string, planHash: string, reviewIds: string[], now: Date) {
  const approval = approvalSchema.parse(raw);
  const approved = Date.parse(approval.approvedAt), expires = Date.parse(approval.expiresAt);
  if (!Number.isFinite(now.getTime()) || approved > now.getTime() || expires <= now.getTime() || expires <= approved || expires - approved > 14 * 86_400_000
    || approval.workspaceId !== workspaceId || approval.planHash !== planHash
    || new Set(approval.reviewIds).size !== approval.reviewIds.length || new Set(approval.clientProfileIds).size !== approval.clientProfileIds.length
    || semanticDigest([...approval.reviewIds].sort()) !== semanticDigest([...reviewIds].sort())) throw new Error("invalid_export_authorization");
  return approval;
}

