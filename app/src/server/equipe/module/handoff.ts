import { randomUUID } from "node:crypto";
import { err, ok } from "../domain";
import { HANDOFF_GROUPS, transitionHandoff, readingRun, withReadingRun, type HandoffState, type HandoffItem, type HandoffGroup, type HandoffSource } from "../domain/handoff";
import { HANDOFF_READ_EVENT, HANDOFF_DIAGNOSE_EVENT, HANDOFF_MAX_UPLOADED_IMAGES, type HandoffCommand } from "../handoff/contract";
import { normalizeSource, normalizeInstagram, normalizeSocial, socialHint } from "../handoff/source";
import type { EquipeModuleDeps } from "./ports";
import { appendEvent, scopeOf, transact, type CommandContext, type TxBase } from "./shared";
import { requestTask } from "./task-outbox";

function picked(values: string[], items: HandoffItem[]) {
  return values.map(value => items.find(item => item.value === value) ?? { id: randomUUID(), value, origin: "user" as const });
}

/** An image of this workspace that can stand as the brand logo. Only a managed copy (key) is usable; the caller checks it. */
async function uploadedLogoItem(deps: EquipeModuleDeps, ctx: CommandContext, id: string): Promise<HandoffItem | null> {
  const asset = await deps.gateway.getAsset(id);
  if (!asset || asset.workspaceId !== ctx.workspaceId || !asset.kind.startsWith("image/")) return null;
  return { id: asset.id, value: `/api/workspace/assets/${asset.id}/file`, origin: "user", key: asset.key };
}

/** An image of this workspace that can stand among the brand images. The caller decides whether a managed copy (key) is required. */
async function uploadedImageItem(deps: EquipeModuleDeps, ctx: CommandContext, id: string): Promise<HandoffItem | null> {
  const asset = await deps.gateway.getAsset(id);
  if (!asset || asset.workspaceId !== ctx.workspaceId || !(asset.kind === "image" || asset.kind.startsWith("image/"))) return null;
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

export function runHandoffCommand(deps: EquipeModuleDeps, base: TxBase, command: HandoffCommand) {
  return transact(deps, base, async ctx => {
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
            logo = await uploadedLogoItem(deps, ctx, p.logo);
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
          const logo = await uploadedLogoItem(deps, ctx, command.payload.logo);
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
            const item = await uploadedImageItem(deps, ctx, id);
            if (!item) return err("invalid_command", "Upload must be an image from this workspace.");
            uploaded.push(item);
          }
          // Older cards sent uploads separately; unspecified uploads remain selected.
          const kept = [...p.kept, ...uploaded.filter(i => !p.kept.includes(i.id) && !p.removed.includes(i.id)).map(i => i.id)];
          const ids = new Set([...(s.captured.images ?? []), ...uploaded].map(i => i.id));
          if (new Set(p.kept).size !== p.kept.length || new Set(p.removed).size !== p.removed.length || [...kept, ...p.removed].some(id => !ids.has(id)) || kept.some(id => p.removed.includes(id)) || new Set([...kept, ...p.removed]).size !== ids.size) return err("invalid_command", "Decide each image once.");
          s.decisions = { ...s.decisions, images: { kept, removed: p.removed, uploaded } };
          s.decisions.needsConfirmation = s.decisions.needsConfirmation?.filter(d => d !== "images");
          delete s.decisions.uploadedImages; // What the card listed is decided; a saved upload it did not list is dropped, not adopted.
          const next = transitionHandoff(s, "images"); if (!next.ok) return next; s = next.value; break;
        }
        case "handoff_attach_image": {
          if (s.step !== "images") return err("invalid_transition", "Upload images while choosing which ones stay.");
          const image = await uploadedImageItem(deps, ctx, command.payload.image);
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
          await ctx.internal.saveHandoffIdentity(scope, row.clientProfileId, { name: identity.name.value, logoAssetKey: identity.logo?.key ?? null,
            brandColors: identity.colors.map(i => i.value), brandFonts: identity.fonts.map(i => i.value) });
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
}
