"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { z } from "zod";
import { collectImageFiles, uploadChatAttachment } from "@/lib/assistant/chat-attachments";
import { apiFetch } from "@/lib/api-client";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
import {
  useAutosaveCreativeWork,
  useCreateCreativeWorkDraft,
  useCreativeWork,
  useCreativeWorkSourceActions,
  usePrepareCreativeWork,
  useRetryOutput,
  useReviseOutput,
  useSelectOutput,
  useDownloadOutputUrl,
  useLinkCreativeWorkCampaign,
  useCreativeWorkCampaigns,
  useTriggerTriplet,
  type CreativeSourceUsage,
  type CreativeWorkItem,
  type CreativeWorkOutput,
  type CreativeWorkQuote,
  type CreativeWorkSource,
} from "@/lib/hooks/use-creative-work";
import { quoteCreativeWork } from "@/server/creative-work/contracts";
import type { CreativeInspiration } from "@/server/application/list-creative-inspirations";

export type ComposerState = "empty" | "saving" | "analyzing" | "ready" | "generating" | "results";
export type ComposerIntent = Exclude<CreativeWorkItem["toolKind"], "social_post">;
type Format = CreativeWorkItem["format"];
type DraftSnapshot = {
  request: string;
  intent: ComposerIntent;
  format: Format;
  settings: { targetFormats: Format[]; formatMode: "auto" | "manual" };
};
type DraftSource = ({ assetId: string } | { templateId: string }) & { usage?: CreativeSourceUsage };

const COMPOSER_INTENTS = new Set<ComposerIntent>([
  "variations",
  "single",
  "format_adaptation",
  "restyle",
]);
const UUID_SCHEMA = z.string().uuid();

function canonicalQuote(intent: ComposerIntent, format: Format, targetFormats: Format[]): CreativeWorkQuote {
  const { unitCount, credits } = quoteCreativeWork({ intent, format, targetFormats });
  return { unitCount, credits };
}

function signature(snapshot: DraftSnapshot) {
  return JSON.stringify(snapshot);
}

function snapshotFromWork(work: Pick<CreativeWorkItem, "request" | "toolKind" | "format" | "settings">): DraftSnapshot {
  return {
    request: work.request.trim(),
    intent: work.toolKind === "social_post" ? "variations" : work.toolKind,
    format: work.format,
    settings: {
      targetFormats: [...work.settings.targetFormats],
      formatMode: work.settings.formatMode ?? "manual",
    },
  };
}

function focusBrandSwitcher() {
  (document.getElementById("active-brand-switcher-inline")
    ?? document.getElementById("active-brand-switcher"))?.focus();
}

const CREATIVE_ANNOUNCEMENT_EVENT = "adscale:creative-announcement";
const CREATIVE_ANNOUNCEMENT_STORAGE_KEY = "adscale_creative_announcement";

export function useCreativeComposer({
  initialWorkId,
  initialIntent = "variations",
  focusComposer = false,
  initialTemplateId,
}: {
  initialWorkId?: string;
  initialIntent?: ComposerIntent;
  focusComposer?: boolean;
  initialTemplateId?: string;
} = {}) {
  const active = useActiveClientProfile();
  const initialTargetFormats: Format[] = initialIntent === "format_adaptation"
    ? ["1:1", "9:16"]
    : [];
  const [workId, setWorkId] = useState<string | null>(initialWorkId ?? null);
  const [request, setRequestState] = useState("");
  const [intent, setIntent] = useState<ComposerIntent>(initialIntent);
  const [format, setFormat] = useState<Format>("4:5");
  const [formatMode, setFormatMode] = useState<"auto" | "manual">("auto");
  const [targetFormats, setTargetFormats] = useState<Format[]>(initialTargetFormats);
  const [quote, setQuote] = useState(() => canonicalQuote(initialIntent, "4:5", initialTargetFormats));
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [brandTrainingSuggestion, setBrandTrainingSuggestion] = useState<string | null>(null);
  const [failedInitialTemplateId, setFailedInitialTemplateId] = useState<string | null>(null);
  const [templateRetryToken, setTemplateRetryToken] = useState(0);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const draftKeyRef = useRef(crypto.randomUUID());
  const workIdRef = useRef(workId);
  const requestRef = useRef(request);
  const intentRef = useRef(intent);
  const formatRef = useRef(format);
  const targetFormatsRef = useRef(targetFormats);
  const formatModeRef = useRef<"auto" | "manual">("auto");
  const hydratedWorkRef = useRef<string | null>(null);
  const lastPersistedRef = useRef<string | null>(null);
  const createInFlightRef = useRef<Promise<string | null> | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const submitGuardRef = useRef(false);
  const didFocusComposerRef = useRef(false);
  const focusFrameRef = useRef<number | null>(null);
  const autoTemplateRef = useRef<string | null>(null);
  const consumedTemplateUrlRef = useRef(false);
  const mountedRef = useRef(false);
  const lifecycleRef = useRef(0);
  const persistOnUnmountRef = useRef<() => Promise<void>>(async () => undefined);
  const revisionAttemptsRef = useRef(new Map<string, { revisionKey: string; revisionAssetId: string | null }>());

  const detailQuery = useCreativeWork(workId);
  const createMutation = useCreateCreativeWorkDraft();
  const autosaveMutation = useAutosaveCreativeWork();
  const prepareMutation = usePrepareCreativeWork();
  const sourceMutation = useCreativeWorkSourceActions();
  const generateMutation = useTriggerTriplet();
  const retryOutputMutation = useRetryOutput();
  const reviseOutputMutation = useReviseOutput();
  const selectOutputMutation = useSelectOutput();
  const linkCampaignMutation = useLinkCreativeWorkCampaign();
  const downloadOutputUrl = useDownloadOutputUrl();
  const campaignQuery = useCreativeWorkCampaigns(Boolean(detailQuery.data?.outputs.length));

  useEffect(() => { workIdRef.current = workId; }, [workId]);
  useEffect(() => { requestRef.current = request; }, [request]);
  useEffect(() => { intentRef.current = intent; }, [intent]);
  useEffect(() => { formatRef.current = format; }, [format]);
  useEffect(() => { targetFormatsRef.current = targetFormats; }, [targetFormats]);

  useEffect(() => {
    const work = detailQuery.data?.work;
    if (!work || hydratedWorkRef.current === work.id) return;
    hydratedWorkRef.current = work.id;
    workIdRef.current = work.id;
    requestRef.current = work.request;
    const hydrated = snapshotFromWork(work);
    intentRef.current = hydrated.intent;
    formatRef.current = hydrated.format;
    targetFormatsRef.current = hydrated.settings.targetFormats;
    formatModeRef.current = hydrated.settings.formatMode;
    lastPersistedRef.current = signature(hydrated);
    /* TanStack Query is the external persisted source for hydration. */
    setRequestState(work.request);
    setIntent(intentRef.current);
    setFormat(work.format);
    setFormatMode(hydrated.settings.formatMode);
    setTargetFormats(work.settings.targetFormats);
    setQuote(canonicalQuote(hydrated.intent, hydrated.format, hydrated.settings.targetFormats));
  }, [detailQuery.data]);

  const captureSnapshot = useCallback((): DraftSnapshot => ({
    request: requestRef.current.trim(),
    intent: intentRef.current,
    format: formatRef.current,
    settings: { targetFormats: [...targetFormatsRef.current], formatMode: formatModeRef.current },
  }), []);

  const enqueueSave = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const run = saveChainRef.current.then(operation, operation);
    saveChainRef.current = run.then(() => undefined, () => undefined);
    return run;
  }, []);

  const exposeWorkId = useCallback((id: string) => {
    if (typeof window === "undefined" || !UUID_SCHEMA.safeParse(id).success) return;
    const params = new URLSearchParams(window.location.search);
    params.set("workId", id);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params}`);
  }, []);

  const consumeInitialTemplateParams = useCallback(() => {
    if (
      typeof window === "undefined"
      || !initialTemplateId
      || consumedTemplateUrlRef.current
    ) return;
    const current = new URLSearchParams(window.location.search);
    if (current.get("templateId") !== initialTemplateId) return;

    const canonical = new URLSearchParams();
    const workIdCandidate = current.get("workId") ?? workIdRef.current;
    if (workIdCandidate && UUID_SCHEMA.safeParse(workIdCandidate).success) {
      canonical.set("workId", workIdCandidate);
    }
    const intentCandidate = current.get("intent");
    if (intentCandidate && COMPOSER_INTENTS.has(intentCandidate as ComposerIntent)) {
      canonical.set("intent", intentCandidate);
    }
    const query = canonical.toString();
    const destination = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", destination);
    consumedTemplateUrlRef.current = true;
  }, [initialTemplateId]);

  const ensureDraft = useCallback((source?: DraftSource, silent = false) => {
    if (workIdRef.current) return Promise.resolve(workIdRef.current);
    if (createInFlightRef.current) {
      const creating = createInFlightRef.current;
      if (!source) return creating;
      // A debounced text autosave may already be creating the draft while an
      // upload finishes. Preserve that newly-arrived source instead of
      // returning the source-less in-flight promise and silently dropping it.
      return creating.then(async (id) => {
        if (!id) return null;
        await sourceMutation.mutateAsync({
          workItemId: id,
          action: "attachSource",
          ...source,
          usage: source.usage ?? "both",
        });
        return id;
      });
    }
    if (!active.activeClientProfileId) {
      focusBrandSwitcher();
      return Promise.resolve(null);
    }
    const snapshot = captureSnapshot();
    if (!snapshot.request && !source) return Promise.resolve(null);

    const promise = enqueueSave(async () => {
      const result = await createMutation.mutateAsync({
        clientProfileId: active.activeClientProfileId!,
        draftKey: draftKeyRef.current,
        ...snapshot,
        ...(source ? { ...source, usage: source.usage ?? "both" } : {}),
      });
      if (!UUID_SCHEMA.safeParse(result.work.id).success) {
        throw new Error("Identificador do trabalho inválido");
      }
      workIdRef.current = result.work.id;
      lastPersistedRef.current = signature(snapshotFromWork(result.work));
      if (!silent && mountedRef.current) {
        setWorkId(result.work.id);
        setQuote(result.quote);
        setAnnouncement("Rascunho salvo");
        exposeWorkId(result.work.id);
      }
      return result.work.id;
    }).catch((cause) => {
      if (!silent && mountedRef.current) {
        setError(cause instanceof Error ? cause.message : "Falha ao salvar rascunho");
      }
      return null;
    }).finally(() => { createInFlightRef.current = null; });
    createInFlightRef.current = promise;
    return promise;
  }, [active.activeClientProfileId, captureSnapshot, createMutation, enqueueSave, exposeWorkId, sourceMutation]);

  const persistSnapshot = useCallback((id: string, snapshot: DraftSnapshot, announce = true) => enqueueSave(async () => {
    const sentSignature = signature(snapshot);
    if (sentSignature === lastPersistedRef.current) return;
    await autosaveMutation.mutateAsync({ workItemId: id, ...snapshot });
    lastPersistedRef.current = sentSignature;
    if (announce && mountedRef.current) setAnnouncement("Alterações salvas");
  }), [autosaveMutation, enqueueSave]);

  const flushAutosave = useCallback(async (): Promise<string | null> => {
    if (initialWorkId && !hydratedWorkRef.current) return null;
    await saveChainRef.current;
    const id = workIdRef.current ?? await ensureDraft();
    if (!id) return null;
    for (;;) {
      await saveChainRef.current;
      const snapshot = captureSnapshot();
      if (signature(snapshot) === lastPersistedRef.current) return id;
      await persistSnapshot(id, snapshot);
    }
  }, [captureSnapshot, ensureDraft, initialWorkId, persistSnapshot]);

  persistOnUnmountRef.current = async () => {
    if (initialWorkId && !hydratedWorkRef.current) return;
    await saveChainRef.current;
    const id = workIdRef.current ?? await ensureDraft(undefined, true);
    if (!id) return;
    const snapshot = captureSnapshot();
    if (signature(snapshot) !== lastPersistedRef.current) {
      await persistSnapshot(id, snapshot, false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    const lifecycle = ++lifecycleRef.current;
    return () => {
      mountedRef.current = false;
      queueMicrotask(() => {
        // StrictMode immediately installs a newer lifecycle before this microtask runs.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if (lifecycleRef.current === lifecycle) void persistOnUnmountRef.current();
      });
    };
  }, []);

  useEffect(() => {
    const receiveAnnouncement = (event: Event) => {
      const message = event instanceof CustomEvent && typeof event.detail === "string"
        ? event.detail
        : null;
      if (!message) return;
      setAnnouncement(message);
      try {
        window.sessionStorage.removeItem(CREATIVE_ANNOUNCEMENT_STORAGE_KEY);
      } catch {
        /* Storage is optional; the event still reaches the mounted composer. */
      }
    };
    window.addEventListener(CREATIVE_ANNOUNCEMENT_EVENT, receiveAnnouncement);
    try {
      const pending = window.sessionStorage.getItem(CREATIVE_ANNOUNCEMENT_STORAGE_KEY);
      if (pending) receiveAnnouncement(new CustomEvent(CREATIVE_ANNOUNCEMENT_EVENT, { detail: pending }));
    } catch {
      /* Storage is optional; future announcements still arrive through the event. */
    }
    return () => window.removeEventListener(CREATIVE_ANNOUNCEMENT_EVENT, receiveAnnouncement);
  }, []);

  const announce = useCallback((message: string) => {
    if (mountedRef.current) setAnnouncement(message);
    if (typeof window === "undefined") return;
    try {
      // Creating the first draft canonicalizes the URL and can remount the
      // composer before an upload finishes. Keep the message until the new
      // live region consumes it, and broadcast for the already-mounted case.
      window.sessionStorage.setItem(CREATIVE_ANNOUNCEMENT_STORAGE_KEY, message);
    } catch {
      /* Storage is optional; the event remains the primary delivery path. */
    }
    window.dispatchEvent(new CustomEvent(CREATIVE_ANNOUNCEMENT_EVENT, { detail: message }));
  }, []);

  useEffect(() => {
    if (!focusComposer || didFocusComposerRef.current || focusFrameRef.current !== null) return;
    const frame = window.requestAnimationFrame(() => {
      focusFrameRef.current = null;
      const composer = composerRef.current;
      if (!composer) return;
      composer.focus();
      didFocusComposerRef.current = true;
    });
    focusFrameRef.current = frame;
  }, [focusComposer]);

  useEffect(() => {
    if (initialWorkId && !hydratedWorkRef.current) return;
    const timer = window.setTimeout(() => {
      if (!workIdRef.current && !active.activeClientProfileId) {
        if (requestRef.current.trim()) focusBrandSwitcher();
        return;
      }
      const save = async () => {
        const id = workIdRef.current ?? await ensureDraft();
        if (id) await persistSnapshot(id, captureSnapshot());
      };
      void save().catch((cause) => setError(cause instanceof Error ? cause.message : "Falha ao salvar"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [active.activeClientProfileId, captureSnapshot, ensureDraft, format, formatMode, initialWorkId, intent, persistSnapshot, request, targetFormats]);

  const setRequest = useCallback((value: string) => {
    requestRef.current = value;
    setRequestState(value);
  }, []);

  const selectIntent = useCallback((next: ComposerIntent) => {
    intentRef.current = next;
    setIntent(next);
    let nextTargets = targetFormatsRef.current;
    if (next === "format_adaptation" && targetFormatsRef.current.length === 0) {
      nextTargets = ["1:1", "9:16"];
      targetFormatsRef.current = nextTargets;
      setTargetFormats(nextTargets);
    }
    setQuote(canonicalQuote(next, formatRef.current, nextTargets));
    if (next !== "restyle") requestAnimationFrame(() => composerRef.current?.focus());
  }, []);

  const toggleTargetFormat = useCallback((value: Format) => {
    setTargetFormats((current) => {
      const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
      targetFormatsRef.current = next;
      setQuote(canonicalQuote(intentRef.current, formatRef.current, next));
      return next;
    });
  }, []);

  const addFiles = useCallback(async (files: FileList | File[] | null) => {
    const images = collectImageFiles(files);
    if (images.length === 0) return;
    if (!workIdRef.current && !active.activeClientProfileId) {
      focusBrandSwitcher();
      return;
    }
    setIsUploading(true);
    setError(null);
    try {
      let hasRestyleContent = Boolean(detailQuery.data?.sources.some((source) =>
        source.usageConfirmed && (source.usage === "content" || source.usage === "both")
      ));
      for (const file of images) {
        const uploaded = await uploadChatAttachment(file);
        const usage: CreativeSourceUsage = intentRef.current === "restyle"
          ? (hasRestyleContent ? "style" : "content")
          : "both";
        if (usage === "content") hasRestyleContent = true;
        const existingId = workIdRef.current;
        if (!existingId) {
          await ensureDraft({ assetId: uploaded.assetId, usage });
        } else {
          await sourceMutation.mutateAsync({
            workItemId: existingId,
            action: "attachSource",
            assetId: uploaded.assetId,
            usage,
          });
        }
      }
      announce(images.length === 1 ? "Arte adicionada" : `${images.length} artes adicionadas`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao adicionar arte");
    } finally {
      setIsUploading(false);
    }
  }, [active.activeClientProfileId, announce, detailQuery.data?.sources, ensureDraft, sourceMutation]);

  const attachDraftSource = useCallback(async (source: DraftSource): Promise<boolean> => {
    if (!workIdRef.current && !active.activeClientProfileId) {
      focusBrandSwitcher();
      return false;
    }
    const existingId = workIdRef.current;
    if (existingId) {
      await sourceMutation.mutateAsync({
        workItemId: existingId,
        action: "attachSource",
        ...source,
        usage: source.usage ?? (intentRef.current === "restyle" ? "style" : "both"),
      });
      return true;
    }
    return Boolean(await ensureDraft(source));
  }, [active.activeClientProfileId, ensureDraft, sourceMutation]);

  const addInspiration = useCallback(async (inspiration: CreativeInspiration) => {
    if (!workIdRef.current && !active.activeClientProfileId) {
      focusBrandSwitcher();
      return;
    }
    setError(null);
    if (!inspiration.templateId && !inspiration.assetId && !inspiration.curatedInspirationId) {
      setError("Inspiração indisponível");
      return;
    }
    try {
      let assetId = inspiration.assetId;
      if (inspiration.curatedInspirationId) {
        const response = await apiFetch(
          `/api/creative-work/inspirations/${inspiration.curatedInspirationId}`,
          { method: "POST", timeoutMs: 60_000 },
        );
        const payload = await response.json().catch(() => ({})) as { assetId?: string; error?: string };
        if (!response.ok || !payload.assetId) {
          throw new Error(payload.error ?? "Falha ao preparar inspiração");
        }
        assetId = payload.assetId;
      }
      selectIntent(inspiration.suggestedIntent === "social_post" ? "variations" : inspiration.suggestedIntent);
      const source: DraftSource = inspiration.templateId
        ? { templateId: inspiration.templateId, usage: inspiration.suggestedIntent === "restyle" ? "style" : "both" }
        : { assetId: assetId!, usage: inspiration.suggestedIntent === "restyle" ? "style" : "both" };
      if (!await attachDraftSource(source)) return;
      setAnnouncement("Inspiração adicionada");
      requestAnimationFrame(() => composerRef.current?.focus());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao adicionar inspiração");
    }
  }, [active.activeClientProfileId, attachDraftSource, selectIntent]);

  const retryInitialTemplate = useCallback(() => {
    if (!initialTemplateId) return;
    autoTemplateRef.current = null;
    setFailedInitialTemplateId(null);
    setError(null);
    setTemplateRetryToken((value) => value + 1);
  }, [initialTemplateId]);

  useEffect(() => {
    if (!initialTemplateId || autoTemplateRef.current === initialTemplateId) return;
    if (active.isLoading) return;
    if (initialWorkId && !hydratedWorkRef.current) return;
    if (detailQuery.data?.sources.some((source) => source.templateId === initialTemplateId)) {
      autoTemplateRef.current = initialTemplateId;
      consumeInitialTemplateParams();
      return;
    }
    if (failedInitialTemplateId === initialTemplateId) return;
    if (!workIdRef.current && !active.activeClientProfileId) {
      focusBrandSwitcher();
      return;
    }

    autoTemplateRef.current = initialTemplateId;
    void attachDraftSource({ templateId: initialTemplateId })
      .then((attached) => {
        if (!attached) {
          autoTemplateRef.current = null;
          if (mountedRef.current) setFailedInitialTemplateId(initialTemplateId);
          return;
        }
        consumeInitialTemplateParams();
        if (mountedRef.current) {
          setFailedInitialTemplateId(null);
          setAnnouncement("Inspiração adicionada");
        }
      })
      .catch((cause) => {
        autoTemplateRef.current = null;
        if (mountedRef.current) {
          setFailedInitialTemplateId(initialTemplateId);
          setError(cause instanceof Error ? cause.message : "Falha ao adicionar inspiração");
        }
      });
  }, [
    active.activeClientProfileId,
    active.isLoading,
    attachDraftSource,
    consumeInitialTemplateParams,
    detailQuery.data?.sources,
    failedInitialTemplateId,
    initialTemplateId,
    initialWorkId,
    templateRetryToken,
  ]);

  const runSourceAction = useCallback(async (action: Parameters<typeof sourceMutation.mutateAsync>[0]): Promise<boolean> => {
    try {
      await sourceMutation.mutateAsync(action);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao atualizar arte");
      return false;
    }
  }, [sourceMutation]);

  const updateSource = useCallback((sourceId: string, usage: CreativeSourceUsage) => {
    if (!workIdRef.current) return Promise.resolve();
    return runSourceAction({ workItemId: workIdRef.current, action: "updateSource", sourceId, usage });
  }, [runSourceAction]);
  const editSource = useCallback((
    sourceId: string,
    content: CreativeWorkSource["contentAnalysis"],
    style: CreativeWorkSource["styleAnalysis"],
  ) => {
    if (!workIdRef.current) return Promise.resolve(false);
    return runSourceAction({ workItemId: workIdRef.current, action: "editSourceAnalysis", sourceId, content, style });
  }, [runSourceAction]);
  const retrySource = useCallback((sourceId: string) => {
    if (!workIdRef.current) return Promise.resolve();
    return runSourceAction({ workItemId: workIdRef.current, action: "retrySource", sourceId });
  }, [runSourceAction]);
  const removeSource = useCallback((sourceId: string) => {
    if (!workIdRef.current) return Promise.resolve();
    return runSourceAction({ workItemId: workIdRef.current, action: "removeSource", sourceId });
  }, [runSourceAction]);

  const generate = useCallback(async () => {
    if (submitGuardRef.current || generateMutation.isPending) return;
    submitGuardRef.current = true;
    setError(null);
    try {
      const id = await flushAutosave();
      if (!id) return;
      const prepared = await prepareMutation.mutateAsync({ workItemId: id });
      setQuote(prepared.quote);
      formatRef.current = prepared.work.format;
      setFormat(prepared.work.format);
      const generated = await generateMutation.mutateAsync(id);
      setBrandTrainingSuggestion(generated.brandTrainingSuggestion);
      setAnnouncement("Geração iniciada");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao gerar");
    } finally {
      submitGuardRef.current = false;
    }
  }, [flushAutosave, generateMutation, prepareMutation]);

  const retryOutput = useCallback(async (outputId: string) => {
    if (!workIdRef.current) return;
    try {
      await retryOutputMutation.mutateAsync({ workItemId: workIdRef.current, outputId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao repetir proposta");
    }
  }, [retryOutputMutation]);

  const approveOutput = useCallback(async (outputId: string) => {
    if (!workIdRef.current) return;
    try {
      await selectOutputMutation.mutateAsync({ workItemId: workIdRef.current, outputId, saveToLibrary: false });
      setAnnouncement("Proposta aprovada");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao aprovar proposta");
    }
  }, [selectOutputMutation]);

  const reviseOutput = useCallback(async (outputId: string, instruction: string, attachment: File | null) => {
    if (!workIdRef.current || !instruction.trim()) return;
    const attemptKey = `${outputId}:${instruction.trim()}:${attachment?.name ?? ""}:${attachment?.size ?? 0}`;
    try {
      let attempt = revisionAttemptsRef.current.get(attemptKey);
      if (!attempt) {
        const uploaded = attachment ? await uploadChatAttachment(attachment) : null;
        attempt = { revisionKey: crypto.randomUUID(), revisionAssetId: uploaded?.assetId ?? null };
        revisionAttemptsRef.current.set(attemptKey, attempt);
      }
      await reviseOutputMutation.mutateAsync({
        workItemId: workIdRef.current,
        outputId,
        instruction: instruction.trim(),
        ...attempt,
      });
      revisionAttemptsRef.current.delete(attemptKey);
      setAnnouncement("Nova versão em geração");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao gerar nova versão");
    }
  }, [reviseOutputMutation]);

  const retryRevisionOutput = useCallback(async (output: CreativeWorkOutput) => {
    if (!workIdRef.current || !output.parentOutputId || !output.revisionInstruction) return;
    try {
      await reviseOutputMutation.mutateAsync({
        workItemId: workIdRef.current,
        outputId: output.parentOutputId,
        revisionKey: crypto.randomUUID(),
        instruction: output.revisionInstruction,
        revisionAssetId: output.revisionAssetId,
      });
      setAnnouncement("Nova tentativa em geração · 5 créditos");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao tentar nova versão");
    }
  }, [reviseOutputMutation]);

  const linkCampaign = useCallback(async (campaignId: string | null) => {
    if (!workIdRef.current) return;
    try {
      await linkCampaignMutation.mutateAsync({ workItemId: workIdRef.current, campaignId });
      setAnnouncement(campaignId ? "Campanha vinculada" : "Campanha removida");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao agrupar em campanha");
    }
  }, [linkCampaignMutation]);

  const detail = detailQuery.data;
  const state = useMemo<ComposerState>(() => {
    if (generateMutation.isPending || detail?.work.status === "generating") return "generating";
    if (detail && (detail.outputs.length > 0 || ["partial", "completed", "failed"].includes(detail.work.status))) return "results";
    if (isUploading || createMutation.isPending || autosaveMutation.isPending || sourceMutation.isPending) return "saving";
    if (prepareMutation.isPending || detail?.sources.some((source) => source.status === "uploaded" || source.status === "analyzing")) return "analyzing";
    if (workId || request.trim() || detail?.sources.length) return "ready";
    return "empty";
  }, [autosaveMutation.isPending, createMutation.isPending, detail, generateMutation.isPending, isUploading, prepareMutation.isPending, request, sourceMutation.isPending, workId]);

  const storedProfileId = detail?.work.clientProfileId;
  const isRestoringWork = Boolean(initialWorkId && !detail);
  const clientProfileId = isRestoringWork ? null : storedProfileId ?? active.activeClientProfileId;
  const brandName = active.profiles.find((profile) => profile.id === storedProfileId)?.name
    ?? (isRestoringWork ? null : active.activeProfile?.name)
    ?? null;
  const sources = detail?.sources ?? [];
  const hasMeaningfulInput = intent === "restyle"
    ? sources.filter((source) => source.status === "ready").length >= 2
    : Boolean(request.trim() || sources.length);
  const canGenerate = Boolean(clientProfileId) && hasMeaningfulInput
    && !sources.some((source) => source.status === "uploaded" || source.status === "analyzing")
    && (intent === "restyle" || !sources.some((source) => source.usageConfirmed === false))
    && !isUploading && !generateMutation.isPending;

  const campaigns = (campaignQuery.data ?? []).filter((campaign) =>
    !campaign.clientProfileId || campaign.clientProfileId === storedProfileId,
  );
  const persistedBrandTrainingSuggestion = detail?.work.identitySnapshot
    && Array.isArray(detail.work.identitySnapshot.assets)
    && detail.work.identitySnapshot.assets.length === 0
    && detail.work.status !== "draft"
    ? "missing_visual_references"
    : null;

  return {
    composerRef: composerRef as RefObject<HTMLTextAreaElement | null>, request, setRequest,
    intent, selectIntent, format, formatMode, setFormat: (value: Format) => {
      formatRef.current = value;
      formatModeRef.current = "manual";
      setFormatMode("manual");
      setFormat(value);
      setQuote(canonicalQuote(intentRef.current, value, targetFormatsRef.current));
    },
    setFormatAuto: () => {
      formatModeRef.current = "auto";
      setFormatMode("auto");
    },
    targetFormats, toggleTargetFormat, state, workId, clientProfileId, brandName,
    sources: detail?.sources ?? [], outputs: detail?.outputs ?? [], quote, canGenerate, isUploading,
    campaignId: detail?.work.campaignId ?? null, campaigns,
    error, announcement, brandTrainingSuggestion: brandTrainingSuggestion ?? persistedBrandTrainingSuggestion,
    requiresBrandSelection: active.requiresSelection,
    retryInitialTemplate: failedInitialTemplateId
      && !detail?.sources.some((source) => source.templateId === failedInitialTemplateId)
      ? retryInitialTemplate
      : null,
    workError: Boolean(workId && detailQuery.isError),
    addFiles, addInspiration, updateSource, editSource, retrySource, removeSource, generate,
    retryOutput, retryRevisionOutput, approveOutput, reviseOutput, linkCampaign,
    downloadOutput: (outputId: string) => {
      if (!workIdRef.current) return;
      window.open(downloadOutputUrl(workIdRef.current, outputId), "_blank", "noopener,noreferrer");
    },
    isRetryingOutput: (outputId: string) => retryOutputMutation.isPending && retryOutputMutation.variables?.outputId === outputId,
    isApprovingOutput: (outputId: string) => selectOutputMutation.isPending && selectOutputMutation.variables?.outputId === outputId,
    isRevisingOutput: (outputId: string) => {
      if (!reviseOutputMutation.isPending) return false;
      if (reviseOutputMutation.variables?.outputId === outputId) return true;
      const current = detail?.outputs.find((output) => output.id === outputId);
      return current?.parentOutputId === reviseOutputMutation.variables?.outputId
        && current.revisionInstruction === reviseOutputMutation.variables?.instruction
        && current.revisionAssetId === reviseOutputMutation.variables?.revisionAssetId;
    },
  };
}

export type CreativeComposerModel = ReturnType<typeof useCreativeComposer>;
export type CreativeComposerViewModel = Omit<CreativeComposerModel, "composerRef">;
