import "server-only";
import { createHash } from "node:crypto";

/**
 * Parent binding for stale-claim detection: the claim recomputes this from
 * the live parent row and refuses when it differs from the hash read with
 * the completed output (a late event for a superseded parent stops here).
 */
export function artRefinementParentHash(parent: {
  id: string;
  updatedAt: Date | string;
  outputKey: string | null;
}): string {
  const updatedAt = parent.updatedAt instanceof Date ? parent.updatedAt.toISOString() : parent.updatedAt;
  return createHash("sha256")
    .update(`${parent.id}:${updatedAt}:${parent.outputKey ?? ""}`)
    .digest("hex");
}
