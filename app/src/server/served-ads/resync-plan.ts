/**
 * Plano puro da ressincronização (ICE-01B): parsing sem IO, para o dry-run
 * e os erros de uso funcionarem sem ambiente — só --apply toca banco e API.
 */

/** Janelas autorizadas: ressincronizar além delas é erro, sem efeito. */
export const AUTHORIZED_RESYNC_WINDOWS = [7, 30, 90] as const;
export type ResyncWindow = (typeof AUTHORIZED_RESYNC_WINDOWS)[number];

export interface ResyncPlan {
  workspaceId: string;
  windows: ResyncWindow[];
  connectionId?: string;
  dryRun: boolean;
}

export type ResyncArgsParse = { ok: true; plan: ResyncPlan } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseResyncArgs(argv: string[]): ResyncArgsParse {
  let workspaceId: string | undefined;
  let windowsRaw: string | undefined;
  let connectionId: string | undefined;
  let dryRun = true;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--workspace") workspaceId = argv[++i];
    else if (arg === "--windows") windowsRaw = argv[++i];
    else if (arg === "--connection") connectionId = argv[++i];
    else if (arg === "--apply") dryRun = false;
    else if (arg === "--dry-run") dryRun = true;
    else return { ok: false, error: `unknown_flag:${arg}` };
  }
  if (!workspaceId || !UUID_RE.test(workspaceId)) return { ok: false, error: "workspace_required" };
  if (connectionId && !UUID_RE.test(connectionId)) return { ok: false, error: "connection_invalid" };
  if (!windowsRaw) return { ok: false, error: "windows_required" };
  const windows: ResyncWindow[] = [];
  for (const piece of windowsRaw.split(",")) {
    const trimmed = piece.trim();
    const n = Number(trimmed);
    if (n !== 7 && n !== 30 && n !== 90) return { ok: false, error: `window_unauthorized:${trimmed}` };
    if (!windows.includes(n)) windows.push(n);
  }
  if (windows.length === 0) return { ok: false, error: "windows_required" };
  windows.sort((a, b) => a - b);
  return {
    ok: true,
    plan: { workspaceId, windows, ...(connectionId ? { connectionId } : {}), dryRun },
  };
}
