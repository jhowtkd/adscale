import { createHash } from "node:crypto";
import type { ArtifactProposalPayload } from "@/lib/assistant/artifact-version";

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function canonicalProposalPayloadDigest(
  payload: Extract<ArtifactProposalPayload, { type: "plan_revision" }>
): string {
  return createHash("sha256")
    .update(
      stable({
        type: payload.type,
        schemaVersion: payload.schemaVersion,
        summary: payload.summary,
        proposedSnapshot: payload.proposedSnapshot,
        changes: payload.changes,
        writes: payload.writes,
      })
    )
    .digest("hex");
}
