"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { collectImageFiles, uploadChatAttachment } from "@/lib/assistant/chat-attachments";
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
  type CreativeWorkQuote,
} from "@/lib/hooks/use-creative-work";
import { quoteCreativeWork } from "@/server/creative-work/contracts";

export type ComposerState = "empty" | "saving" | "analyzing" | "ready" | "generating" | "results";
export type ComposerIntent = Exclude<CreativeWorkItem["toolKind"], "social_post">;
type Format = CreativeWorkItem["format"];
type DraftSnapshot = {
  request: string;
  intent: ComposerIntent;
  format: Format;
  settings: { targetFormats: Format[] };
};

const DEFAULT_QUOTE: CreativeWorkQuote = { unitCount: 3, credits: 15 };

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
    settings: { targetFormats: [...work.settings.targetFormats] },
  };
}

function focusBrandSwitcher() {
  (document.getElementById("active-brand-switcher-inline")
    ?? document.getElementById("active-brand-switcher"))?.focus();
}

export function useCreativeComposer({ initialWorkId }: { initialWorkId?: string } = {}) {
  const active = useActiveClientProfile();
  const [workId, setWorkId] = useState<string | null>(initialWorkId ?? null);
  const [request, setRequestState] = useState("");
  const [intent, setIntent] = useState<ComposerIntent>("variations");
  const [format, setFormat] = useState<Format>("4:5");
  const [targetFormats, setTargetFormats] = useState<Format[]>([]);
  const [quote, setQuote] = useState(DEFAULT_QUOTE);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const draftKeyRef = useRef(crypto.randomUUID());
  const workIdRef = useRef(workId);
  const requestRef = useRef(request);
  const intentRef = useRef(intent);
  const formatRef = useRef(format);
  const targetFormatsRef = useRef(targetFormats);
  const hydratedWorkRef = useRef<string | null>(null);
  const lastPersistedRef = useRef<string | null>(null);
  const createInFlightRef = useRef<Promise<string | null> | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const submitGuardRef = useRef(false);
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
    lastPersistedRef.current = signature(hydrated);
    /* TanStack Query is the external persisted source for hydration. */
    setRequestState(work.request);
    setIntent(intentRef.current);
    setFormat(work.format);
    setTargetFormats(work.settings.targetFormats);
    setQuote(canonicalQuote(hydrated.intent, hydrated.format, hydrated.settings.targetFormats));
  }, [detailQuery.data]);

  const captureSnapshot = useCallback((): DraftSnapshot => ({
    request: requestRef.current.trim(),
    intent: intentRef.current,
    format: formatRef.current,
    settings: { targetFormats: [...targetFormatsRef.current] },
  }), []);

  const enqueueSave = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const run = saveChainRef.current.then(operation, operation);
    saveChainRef.current = run.then(() => undefined, () => undefined);
    return run;
  }, []);

  const exposeWorkId = useCallback((id: string) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("workId", id);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params}`);
  }, []);

  const ensureDraft = useCallback((assetId?: string, silent = false) => {
    if (workIdRef.current) return Promise.resolve(workIdRef.current);
    if (createInFlightRef.current) return createInFlightRef.current;
    if (!active.activeClientProfileId) {
      focusBrandSwitcher();
      return Promise.resolve(null);
    }
    const snapshot = captureSnapshot();
    if (!snapshot.request && !assetId) return Promise.resolve(null);

    const promise = enqueueSave(async () => {
      const result = await createMutation.mutateAsync({
        clientProfileId: active.activeClientProfileId!,
        draftKey: draftKeyRef.current,
        ...snapshot,
        ...(assetId ? { assetId, usage: "both" as const } : {}),
      });
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
  }, [active.activeClientProfileId, captureSnapshot, createMutation, enqueueSave, exposeWorkId]);

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
  }, [active.activeClientProfileId, captureSnapshot, ensureDraft, format, initialWorkId, intent, persistSnapshot, request, targetFormats]);

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
    requestAnimationFrame(() => composerRef.current?.focus());
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
      for (const file of images) {
        const uploaded = await uploadChatAttachment(file);
        const existingId = workIdRef.current;
        if (!existingId) {
          await ensureDraft(uploaded.assetId);
        } else {
          await sourceMutation.mutateAsync({
            workItemId: existingId,
            action: "attachSource",
            assetId: uploaded.assetId,
            usage: "both",
          });
        }
      }
      setAnnouncement(images.length === 1 ? "Arte adicionada" : `${images.length} artes adicionadas`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao adicionar arte");
    } finally {
      setIsUploading(false);
    }
  }, [active.activeClientProfileId, ensureDraft, sourceMutation]);

  const runSourceAction = useCallback(async (action: Parameters<typeof sourceMutation.mutateAsync>[0]) => {
    try {
      await sourceMutation.mutateAsync(action);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao atualizar arte");
    }
  }, [sourceMutation]);

  const updateSource = useCallback((sourceId: string, usage: CreativeSourceUsage) => {
    if (!workIdRef.current) return Promise.resolve();
    return runSourceAction({ workItemId: workIdRef.current, action: "updateSource", sourceId, usage });
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
      await generateMutation.mutateAsync(id);
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
  const brandName = active.profiles.find((profile) => profile.id === storedProfileId)?.name
    ?? active.activeProfile?.name
    ?? null;
  const hasMeaningfulInput = Boolean(request.trim() || detail?.sources.length);
  const canGenerate = Boolean(active.activeClientProfileId || storedProfileId) && hasMeaningfulInput
    && !isUploading && !generateMutation.isPending;

  const campaigns = (campaignQuery.data ?? []).filter((campaign) =>
    !campaign.clientProfileId || campaign.clientProfileId === storedProfileId,
  );

  return {
    composerRef: composerRef as RefObject<HTMLTextAreaElement | null>, request, setRequest,
    intent, selectIntent, format, setFormat: (value: Format) => {
      formatRef.current = value;
      setFormat(value);
      setQuote(canonicalQuote(intentRef.current, value, targetFormatsRef.current));
    },
    targetFormats, toggleTargetFormat, state, workId, brandName,
    sources: detail?.sources ?? [], outputs: detail?.outputs ?? [], quote, canGenerate, isUploading,
    campaignId: detail?.work.campaignId ?? null, campaigns,
    error, announcement, requiresBrandSelection: active.requiresSelection,
    workError: Boolean(workId && detailQuery.isError),
    addFiles, updateSource, retrySource, removeSource, generate,
    retryOutput, approveOutput, reviseOutput, linkCampaign,
    downloadOutput: (outputId: string) => {
      if (!workIdRef.current) return;
      window.open(downloadOutputUrl(workIdRef.current, outputId), "_blank", "noopener,noreferrer");
    },
    isRetryingOutput: (outputId: string) => retryOutputMutation.isPending && retryOutputMutation.variables?.outputId === outputId,
    isApprovingOutput: (outputId: string) => selectOutputMutation.isPending && selectOutputMutation.variables?.outputId === outputId,
    isRevisingOutput: (outputId: string) => reviseOutputMutation.isPending && reviseOutputMutation.variables?.outputId === outputId,
  };
}

export type CreativeComposerModel = ReturnType<typeof useCreativeComposer>;
export type CreativeComposerViewModel = Omit<CreativeComposerModel, "composerRef">;
