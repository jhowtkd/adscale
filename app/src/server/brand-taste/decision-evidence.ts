import type { OutputDecisionEvent } from "../db/schema";

export function outputDecisionContexts(event: Pick<OutputDecisionEvent, "creativeWorkOutputId" | "derivationId" | "equipeEventId" | "idempotencyKey" | "contextSnapshot">): string[] {
  const keys: string[] = [];
  if (event.creativeWorkOutputId) keys.push(`output:${event.creativeWorkOutputId}`);
  if (event.derivationId) keys.push(`derivation:${event.derivationId}`);
  if (event.equipeEventId) keys.push(`equipe_event:${event.equipeEventId}`);
  if (event.contextSnapshot.operationId) keys.push(`operation:${event.contextSnapshot.operationId}`);
  if (event.contextSnapshot.itemId) keys.push(`item:${event.contextSnapshot.itemId}`);
  const selection = /^selection-decision:([^:]+):/.exec(event.idempotencyKey ?? "");
  if (selection) keys.push(`selection:${selection[1]}`);
  return keys;
}

/** Overlapping Peça/Item/decision identities are one source, including transitive links. */
export function countIndependentDecisionContexts(rows: readonly (readonly string[])[]): number {
  const groups: Set<string>[] = [];
  for (const row of rows) {
    if (!row.length) continue;
    const group = new Set(row);
    for (let index = groups.length - 1; index >= 0; index--) {
      if (row.some(key => groups[index].has(key))) {
        for (const key of groups[index]) group.add(key);
        groups.splice(index, 1);
      }
    }
    groups.push(group);
  }
  return groups.length;
}
