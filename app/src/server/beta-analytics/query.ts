export interface OwnerAnalyticsQuery {
  workspaceId?: string;
  sessionId?: string;
  from?: Date;
  to?: Date;
}

export function parseOwnerAnalyticsQuery(
  searchParams: URLSearchParams
): OwnerAnalyticsQuery {
  const workspaceId = searchParams.get("workspaceId")?.trim() || undefined;
  const sessionId = searchParams.get("sessionId")?.trim() || undefined;
  const fromRaw = searchParams.get("from")?.trim();
  const toRaw = searchParams.get("to")?.trim();

  const from = fromRaw ? new Date(fromRaw) : undefined;
  const to = toRaw ? new Date(toRaw) : undefined;

  if (from && Number.isNaN(from.getTime())) {
    throw new Error("invalid_from");
  }
  if (to && Number.isNaN(to.getTime())) {
    throw new Error("invalid_to");
  }

  return { workspaceId, sessionId, from, to };
}
