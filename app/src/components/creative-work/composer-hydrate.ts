export function composerHydrationAction(input: {
  hydratedId: string | null;
  workId: string;
  status: string;
  initialWorkId?: string;
}): "skip" | "clear_stale_restore" | "hydrate" {
  if (input.hydratedId === input.workId) return "skip";
  if (!input.initialWorkId && input.status !== "draft") return "clear_stale_restore";
  return "hydrate";
}
