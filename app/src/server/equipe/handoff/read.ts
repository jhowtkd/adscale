import { z } from "zod";
import { HANDOFF_GROUPS, readingRun, isGroupFinished, type HandoffGroup, type HandoffItem } from "../domain/handoff";
import type { EquipeModuleDeps } from "../module/ports";
import { stableStringify } from "../module/shared";
import { executeCommand } from "../module/commands";
import { authorizeAccountExecution } from "../module/execution-authorization";
import { HANDOFF_READ_EVENT } from "./contract";
import { normalizeInstagram } from "./source";
import type { HandoffReaders, InstagramReadResult, SiteReadResult } from "./readers";
const eventSchema = z.object({ workspaceId: z.string().uuid(), accountId: z.string().uuid(), taskIntentId: z.string().uuid(), readingId: z.string().uuid(),
  source: z.object({ kind: z.enum(["site", "instagram"]), value: z.string(), normalized: z.string() }),
  groups: z.array(z.enum(HANDOFF_GROUPS)).min(1).max(6), runIds: z.record(z.string().uuid()) });
type Step = { run<T>(id: string, fn: () => Promise<T>): Promise<T> };
function capturedGroups(kind: "site" | "instagram", data: SiteReadResult | InstagramReadResult, handle: string, runId: string) {
  const captured: Record<HandoffGroup, HandoffItem[]> = { name: [], logo: [], colors: [], fonts: [], networks: [], images: [] };
  const add = (group: HandoffGroup, value: string, extra: Partial<HandoffItem> = {}) => {
    if (captured[group].length < 30 && !captured[group].some(item => item.value === value)) captured[group].push({ id: `${runId}:${group}:${captured[group].length}`, value, origin: kind, ...extra });
  };
  if (kind === "site") {
    const site = data as SiteReadResult;
    if ((site.statusCode ?? 200) >= 400) throw new Error("site_unavailable");
    const name = site.siteName?.trim() || site.title?.trim();
    if (name) add("name", name.slice(0, 200));
    if (site.branding?.logo) add("logo", site.branding.logo.url, { key: site.branding.logo.key });
    for (const color of site.branding?.colors ?? []) if (/^#[0-9a-f]{6}$/i.test(color)) add("colors", color);
    for (const font of site.branding?.fonts ?? []) add("fonts", font);
    for (const link of site.links) {
      try {
        const url = new URL(link); const host = url.hostname.replace(/^www\./, "");
        const platform = ["instagram", "facebook", "tiktok", "linkedin", "youtube"].find(p => host === `${p}.com`);
        if (platform === "instagram") add("networks", normalizeInstagram(link), { platform });
        else if (platform && ["http:", "https:"].includes(url.protocol)) add("networks", url.toString(), { platform });
      } catch { /* A malformed public link is not a social profile. */ }
    }
    for (const image of site.images.slice(0, 30)) add("images", image.url, { key: image.key, width: image.width, height: image.height });
  } else {
    const instagram = data as InstagramReadResult;
    if (!instagram.exists || instagram.isPrivate) throw new Error(instagram.exists ? "instagram_private" : "instagram_not_found");
    if (instagram.name?.trim()) add("name", instagram.name.trim().slice(0, 200));
    if (instagram.avatarUrl) add("logo", instagram.avatarUrl, { key: instagram.avatarKey });
    for (const color of instagram.colors ?? []) if (/^#[0-9a-f]{6}$/i.test(color)) add("colors", color);
    add("networks", handle, { platform: "instagram" });
    for (const post of instagram.posts.slice(0, 12)) add("images", post.imageUrl, { key: post.key, caption: post.caption, width: post.width, height: post.height });
  }
  return captured;
}
export function createHandoffReadHandler(deps: EquipeModuleDeps, readers: HandoffReaders) {
  return async ({ event, step }: { event: { data: unknown }; step: Step }) => {
    const p = eventSchema.parse(event.data);
    const scope = { workspaceId: p.workspaceId, accountId: p.accountId };
    const claimed = await step.run(`claim-${p.taskIntentId}`, () => deps.uow.run(async (repos) => {
      await repos.accounts.get(scope.workspaceId, scope.accountId, { forUpdate: true });
      const allowed = await authorizeAccountExecution(repos, scope);
      if (!allowed.ok || !(deps.isEnabledForWorkspace?.(p.workspaceId) ?? true)) return false;
      const intent = await repos.taskOutbox.get(scope, p.taskIntentId);
      const [h] = await repos.handoffs.list(scope);
      if (!h || h.step === "done" || h.readingId !== p.readingId || intent?.eventName !== HANDOFF_READ_EVENT || stableStringify(intent.data) !== stableStringify({ readingId: p.readingId, source: p.source, groups: p.groups, runIds: p.runIds })) return false;
      let unfinished = false;
      for (const group of p.groups) {
        const run = readingRun(h.reading[group], p.source.kind);
        if (run?.runId !== p.runIds[group] || run?.taskIntentId !== p.taskIntentId) return false;
        if (!isGroupFinished(run.status)) unfinished = true;
      }
      if (!unfinished) return false;
      if (!(await repos.events.list(scope)).some(e => e.eventType === "handoff.read_claimed" && (e.payload as { taskIntentId?: string })?.taskIntentId === p.taskIntentId)) {
        await repos.events.create(scope, { actorType: "system", actorId: HANDOFF_READ_EVENT, actorRole: "system", eventType: "handoff.read_claimed", payload: { taskIntentId: p.taskIntentId }, occurredAt: deps.clock.now() });
      }
      return true;
    }));
    if (!claimed) return { ignored: true };
    for (const group of p.groups) {
      await step.run(`start-${p.taskIntentId}-${group}`, async () => {
        const result = await executeCommand(deps, { ...scope, actor: { kind: "system", job: HANDOFF_READ_EVENT } }, {
          type: "handoff_record_group", payload: { readingId: p.readingId, runId: p.runIds[group], taskIntentId: p.taskIntentId, group, result: { status: "running", items: [] } },
        });
        if (!result.ok) throw new Error(result.error.code);
        return result.value.data;
      });
    }
    const result = await step.run(`reader-${p.taskIntentId}`, async () => {
      try {
        const data = p.source.kind === "site" ? await readers.site.read(p.source.normalized) : await readers.instagram.profile(p.source.normalized);
        const text = p.source.kind === "site" ? (data as SiteReadResult).markdown : (data as InstagramReadResult).bio;
        return { captured: capturedGroups(p.source.kind, data, p.source.normalized, p.taskIntentId), content: text.trim() ? [{ id: `${p.taskIntentId}:public-content`, value: text.slice(0, 50000), origin: p.source.kind }] : [], error: null };
      } catch (e) {
        const code = e instanceof Error && ["reader_unavailable", "site_unavailable", "instagram_private", "instagram_not_found"].includes(e.message) ? e.message : "reading_failed";
        return { captured: null, content: [], error: code };
      }
    });
    for (const group of p.groups) {
      const items = result.captured?.[group] ?? [];
      await step.run(`record-${p.taskIntentId}-${group}`, async () => {
        const outcome = await executeCommand(deps, { ...scope, actor: { kind: "system", job: HANDOFF_READ_EVENT } }, {
          type: "handoff_record_group", payload: { readingId: p.readingId, runId: p.runIds[group], taskIntentId: p.taskIntentId, group,
            result: { ...(group === p.groups[0] ? { content: result.content } : {}), status: result.error ? "failed" : items.length ? "found" : "not_found", items, ...(result.error ? { error: result.error } : {}) } },
        });
        if (!outcome.ok) throw new Error(outcome.error.code);
        return outcome.value.data;
      });
    }
    return { recorded: p.groups.length };
  };
}
