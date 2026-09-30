import { randomUUID } from "node:crypto";
import { err, ok } from "../domain";
import { HANDOFF_GROUPS, transitionHandoff, readingRun, withReadingRun, type HandoffState, type HandoffItem, type HandoffGroup, type HandoffSource } from "../domain/handoff";
import { HANDOFF_READ_EVENT, HANDOFF_DIAGNOSE_EVENT, type HandoffCommand } from "../handoff/contract";
import { normalizeSource, normalizeInstagram } from "../handoff/source";
import type { EquipeModuleDeps } from "./ports";
import { appendEvent, scopeOf, transact, type CommandContext, type TxBase } from "./shared";
import { requestTask } from "./task-outbox";
import { handoffLibraryPages } from "../handoff/library";
import { logger } from "@/lib/logger";

function picked(values: string[], items: HandoffItem[]) {
  return values.map(value => items.find(item => item.value === value) ?? { id: randomUUID(), value, origin: "user" as const });
}

async function startRead(ctx: CommandContext, s: HandoffState, source: HandoffSource, groups: readonly HandoffGroup[], fresh: boolean) {
  const readingId = fresh ? randomUUID() : s.readingId!;
  const runIds = Object.fromEntries(groups.map(group => [group, randomUUID()]));
  const intent = await requestTask(ctx, { eventName: HANDOFF_READ_EVENT, data: { readingId, source, groups, runIds } });
  const reading = fresh ? {} : { ...s.reading };
  for (const group of groups) {
    const previous = reading[group];
    const tracked = previous && !previous.bySource && s.source ? withReadingRun(undefined, s.source.kind, previous) : previous;
    reading[group] = withReadingRun(tracked, source.kind, { runId: runIds[group]!, taskIntentId: intent.id, status: "pending" });
  }
  return { ...s, source: fresh ? source : s.source, readingId, readsUsed: s.readsUsed + 1, reading,
    captured: fresh ? {} : s.captured, decisions: fresh ? {} : s.decisions };
}

export async function runHandoffCommand(deps: EquipeModuleDeps, base: TxBase, command: HandoffCommand) {
  let removedKeys: string[] = [];
  const outcome = await transact(deps, base, async ctx => {
    const scope = scopeOf(ctx);
    const account = await ctx.repos.accounts.get(ctx.workspaceId, ctx.accountId, { forUpdate: true });
    if (!account) return err("unknown_account", "Unknown account.");
    const [row] = await ctx.repos.handoffs.list(scope);
    if (!row) return err("invalid_transition", "No brand handoff for this account.");
    let s: HandoffState = { ...row };
    const before = s.step;
    if (command.type === "handoff_record_group") {
      if (ctx.actor.kind !== "system" || ctx.actor.job !== HANDOFF_READ_EVENT) return err("forbidden_actor", "Only the handoff reading task records groups.");
      const p = command.payload;
      const intent = await ctx.repos.taskOutbox.get(scope, p.taskIntentId);
      if (intent?.eventName !== HANDOFF_READ_EVENT) return ok({ ignored: true });
      const source = (intent.data as { source: HandoffSource }).source;
      const scheduled = intent.data as { readingId: string; groups: string[]; runIds: Record<string, string> };
      const unbilledErrors = source.kind === "site" ? ["reader_unavailable", "invalid_site", "site_dns_or_address", "reading_not_started", "site_provider_dns"] : ["reader_unavailable", "invalid_instagram"];
      if (p.result.status === "failed" && unbilledErrors.includes(p.result.error ?? "")
        && scheduled.readingId === p.readingId && scheduled.groups.includes(p.group) && scheduled.runIds[p.group] === p.runId) {
        const dispatched = (await ctx.repos.events.list(scope, { eventType: `handoff.${source.kind}_dispatched` })).some(e => (e.payload as { taskIntentId?: string }).taskIntentId === p.taskIntentId);
        // A local error on resumption says nothing about an earlier POST. Provider proof belongs to its dispatched attempt.
        if (dispatched === (p.result.error === "site_provider_dns")
          && !(await ctx.repos.events.list(scope, { eventType: "handoff.read_not_billed" })).some(e => (e.payload as { taskIntentId?: string }).taskIntentId === p.taskIntentId)) {
          s.readsUsed = Math.max(0, s.readsUsed - 1);
          await appendEvent(ctx, { eventType: "handoff.read_not_billed", objectType: "handoff", objectId: row.id, payload: { taskIntentId: p.taskIntentId, reason: p.result.error } });
          // The counter is account-wide; even an obsolete source's proven free failure releases its admission.
          await ctx.repos.handoffs.update(scope, row.id, { readsUsed: s.readsUsed });
        }
      }
      const group = readingRun(s.reading[p.group], source.kind);
      if (s.step === "done" || s.readingId !== p.readingId || !group || group.runId !== p.runId || group.taskIntentId !== p.taskIntentId || !["pending", "running"].includes(group.status)) return ok({ ignored: true });
      if ([...p.result.items, ...(p.result.content ?? [])].some(item => item.origin !== source.kind) || (p.result.status === "found" && !p.result.items.length) || (p.result.status !== "found" && p.result.items.length)) return err("invalid_command", "Invalid captured group origin or status.");
      s.reading = { ...s.reading, [p.group]: withReadingRun(s.reading[p.group], source.kind, { runId: group.runId, taskIntentId: group.taskIntentId, status: p.result.status, ...(p.result.error ? { error: p.result.error } : {}) }) };
      if (p.result.status !== "running") s.captured = { ...s.captured, [p.group]: [...(s.captured[p.group] ?? []).filter(item => item.origin !== source.kind), ...p.result.items] };
      if (p.result.content) s.captured.publicContent = [...(s.captured.publicContent ?? []).filter(i => i.origin !== source.kind), ...p.result.content];
      const next = transitionHandoff(s, "progress");
      if (!next.ok) return next;
      s = next.value;
      // An Instagram-only source is already explicitly selected by the person.
      if (s.source?.kind === "instagram" && p.group === "networks" && p.result.status === "found") s.decisions = { ...s.decisions, networks: p.result.items.filter(i => i.platform === "instagram") };
    } else {
      if (ctx.actor.kind !== "client_person" || ctx.actor.role !== "approver") return err("forbidden_actor", "Only the approver decides the brand handoff.");
      const p = command.payload;
      if (p.expectedVersion !== s.version || p.expectedStep !== s.step) return err("stale_version", "The brand step changed. Reload the card.");
      switch (command.type) {
        case "handoff_set_source":
        case "handoff_retry_reading": {
          if (s.step === "done") return err("invalid_transition", "Brand already confirmed.");
          if (s.readsUsed >= 3) return err("reading_limit", "You have used all 3 readings. Your account and captured brand remain available.");
          let source: HandoffSource;
          if (command.type === "handoff_retry_reading") {
            if (s.step !== "reading" || !s.source || !Object.values(s.reading).some(g => g?.status === "failed")) return err("invalid_transition", "No failed reading to retry.");
            source = s.source;
          } else {
            try { source = normalizeSource(command.payload.kind, command.payload.value); }
            catch { return err("invalid_source", "Provide a public website or Instagram handle."); }
          }
          s = await startRead(ctx, s, source, HANDOFF_GROUPS, true);
          const next = transitionHandoff(s, "source"); if (!next.ok) return next; s = next.value;
          break;
        }
        case "handoff_confirm_identity": {
          const p = command.payload;
          let logo = p.logo ? s.captured.logo?.find(i => i.id === p.logo) : null;
          if (p.logo && !logo) {
            const asset = await deps.gateway.getAsset(p.logo);
            if (!asset || asset.workspaceId !== ctx.workspaceId || !asset.kind.startsWith("image/")) return err("invalid_command", "Choose a captured logo or upload an image.");
            logo = { id: asset.id, value: `/api/workspace/assets/${asset.id}/file`, origin: "user", key: asset.key };
          }
          if (logo && !logo.key) return err("invalid_command", "Upload a managed copy before confirming this logo.");
          if (p.paletteChoice === "instagram" && !s.decisions.networks?.some(i => i.platform === "instagram")) return err("invalid_command", "Confirm the Instagram profile before using its palette.");
          s.decisions = { ...s.decisions, identity: { name: picked([p.name], s.captured.name ?? [])[0]!, logo: logo ?? null,
            colors: picked(p.colors, (s.captured.colors ?? []).filter(i => i.origin === p.paletteChoice)), fonts: picked(p.fonts, s.captured.fonts ?? []), paletteChoice: p.paletteChoice } };
          s.decisions.needsConfirmation = s.decisions.needsConfirmation?.filter(d => d !== "identity");
          const next = transitionHandoff(s, "identity"); if (!next.ok) return next; s = next.value; break;
        }
        case "handoff_confirm_networks": {
          const p = command.payload;
          const kept = p.kept.map(id => [...(s.captured.networks ?? []), ...(s.decisions.networks ?? [])].find(i => i.id === id));
          if (kept.some(i => !i)) return err("invalid_command", "Choose captured networks.");
          const networks = kept as HandoffItem[];
          for (const added of p.added) {
            try {
              const value = added.platform === "instagram" ? normalizeInstagram(added.value) : normalizeSource("site", added.value).normalized;
              networks.push({ id: randomUUID(), value, origin: "user", platform: added.platform });
            } catch { return err("invalid_source", "Provide a public social profile."); }
          }
          const instagrams = networks.filter(i => i.platform === "instagram");
          if (instagrams.length > 1) return err("invalid_command", "Confirm at most one Instagram profile.");
          if (s.source?.kind === "instagram" && !instagrams.length) return err("invalid_source", "A public Instagram profile is required without a website.");
          const handle = instagrams[0]?.value;
          const previous = s.decisions.networks?.find(i => i.platform === "instagram")?.value;
          const changed = handle !== previous;
          if (changed && handle && s.readsUsed >= 3) return err("reading_limit", "You have used all 3 readings.");
          if (changed && previous) {
            const rejectedImages = new Set((s.captured.images ?? []).filter(i => i.origin === "instagram").map(i => i.id));
            const needsConfirmation = new Set(s.decisions.needsConfirmation ?? []);
            if (s.decisions.identity?.colors.some(i => i.origin === "instagram")) {
              s.decisions = { ...s.decisions, identity: { ...s.decisions.identity, colors: s.decisions.identity.colors.filter(i => i.origin !== "instagram") } };
              needsConfirmation.add("identity");
            }
            if (s.decisions.images) {
              if ([...s.decisions.images.kept, ...s.decisions.images.removed].some(id => rejectedImages.has(id))) needsConfirmation.add("images");
              s.decisions = { ...s.decisions, images: { ...s.decisions.images, kept: s.decisions.images.kept.filter(id => !rejectedImages.has(id)), removed: s.decisions.images.removed.filter(id => !rejectedImages.has(id)) } };
            }
            s.decisions = { ...s.decisions, needsConfirmation: [...needsConfirmation] };
            s.captured = Object.fromEntries(Object.entries(s.captured).map(([g, items]) => [g, items?.filter(i => i.origin !== "instagram")])) as HandoffState["captured"];
            // Drop only rejected Instagram runs, including pending runs. Site runs remain resumable.
            for (const group of ["colors", "images"] as const) {
              const siteRun = s.reading[group]?.bySource?.site;
              s.reading = { ...s.reading, [group]: siteRun ? withReadingRun(undefined, "site", siteRun) : { runId: randomUUID(), taskIntentId: s.reading[group]!.taskIntentId, status: s.captured[group]?.length ? "found" : "not_found", bySource: {} } };
            }
          }
          if (handle && changed && !(s.source?.kind === "instagram" && s.source.normalized === handle)) {
            if (s.source?.kind === "instagram") {
              s = await startRead(ctx, s, normalizeSource("instagram", handle), HANDOFF_GROUPS, true);
              const next = transitionHandoff(s, "source"); if (!next.ok) return next; s = next.value;
              break;
            }
            s = await startRead(ctx, s, normalizeSource("instagram", handle), ["colors", "images"], false);
            if (s.decisions.images) s.decisions = { ...s.decisions, needsConfirmation: [...new Set([...(s.decisions.needsConfirmation ?? []), "images" as const])] };
          }
          s.decisions = { ...s.decisions, networks };
          const next = transitionHandoff(s, "networks"); if (!next.ok) return next; s = next.value; break;
        }
        case "handoff_confirm_images": {
          const p = command.payload;
          const uploaded: HandoffItem[] = [];
          for (const id of [...new Set(p.uploaded)]) {
            const asset = await deps.gateway.getAsset(id);
            if (!asset || asset.workspaceId !== ctx.workspaceId || !(asset.kind === "image" || asset.kind.startsWith("image/"))) return err("invalid_command", "Upload must be an image from this workspace.");
            uploaded.push({ id, value: `/api/workspace/assets/${id}/file`, key: asset.key, origin: "user" });
          }
          // Older cards sent uploads separately; unspecified uploads remain selected.
          const kept = [...p.kept, ...uploaded.filter(i => !p.kept.includes(i.id) && !p.removed.includes(i.id)).map(i => i.id)];
          const ids = new Set([...(s.captured.images ?? []), ...uploaded].map(i => i.id));
          if (new Set(p.kept).size !== p.kept.length || new Set(p.removed).size !== p.removed.length || [...kept, ...p.removed].some(id => !ids.has(id)) || kept.some(id => p.removed.includes(id)) || new Set([...kept, ...p.removed]).size !== ids.size) return err("invalid_command", "Decide each image once.");
          if ([...(s.captured.images ?? []), ...uploaded].some(item => kept.includes(item.id) && !item.key)) return err("invalid_command", "Upload a managed copy before confirming this image.");
          s.decisions = { ...s.decisions, images: { kept, removed: p.removed, uploaded } };
          s.decisions.needsConfirmation = s.decisions.needsConfirmation?.filter(d => d !== "images");
          const next = transitionHandoff(s, "images"); if (!next.ok) return next; s = next.value; break;
        }
        case "handoff_back_to": {
          s.decisions = { ...s.decisions, revising: true };
          const next = transitionHandoff(s, "back", command.payload.step); if (!next.ok) return next; s = next.value; break;
        }
        case "handoff_confirm_summary": {
          const next = transitionHandoff(s, "summary"); if (!next.ok) return next; s = next.value;
          const identity = s.decisions.identity!;
          const pages = handoffLibraryPages(row, s);
          for (const page of pages) await deps.handoffStorage?.put(page.key, Buffer.from(page.text), page.type);
          await ctx.internal.saveHandoffIdentity(scope, row.clientProfileId, { name: identity.name.value, logoAssetKey: identity.logo?.key ?? null,
            brandColors: identity.colors.map(i => i.value), brandFonts: identity.fonts.map(i => i.value),
            website: s.source?.kind === "site" ? s.source.normalized : null,
            instagramHandle: s.decisions.networks?.find(i => i.platform === "instagram")?.value ?? null,
            socialLinks: (s.decisions.networks ?? []).map(i => ({ platform: i.platform ?? "other", value: i.value, origin: i.origin })) });
          removedKeys = await ctx.internal.materializeHandoffAssets(scope, { ...row, ...s }, pages);
          await requestTask(ctx, { eventName: HANDOFF_DIAGNOSE_EVENT, data: { handoffId: row.id, readingId: s.readingId } });
          break;
        }
      }
      await appendEvent(ctx, { eventType: "handoff.decided", objectType: "handoff", objectId: row.id, payload: { command: command.type, step: s.step, version: s.version } });
    }
    await ctx.repos.handoffs.update(scope, row.id, s);
    if (before !== s.step || command.type !== "handoff_record_group") await appendEvent(ctx, { eventType: "handoff.card", objectType: "handoff", objectId: row.id, payload: { step: s.step } });
    return ok({ handoffId: row.id, step: s.step, version: s.version });
  });
  if (outcome.ok && deps.handoffStorage) {
    for (const key of removedKeys) {
      try { await deps.handoffStorage.delete(key); }
      catch { logger.warn("[handoff] provisional R2 cleanup failed", { key }); }
    }
  }
  return outcome;
}
