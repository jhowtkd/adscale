import { randomUUID } from "node:crypto";
import { err, ok } from "../domain";
import { HANDOFF_GROUPS, transitionHandoff, readingRun, withReadingRun, type HandoffState, type HandoffItem, type HandoffGroup, type HandoffSource } from "../domain/handoff";
import { HANDOFF_READ_EVENT, HANDOFF_DIAGNOSE_EVENT, HANDOFF_MAX_UPLOADED_IMAGES, LIBRARY_ASSEMBLED_EVENT, type HandoffCommand } from "../handoff/contract";
import { normalizeSource, normalizeInstagram, normalizeSocial, socialHint } from "../handoff/source";
import type { EquipeModuleDeps } from "./ports";
import { appendEvent, scopeOf, transact, type CommandContext, type TxBase } from "./shared";
import { requestTask } from "./task-outbox";
import { canAdoptHandoffAsset, handoffLibraryItems, handoffLibraryPages } from "../handoff/library";
import { logger } from "@/lib/logger";

function picked(values: string[], items: HandoffItem[]) {
  return values.map(value => items.find(item => item.value === value) ?? { id: randomUUID(), value, origin: "user" as const });
}

type HandoffOwner = Parameters<typeof canAdoptHandoffAsset>[1];

/** An image this handoff may adopt that can stand as the brand logo. Only a managed copy (key) is usable; the caller checks it. */
async function uploadedLogoItem(deps: EquipeModuleDeps, ctx: CommandContext, id: string, handoff: HandoffOwner): Promise<HandoffItem | null> {
  const asset = await deps.gateway.getAsset(id);
  if (!asset || asset.workspaceId !== ctx.workspaceId || !asset.kind.startsWith("image/") || !canAdoptHandoffAsset(asset, handoff)) return null;
  return { id: asset.id, value: `/api/workspace/assets/${asset.id}/file`, origin: "user", key: asset.key };
}

/** An image this handoff may adopt that can stand among the brand images. The caller decides whether a managed copy (key) is required. */
async function uploadedImageItem(deps: EquipeModuleDeps, ctx: CommandContext, id: string, handoff: HandoffOwner): Promise<HandoffItem | null> {
  const asset = await deps.gateway.getAsset(id);
  if (!asset || asset.workspaceId !== ctx.workspaceId || !(asset.kind === "image" || asset.kind.startsWith("image/")) || !canAdoptHandoffAsset(asset, handoff)) return null;
  return { id: asset.id, value: `/api/workspace/assets/${asset.id}/file`, key: asset.key, origin: "user" };
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
  let libraryItems = 0;
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
          // A failed incremental read of the confirmed Instagram profile is retried alone, in place: the person keeps the step and every decision.
          const confirmedHandle = s.decisions.networks?.find(i => i.platform === "instagram")?.value;
          const failedProfileGroups = command.type === "handoff_retry_reading" && s.source?.kind === "site" && confirmedHandle
            ? (["colors", "images"] as const).filter(group => s.reading[group]?.bySource?.instagram?.status === "failed") : [];
          if (failedProfileGroups.length) {
            s = await startRead(ctx, s, normalizeSource("instagram", confirmedHandle!), failedProfileGroups, false);
            // The images this read brings are new to the person: they decide on them before the summary.
            if (failedProfileGroups.includes("images") && s.decisions.images) {
              s.decisions = { ...s.decisions, needsConfirmation: [...new Set([...(s.decisions.needsConfirmation ?? []), "images" as const])] };
              if (s.step === "summary") { s.decisions.revising = true; const back = transitionHandoff(s, "back", "images"); if (!back.ok) return back; s = back.value; }
            }
            break;
          }
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
            logo = await uploadedLogoItem(deps, ctx, p.logo, row);
            if (!logo) return err("invalid_command", "Choose a captured logo or upload an image.");
          }
          if (logo && !logo.key) return err("invalid_command", "Upload a managed copy before confirming this logo.");
          if (p.paletteChoice === "instagram" && !s.decisions.networks?.some(i => i.platform === "instagram")) return err("invalid_command", "Confirm the Instagram profile before using its palette.");
          s.decisions = { ...s.decisions, identity: { name: picked([p.name], s.captured.name ?? [])[0]!, logo: logo ?? null,
            colors: picked(p.colors, (s.captured.colors ?? []).filter(i => i.origin === p.paletteChoice)), fonts: picked(p.fonts, s.captured.fonts ?? []), paletteChoice: p.paletteChoice } };
          s.decisions.needsConfirmation = s.decisions.needsConfirmation?.filter(d => d !== "identity");
          delete s.decisions.uploadedLogo; // The draft upload is now either the decided logo or dropped.
          const next = transitionHandoff(s, "identity"); if (!next.ok) return next; s = next.value; break;
        }
        case "handoff_attach_logo": {
          if (s.step !== "identity") return err("invalid_transition", "Upload the logo while confirming name, logo, colors and fonts.");
          const logo = await uploadedLogoItem(deps, ctx, command.payload.logo, row);
          if (!logo?.key) return err("invalid_command", "Upload an image with a managed copy.");
          s.decisions = { ...s.decisions, uploadedLogo: logo };
          await appendEvent(ctx, { eventType: "handoff.logo_attached", objectType: "handoff", objectId: row.id, payload: { assetId: logo.id } });
          // A draft upload is not a decision: the version stays and nothing is posted to the conversation.
          await ctx.repos.handoffs.update(scope, row.id, s);
          return ok({ handoffId: row.id, step: s.step, version: s.version });
        }
        case "handoff_confirm_networks": {
          const p = command.payload;
          const kept = p.kept.map(id => [...(s.captured.networks ?? []), ...(s.decisions.networks ?? [])].find(i => i.id === id));
          if (kept.some(i => !i)) return err("invalid_command", "Choose captured networks.");
          const networks = kept as HandoffItem[];
          for (const added of p.added) {
            try {
              const value = added.platform === "instagram" ? normalizeInstagram(added.value) : normalizeSocial(added.platform, added.value);
              networks.push({ id: randomUUID(), value, origin: "user", platform: added.platform });
            } catch { return err("invalid_source", added.platform === "instagram" ? "Provide a public Instagram profile." : socialHint(added.platform)); }
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
            // Nothing the rejected profile supplied may stay in the identity decision: name, logo, colors or fonts.
            const identity = s.decisions.identity;
            const fromInstagram = (item?: HandoffItem | null) => item?.origin === "instagram";
            if (identity && (fromInstagram(identity.name) || fromInstagram(identity.logo) || identity.colors.some(fromInstagram) || identity.fonts.some(fromInstagram))) {
              const name = fromInstagram(identity.name) ? (s.captured.name ?? []).find(i => !fromInstagram(i)) ?? { id: randomUUID(), value: "", origin: "user" as const } : identity.name;
              s.decisions = { ...s.decisions, identity: { ...identity, name, logo: fromInstagram(identity.logo) ? null : identity.logo,
                colors: identity.colors.filter(i => !fromInstagram(i)), fonts: identity.fonts.filter(i => !fromInstagram(i)) } };
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
            const item = await uploadedImageItem(deps, ctx, id, row);
            if (!item) return err("invalid_command", "Upload must be an image uploaded for this brand.");
            uploaded.push(item);
          }
          // Older cards sent uploads separately; unspecified uploads remain selected.
          const kept = [...p.kept, ...uploaded.filter(i => !p.kept.includes(i.id) && !p.removed.includes(i.id)).map(i => i.id)];
          const ids = new Set([...(s.captured.images ?? []), ...uploaded].map(i => i.id));
          if (new Set(p.kept).size !== p.kept.length || new Set(p.removed).size !== p.removed.length || [...kept, ...p.removed].some(id => !ids.has(id)) || kept.some(id => p.removed.includes(id)) || new Set([...kept, ...p.removed]).size !== ids.size) return err("invalid_command", "Decide each image once.");
          if ([...(s.captured.images ?? []), ...uploaded].some(item => kept.includes(item.id) && !item.key)) return err("invalid_command", "Upload a managed copy before confirming this image.");
          s.decisions = { ...s.decisions, images: { kept, removed: p.removed, uploaded } };
          s.decisions.needsConfirmation = s.decisions.needsConfirmation?.filter(d => d !== "images");
          delete s.decisions.uploadedImages; // What the card listed is decided; a saved upload it did not list is dropped, not adopted.
          const next = transitionHandoff(s, "images"); if (!next.ok) return next; s = next.value; break;
        }
        case "handoff_attach_image": {
          if (s.step !== "images") return err("invalid_transition", "Upload images while choosing which ones stay.");
          const image = await uploadedImageItem(deps, ctx, command.payload.image, row);
          if (!image?.key) return err("invalid_command", "Upload an image with a managed copy.");
          const saved = [...(s.decisions.images?.uploaded ?? []), ...(s.decisions.uploadedImages ?? [])];
          // Saving the same upload again (a retry after a lost answer) changes nothing.
          if (saved.some(i => i.id === image.id)) return ok({ handoffId: row.id, step: s.step, version: s.version });
          if (saved.length >= HANDOFF_MAX_UPLOADED_IMAGES) return err("invalid_command", `Upload up to ${HANDOFF_MAX_UPLOADED_IMAGES} images.`);
          s.decisions = { ...s.decisions, uploadedImages: [...(s.decisions.uploadedImages ?? []), image] };
          await appendEvent(ctx, { eventType: "handoff.image_attached", objectType: "handoff", objectId: row.id, payload: { assetId: image.id } });
          // A draft upload is not a decision: the version stays and nothing is posted to the conversation.
          await ctx.repos.handoffs.update(scope, row.id, s);
          return ok({ handoffId: row.id, step: s.step, version: s.version });
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
          libraryItems = handoffLibraryItems(s).length + pages.length;
          await requestTask(ctx, { eventName: HANDOFF_DIAGNOSE_EVENT, data: { handoffId: row.id, readingId: s.readingId } });
          break;
        }
      }
      await appendEvent(ctx, { eventType: "handoff.decided", objectType: "handoff", objectId: row.id, payload: { command: command.type, step: s.step, version: s.version } });
      if (command.type === "handoff_confirm_summary") await appendEvent(ctx, { eventType: LIBRARY_ASSEMBLED_EVENT, objectType: "handoff", objectId: row.id, payload: { items: libraryItems } });
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
