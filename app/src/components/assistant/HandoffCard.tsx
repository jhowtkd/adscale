"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Circle, Globe, LoaderCircle, RotateCcw, TriangleAlert, Upload, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { HANDOFF_GROUPS, HANDOFF_MAX_NETWORKS, HANDOFF_STEPS, allGroupsFinished, defaultNetworkSelection, hasFailedConfirmedInstagram, identityReady, isGroupFinished, type HandoffItem, type HandoffState, type HandoffStep } from "@/server/equipe/domain/handoff";
import { handoffText } from "@/lib/equipe/handoff-copy";
import { postEquipeCommand, EquipeCommandError } from "@/lib/equipe/commands";
import { equipeKeys, useEquipeAccountState } from "@/lib/equipe/use-equipe";
import { assistantThreadQueryKey } from "@/lib/hooks/use-assistant-threads";
import { uploadChatAttachment } from "@/lib/assistant/chat-attachments";

const inputClass = "min-w-0 w-full rounded-lg border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm";
const secondaryClass = "rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-2 text-sm disabled:opacity-40";
const editClass = "rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs text-[var(--text-secondary)] disabled:opacity-40";
const buttonClass = "rounded-full bg-[var(--text-primary)] px-5 py-2 text-sm font-medium text-[var(--surface-base)] disabled:opacity-40";

export default function HandoffCard({ accountId, handoffId, step, threadId, disabled, latest = true }: {
  accountId: string; handoffId: string; step: HandoffStep; threadId?: string | null; disabled?: boolean; latest?: boolean;
}) {
  const t = useTranslations("assistant.handoff");
  const locale = useLocale();
  const query = useEquipeAccountState(accountId);
  const client = useQueryClient();
  const h = query.data?.handoff;
  // The commands are the approver's; anyone else follows the card without controls that are certain to be refused.
  const readOnly = query.data?.viewer?.canDecideHandoff === false;
  const currentStep = h?.step;
  const currentVersion = h?.version;
  useEffect(() => {
    if (currentStep && threadId) void client.invalidateQueries({ queryKey: assistantThreadQueryKey(threadId) });
  }, [client, threadId, currentStep, currentVersion]);
  if (query.isLoading) return <p role="status">{t("loading")}</p>;
  if (query.error || !h) return <button type="button" onClick={() => void query.refetch()}>{t("reload")}</button>;
  if (h.id !== handoffId || h.step !== step || !latest) return <p className="text-xs text-[var(--text-muted)]" data-testid="handoff-history">{t(`steps.${step}`)}</p>;
  return <div className="w-full max-w-[645px]">
    <p className="mb-3 text-sm text-[var(--text-primary)]">{handoffText(h.step, locale)}</p>
    <div className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4 sm:p-[18px]" data-testid="handoff-card">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{t("progress", { step: HANDOFF_STEPS.indexOf(h.step) + 1 })} · {t(`steps.${h.step}`)}</p>
      <div className="mb-4 mt-2 flex gap-1" aria-hidden="true">{HANDOFF_STEPS.slice(0, 6).map((s, i) => <span key={s} className={`h-1 flex-1 rounded-full ${i <= HANDOFF_STEPS.indexOf(h.step) ? "bg-[var(--text-primary)]" : "bg-[var(--border-subtle)]"}`} />)}</div>
      <h3 className={h.step === "reading" || h.step === "images" ? "sr-only" : "mb-3 text-base font-semibold"}>{t(`titles.${h.step}`)}</h3>
      {readOnly ? <p role="note" className="mb-3 text-xs text-[var(--text-muted)]">{t("readOnly")}</p> : null}
      <HandoffForm key={`${h.id}:${h.version}:${h.step === "images" ? h.reading.images?.status : h.step === "networks" ? h.reading.networks?.status : ""}`} h={h} accountId={accountId} disabled={disabled || readOnly} threadId={threadId} />
    </div>
  </div>;
}

function HandoffRow({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return <div className="grid grid-cols-[54px_minmax(0,1fr)_auto] items-center gap-3 border-t border-[var(--border-subtle)] py-3 sm:grid-cols-[78px_minmax(0,1fr)_auto]">
    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</span>
    <div className="min-w-0 text-sm">{children}</div>{action}
  </div>;
}

function ColorSwatches({ colors, showHex = false }: { colors: string[]; showHex?: boolean }) {
  return <div className="flex flex-wrap gap-3">{colors.map((color, i) => <span key={`${color}:${i}`} className="flex flex-col items-center gap-1"><span className={`${showHex ? "h-8 w-8" : "h-6 w-6"} rounded-lg border border-[var(--border-subtle)]`} title={color} style={{ backgroundColor: color }} />{showHex ? <span className="font-mono text-[8px] text-[var(--text-muted)]">{color}</span> : null}</span>)}</div>;
}

function HandoffForm({ h, accountId, disabled, threadId }: { h: HandoffState & { id: string }; accountId: string; disabled?: boolean; threadId?: string | null }) {
  const t = useTranslations("assistant.handoff");
  const locale = useLocale();
  const client = useQueryClient();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"site" | "instagram">(h.source?.kind ?? "site");
  const [source, setSource] = useState(h.source?.value ?? "");
  const [name, setName] = useState(h.decisions.identity?.name.value ?? h.captured.name?.[0]?.value ?? "");
  // A logo uploaded earlier is saved with the handoff (draft), so a reload resumes with it. Without one, a confirmed
  // identity decides, even "no logo"; only before any decision does the first managed logo captured become the start.
  const [logo, setLogo] = useState(h.decisions.uploadedLogo?.id ?? (h.decisions.identity ? h.decisions.identity.logo?.id ?? "" : h.captured.logo?.find(i => i.key)?.id ?? ""));
  const [uploadedLogo, setUploadedLogo] = useState<string | null>(h.decisions.uploadedLogo?.id ?? null);
  const [palette, setPalette] = useState(h.decisions.identity?.paletteChoice ?? h.source?.kind ?? "site");
  const [colors, setColors] = useState((h.decisions.identity?.colors ?? (h.captured.colors ?? []).filter(i => i.origin === palette)).map(i => i.value).join(", "));
  const [colorsEdited, setColorsEdited] = useState(false);
  const currentColors = !colorsEdited && !h.decisions.identity?.colors.length && palette !== "user" && h.decisions.needsConfirmation?.includes("identity") && isGroupFinished(h.reading.colors?.status)
    ? (h.captured.colors ?? []).filter(i => i.origin === palette).map(i => i.value).join(", ") : colors;
  const [fonts, setFonts] = useState((h.decisions.identity?.fonts ?? h.captured.fonts ?? []).map(i => i.value).join(", "));
  const networkItems = [...new Map([...(h.captured.networks ?? []), ...(h.decisions.networks ?? [])].map(i => [i.id, i])).values()];
  // The start must be something the command accepts: at most ten networks and a single Instagram profile.
  const [networks, setNetworks] = useState(h.decisions.networks?.map(i => i.id) ?? defaultNetworkSelection(h.captured.networks ?? []));
  const isInstagram = (id: string) => networkItems.find(i => i.id === id)?.platform === "instagram";
  const networksAtLimit = networks.length >= HANDOFF_MAX_NETWORKS;
  /** Choosing another Instagram profile replaces the selected one; nothing is added past the limit. */
  const toggleNetwork = (item: HandoffItem) => setNetworks(ids => {
    if (ids.includes(item.id)) return ids.filter(id => id !== item.id);
    const base = item.platform === "instagram" ? ids.filter(id => !isInstagram(id)) : ids;
    return base.length >= HANDOFF_MAX_NETWORKS ? ids : [...base, item.id];
  });
  const [handle, setHandle] = useState("");
  // Uploads already decided plus the ones saved since (draft), so a reload does not lose them. New uploads start selected.
  const savedUploads = [...new Map([...(h.decisions.images?.uploaded ?? []), ...(h.decisions.uploadedImages ?? [])].map(i => [i.id, i])).values()];
  const [kept, setKept] = useState(() => h.decisions.images ? [...new Set([...h.decisions.images.kept, ...(h.captured.images ?? []).filter(i => !h.decisions.images!.removed.includes(i.id)).map(i => i.id), ...savedUploads.filter(i => !h.decisions.images!.removed.includes(i.id)).map(i => i.id)])] : [...(h.captured.images ?? []), ...savedUploads].map(i => i.id));
  const [uploaded, setUploaded] = useState(savedUploads);
  const [back, setBack] = useState("identity");
  const [editing, setEditing] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const blocked = Boolean(disabled || pending);
  const toggle = (list: string[], id: string) => list.includes(id) ? list.filter(x => x !== id) : [...list, id];
  const split = (value: string) => value.split(",").map(s => s.trim()).filter(Boolean);
  async function send(type: string, payload: Record<string, unknown> = {}) {
    if (busy.current || disabled) return;
    busy.current = true; setPending(true); setError(null);
    try {
      await postEquipeCommand(accountId, { type, payload: { ...payload, expectedStep: h.step, expectedVersion: h.version } });
      await client.invalidateQueries({ queryKey: equipeKeys(accountId).accountState });
      if (threadId) await client.invalidateQueries({ queryKey: assistantThreadQueryKey(threadId) });
    } catch (e) {
      setError(e instanceof EquipeCommandError && e.code === "reading_limit" ? handoffText("limit", locale) : e instanceof EquipeCommandError && e.code === "stale_version" ? t("stale") : t("error"));
      await client.invalidateQueries({ queryKey: equipeKeys(accountId).accountState });
    } finally { busy.current = false; setPending(false); }
  }
  /** Saves an upload with the handoff before it is selected, so reloading the card does not lose it. */
  async function saveUpload(type: "handoff_attach_logo" | "handoff_attach_image", field: "logo" | "image", assetId: string) {
    await postEquipeCommand(accountId, { type, payload: { [field]: assetId, expectedStep: h.step, expectedVersion: h.version } });
    await client.invalidateQueries({ queryKey: equipeKeys(accountId).accountState });
  }
  async function upload(file: File | undefined, asLogo: boolean) {
    if (!file || busy.current || disabled) return;
    busy.current = true; setPending(true); setError(null);
    try {
      const asset = await uploadChatAttachment(file, h.id);
      if (asLogo) {
        if (!asset.key) throw new Error("unmanaged_logo");
        await saveUpload("handoff_attach_logo", "logo", asset.assetId);
        setLogo(asset.assetId); setUploadedLogo(asset.assetId);
      }
      else {
        if (!asset.key) throw new Error("unmanaged_image");
        await saveUpload("handoff_attach_image", "image", asset.assetId);
        setUploaded(items => [...items, { id: asset.assetId, value: asset.url ?? asset.assetId, origin: "user", key: asset.key }]);
        setKept(ids => [...ids, asset.assetId]);
      }
    } catch (e) {
      const stale = e instanceof EquipeCommandError && e.code === "stale_version";
      setError(stale ? t("stale") : t("uploadError"));
      if (stale) await client.invalidateQueries({ queryKey: equipeKeys(accountId).accountState });
    }
    finally { busy.current = false; setPending(false); }
  }
  const sourceForm = <form onSubmit={e => { e.preventDefault(); void send("handoff_set_source", { kind, value: source }); }} className="flex flex-col gap-3">
    <label className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3"><Globe className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" /><span className="sr-only">{kind === "site" ? t("website") : t("handle")}</span><input className="min-w-0 w-full bg-transparent py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" value={source} required disabled={blocked} onChange={e => setSource(e.target.value)} placeholder={kind === "site" ? "https://sua-marca.com.br" : "@sua_marca"} /></label>
    <p className="text-xs text-[var(--text-muted)]">{t("sourceHint")}</p>
    <div className="flex flex-wrap justify-between gap-2"><button type="button" className={secondaryClass} disabled={blocked} onClick={() => { setKind(kind === "site" ? "instagram" : "site"); setSource(""); }}>{kind === "site" ? t("noSite") : t("useSite")}</button><button className={buttonClass} disabled={blocked || h.readsUsed >= 3} type="submit">{t("read")}</button></div>
  </form>;
  const confirmIdentity = () => void send("handoff_confirm_identity", { name, logo: logo || null, colors: split(currentColors), fonts: split(fonts), paletteChoice: palette });
  const selectedLogo = h.captured.logo?.find(i => i.id === logo) ?? (h.decisions.identity?.logo?.id === logo ? h.decisions.identity.logo : undefined);
  const identityBlocked = !identityReady(h) || !name.trim() || (logo && !selectedLogo?.key && logo !== uploadedLogo) || (palette === "instagram" && !h.decisions.networks?.some(i => i.platform === "instagram"));
  const editButton = (group: string) => <button type="button" className={editClass} aria-label={`${t("edit")} ${t(`groups.${group}`)}`} aria-expanded={editing === group} onClick={() => setEditing(editing === group ? null : group)}>{t("edit")}</button>;
  const paletteChoices = (h.captured.colors?.some(i => i.origin === "site") && h.captured.colors.some(i => i.origin === "instagram")) || h.decisions.needsConfirmation?.includes("identity");
  const selectedImages = [...(h.captured.images ?? []).filter(i => h.decisions.images?.kept.includes(i.id)), ...(h.decisions.images?.uploaded ?? []).filter(i => !h.decisions.images?.removed.includes(i.id))];
  return <div className="flex flex-col gap-3">
    {h.step === "source" ? sourceForm : null}
    {h.step === "reading" ? <>
      <ul className="space-y-4" aria-live="polite">{HANDOFF_GROUPS.map(g => {
        const status = h.reading[g]?.status ?? "pending";
        return <li className="flex flex-wrap items-center gap-2 text-sm" key={g}><span className={`flex h-6 w-6 items-center justify-center rounded-full ${status === "found" ? "bg-[var(--success-bg)] text-[var(--success-text)]" : "bg-[var(--surface-raised)] text-[var(--text-muted)]"}`}>{status === "found" ? <Check className="h-4 w-4" aria-hidden="true" /> : status === "running" ? <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <Circle className="h-4 w-4" aria-hidden="true" />}</span><span>{t(`groups.${g}`)}</span><span className="text-xs text-[var(--text-muted)]">{t(`status.${status}`)}{g === "name" && status === "found" ? ` · ${h.captured.name?.[0]?.value ?? ""}` : ""}</span></li>;
      })}</ul>
      <p className="mt-2 break-all text-xs text-[var(--text-muted)]">{t("sourceKind")} · {h.source?.normalized}</p>
      {Object.values(h.reading).some(g => g?.status === "failed") ? <><p role="alert">{t("failed")}</p><button className={buttonClass} disabled={blocked || h.readsUsed >= 3} onClick={() => void send("handoff_retry_reading")}>{t("retry")}</button></> : null}
    </> : null}
    {hasFailedConfirmedInstagram(h) ? <div className="flex flex-wrap items-center justify-between gap-2"><p role="alert" className="text-sm text-[var(--danger-text)]">{t("instagramFailed")}</p>{h.step !== "reading" ? <button type="button" className={secondaryClass} disabled={blocked || h.readsUsed >= 3} onClick={() => void send("handoff_retry_reading")}>{t("retry")}</button> : null}</div> : null}
    {h.decisions.needsConfirmation?.length ? <p role="status">{t("reconfirm")}</p> : null}
    {h.step === "identity" ? <form onSubmit={e => { e.preventDefault(); confirmIdentity(); }}>
      <fieldset disabled={blocked}>
        <HandoffRow label={t("groups.name")} action={editButton("name")}>{editing === "name" ? <input aria-label={t("groups.name")} className={inputClass} value={name} maxLength={200} required autoFocus onChange={e => setName(e.target.value)} /> : <span className="font-medium">{name || t("nameMissing")}</span>}</HandoffRow>
        <HandoffRow label={t("groups.logo")} action={editButton("logo")}>
          {editing === "logo" ? <div className="space-y-2"><select aria-label={t("groups.logo")} className={inputClass} value={logo} onChange={e => setLogo(e.target.value)}><option value="">{t("skip")}</option>{(h.captured.logo ?? []).map(i => <option key={i.id} value={i.id} disabled={!i.key}>{t(`origin.${i.origin}`)}</option>)}{logo && !h.captured.logo?.some(i => i.id === logo) ? <option value={logo}>{t("origin.user")}</option> : null}</select><label className="block text-xs">{t("uploadLogo")}<input className="mt-1 block w-full text-xs" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void upload(e.target.files?.[0], true)} /></label></div> : logo ? <Image src={h.captured.logo?.find(i => i.id === logo)?.value ?? `/api/workspace/assets/${logo}/file`} alt={t("groups.logo")} width={120} height={44} unoptimized className="h-11 w-[120px] rounded-lg border border-[var(--border-subtle)] object-contain p-2" /> : t("skip")}
        </HandoffRow>
        {h.captured.logo?.some(i => !i.key) || (h.decisions.identity?.logo && !h.decisions.identity.logo.key) ? <p className="text-xs text-[var(--text-muted)]">{t("logoNeedsUpload")}</p> : null}
        <HandoffRow label={t("groups.colors")} action={editButton("colors")}>{editing === "colors" ? <input aria-label={t("groups.colors")} className={inputClass} value={currentColors} placeholder="#333333, #FFFFFF" onChange={e => { setColors(e.target.value); setColorsEdited(true); setPalette("user"); }} /> : currentColors ? <ColorSwatches colors={split(currentColors)} showHex /> : t("skip")}</HandoffRow>
        {paletteChoices ? <div className="my-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--warning-bg)] p-3 text-xs text-[var(--warning-text)]"><span className="flex items-center gap-2"><TriangleAlert className="h-4 w-4" aria-hidden="true" />{t("palette")}</span><div className="flex gap-2">{(["site", "instagram"] as const).map(p => <button type="button" key={p} className="rounded-full border border-current px-3 py-1 aria-pressed:font-semibold aria-pressed:bg-[var(--warning-bg)] disabled:opacity-40" aria-pressed={palette === p} disabled={p === "instagram" && (!h.decisions.networks?.some(i => i.platform === "instagram") || !h.captured.colors?.some(i => i.origin === "instagram"))} onClick={() => { setPalette(p); setColorsEdited(true); setColors((h.captured.colors ?? []).filter(i => i.origin === p).map(i => i.value).join(", ")); }}>{t(`origin.${p}`)}</button>)}</div></div> : null}
        <HandoffRow label={t("groups.fonts")} action={editButton("fonts")}>{editing === "fonts" ? <input aria-label={t("groups.fonts")} className={inputClass} value={fonts} onChange={e => setFonts(e.target.value)} /> : fonts || t("skip")}</HandoffRow>
        <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" className={secondaryClass} disabled={!identityReady(h) || !name.trim()} onClick={() => void send("handoff_confirm_identity", { name, logo: null, colors: [], fonts: [], paletteChoice: "user" })}>{t("skipOptional")}</button><button className={buttonClass} disabled={identityBlocked} type="submit">{t("confirm")}</button></div>
      </fieldset>
    </form> : null}
    {h.step === "networks" ? <form onSubmit={e => { e.preventDefault(); void send("handoff_confirm_networks", { kept: networks, added: handle.trim() ? [{ platform: "instagram", value: handle }] : [] }); }}>
      <fieldset disabled={blocked || !isGroupFinished(h.reading.networks?.status)} className="flex flex-col gap-3">
        {networkItems.map(i => <label key={i.id} className="flex items-center gap-3 rounded-xl bg-[var(--surface-raised)] p-3"><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-base)] text-xs">{i.platform?.slice(0, 2).toUpperCase()}</span><span className="flex-1 text-sm">{i.platform === "instagram" ? `@${i.value}` : i.value}<small className="block text-[var(--text-muted)]">{t(`origin.${i.origin}`)}{i.platform === "instagram" && !h.decisions.networks?.some(n => n.value === i.value) ? ` · ${t("provisional")}` : ""}</small></span><input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--text-primary)]" checked={networks.includes(i.id)} disabled={!networks.includes(i.id) && networksAtLimit && !(i.platform === "instagram" && networks.some(isInstagram))} onChange={() => toggleNetwork(i)} /></label>)}
        {networkItems.length > HANDOFF_MAX_NETWORKS ? <p className="text-xs text-[var(--text-muted)]">{t("networksLimit")}</p> : null}
        <label>{t("addHandle")}<input className={inputClass} value={handle} onChange={e => { setHandle(e.target.value); if (e.target.value.trim()) setNetworks(ids => ids.filter(id => networkItems.find(i => i.id === id)?.platform !== "instagram")); }} placeholder="@sua_marca" /></label>
        {h.source?.kind === "instagram" ? <p className="text-xs text-[var(--text-muted)]">{t("rereadWarning")}</p> : null}
        <div className="mt-2 flex justify-end"><button className={buttonClass} type="submit">{t("confirm")}</button></div>
      </fieldset>
      {!isGroupFinished(h.reading.networks?.status) ? <p role="status">{t("queued")}</p> : null}
    </form> : null}
    {h.step === "images" ? <>
      {!isGroupFinished(h.reading.images?.status) ? <p role="status">{t("queued")}</p> : <>
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-base font-semibold">{t("imageCount", { count: (h.captured.images?.length ?? 0) + uploaded.length })}<span className="ml-2 text-xs font-normal text-[var(--text-muted)]">· {t("removedCount", { count: [...(h.captured.images ?? []), ...uploaded].filter(i => !kept.includes(i.id)).length })}</span></p><label className={`${secondaryClass} flex cursor-pointer items-center gap-2 text-xs`}><Upload className="h-4 w-4" aria-hidden="true" />{t("uploadImages")}<input className="sr-only" disabled={blocked || uploaded.length >= 30} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void upload(e.target.files?.[0], false)} /></label></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{[...(h.captured.images ?? []), ...uploaded].map(i => {
          const selected = kept.includes(i.id);
          return <div key={i.id} className={`relative aspect-square overflow-hidden rounded-xl ${selected ? "" : "opacity-35"}`}><Image src={i.value} alt={i.caption ?? t("groups.images")} fill unoptimized sizes="(min-width: 640px) 120px, 160px" className="object-cover" /><span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-1 font-mono text-[8px] uppercase tracking-wider text-white">{t(`origin.${i.origin}`)}</span><button type="button" role="checkbox" aria-checked={selected} aria-label={`${selected ? t("removeImage") : t("restoreImage")} ${i.caption ?? i.id}`} className="absolute right-1 top-1 rounded-full bg-black/65 p-1.5 text-white focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" disabled={blocked} onClick={() => setKept(toggle(kept, i.id))}>{selected ? <X className="h-3 w-3" aria-hidden="true" /> : <RotateCcw className="h-3 w-3" aria-hidden="true" />}</button></div>;
        })}</div>
        <p className="sr-only">{t("restore")}</p>
        <div className="mt-1 flex flex-wrap justify-end gap-2"><button type="button" className={secondaryClass} disabled={blocked} onClick={() => void send("handoff_confirm_images", { kept: [], removed: [...(h.captured.images ?? []), ...uploaded].map(i => i.id), uploaded: uploaded.map(i => i.id) })}>{t("skipImages")}</button><button className={buttonClass} disabled={blocked} onClick={() => void send("handoff_confirm_images", { kept, removed: [...(h.captured.images ?? []), ...uploaded].filter(i => !kept.includes(i.id)).map(i => i.id), uploaded: uploaded.map(i => i.id) })}>{t("confirm")}</button></div>
      </>}
    </> : null}
    {h.step === "summary" ? <>
      <div className="flex items-center gap-3">{h.decisions.identity?.logo ? <Image src={h.decisions.identity.logo.value} alt={t("groups.logo")} width={96} height={64} unoptimized className="h-16 w-24 rounded-xl border border-[var(--border-subtle)] object-contain p-2" /> : null}<div className="min-w-0"><p className="text-xl font-semibold">{h.decisions.identity?.name.value}</p><p className="break-all text-xs text-[var(--text-muted)]">{h.source?.normalized}</p></div></div>
      <div>
        <HandoffRow label={t("groups.colors")}>{h.decisions.identity?.colors.length ? <ColorSwatches colors={h.decisions.identity.colors.map(i => i.value)} /> : t("skip")}</HandoffRow>
        <HandoffRow label={t("groups.fonts")}>{h.decisions.identity?.fonts.map(i => i.value).join(" · ") || t("skip")}</HandoffRow>
        <HandoffRow label={t("groups.networks")}><div className="flex flex-wrap gap-2">{h.decisions.networks?.map(i => <span key={i.id} className="max-w-full break-all rounded-full bg-[var(--surface-raised)] px-3 py-1 text-xs">{i.platform === "instagram" ? `@${i.value}` : i.value}</span>)}{!h.decisions.networks?.length ? t("skip") : null}</div></HandoffRow>
        <HandoffRow label={t("groups.images")}><div className="flex flex-wrap items-center gap-1">{selectedImages.slice(0, 4).map(i => <Image key={i.id} src={i.value} alt={i.caption ?? t("groups.images")} width={28} height={28} unoptimized className="h-7 w-7 rounded-lg object-cover" />)}<span className="ml-2 text-xs text-[var(--text-muted)]">{t("imageCount", { count: selectedImages.length })}</span></div></HandoffRow>
      </div>
      <p className="text-xs text-[var(--text-muted)]">{t("summaryHint")}</p>
      {correcting ? <div className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 text-xs">{t("correct")}<select className={inputClass} value={back} disabled={blocked} onChange={e => setBack(e.target.value)}>{["source", "identity", "networks", "images"].map(s => <option key={s} value={s}>{t(`steps.${s}`)}</option>)}</select></label><button type="button" disabled={blocked} className={secondaryClass} onClick={() => void send("handoff_back_to", { step: back })}>{t("edit")}</button></div> : null}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className={secondaryClass} disabled={blocked} aria-expanded={correcting} onClick={() => setCorrecting(!correcting)}>{t("correct")}</button><button className={buttonClass} disabled={blocked || !allGroupsFinished(h) || hasFailedConfirmedInstagram(h) || Boolean(h.decisions.identity?.logo && !h.decisions.identity.logo.key)} onClick={() => void send("handoff_confirm_summary")}>{t("finish")}</button></div>
    </> : null}
    {["reading", "identity", "networks", "images"].includes(h.step) ? <details><summary className="cursor-pointer text-xs text-[var(--text-muted)]">{t("correctSource")}</summary><div className="mt-3">{sourceForm}</div></details> : null}
    {h.readsUsed >= 3 && h.step !== "done" ? <p className="text-xs text-[var(--text-muted)]">{handoffText("limit", locale)}</p> : null}
    {error ? <p role="alert" className="text-sm text-[var(--danger-text)]">{error}</p> : null}
  </div>;
}
