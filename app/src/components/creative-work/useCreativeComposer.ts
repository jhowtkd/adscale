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
  useTriggerTriplet,
  type CreativeSourceUsage,
  type CreativeWorkItem,
  type CreativeWorkQuote,
} from "@/lib/hooks/use-creative-work";
import { quoteCreativeWork } from "@/server/creative-work/contracts";

export type ComposerState = "empty" | "saving" | "analyzing" | "ready" | "generating" | "results";
export type ComposerIntent = Exclude<CreativeWorkItem["toolKind"], "social_post">;
type Format = CreativeWorkItem["format"];

const DEFAULT_QUOTE: CreativeWorkQuote = { unitCount: 3, credits: 15 };

function canonicalQuote(intent: ComposerIntent, format: Format, targetFormats: Format[]): CreativeWorkQuote {
  const { unitCount, credits } = quoteCreativeWork({ intent, format, targetFormats });
  return { unitCount, credits };
}

function signature(request: string, intent: ComposerIntent, format: Format, targetFormats: Format[]) {
  return JSON.stringify({ request: request.trim(), intent, format, targetFormats });
}

function focusBrandSwitcher() {
  document.getElementById("active-brand-switcher")?.focus();
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
  const submitGuardRef = useRef(false);

  const detailQuery = useCreativeWork(workId);
  const createMutation = useCreateCreativeWorkDraft();
  const autosaveMutation = useAutosaveCreativeWork();
  const prepareMutation = usePrepareCreativeWork();
  const sourceMutation = useCreativeWorkSourceActions();
  const generateMutation = useTriggerTriplet();

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
    intentRef.current = work.toolKind === "social_post" ? "variations" : work.toolKind;
    formatRef.current = work.format;
    targetFormatsRef.current = work.settings.targetFormats;
    lastPersistedRef.current = signature(
      work.request,
      intentRef.current,
      work.format,
      work.settings.targetFormats,
    );
    /* TanStack Query is the external persisted source for hydration. */
    setRequestState(work.request);
    setIntent(intentRef.current);
    setFormat(work.format);
    setTargetFormats(work.settings.targetFormats);
  }, [detailQuery.data]);

  const currentSignature = useCallback(() => signature(
    requestRef.current,
    intentRef.current,
    formatRef.current,
    targetFormatsRef.current,
  ), []);

  const exposeWorkId = useCallback((id: string) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("workId", id);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params}`);
  }, []);

  const ensureDraft = useCallback((assetId?: string) => {
    if (workIdRef.current) return Promise.resolve(workIdRef.current);
    if (createInFlightRef.current) return createInFlightRef.current;
    if (!active.activeClientProfileId) {
      focusBrandSwitcher();
      return Promise.resolve(null);
    }
    const trimmed = requestRef.current.trim();
    if (!trimmed && !assetId) return Promise.resolve(null);

    const promise = createMutation.mutateAsync({
      clientProfileId: active.activeClientProfileId,
      draftKey: draftKeyRef.current,
      request: trimmed,
      intent: intentRef.current,
      format: formatRef.current,
      settings: { targetFormats: targetFormatsRef.current },
      ...(assetId ? { assetId, usage: "both" as const } : {}),
    }).then((result) => {
      workIdRef.current = result.work.id;
      lastPersistedRef.current = currentSignature();
      setWorkId(result.work.id);
      setQuote(result.quote);
      setAnnouncement("Rascunho salvo");
      exposeWorkId(result.work.id);
      return result.work.id;
    }).catch((cause) => {
      setError(cause instanceof Error ? cause.message : "Falha ao salvar rascunho");
      return null;
    }).finally(() => { createInFlightRef.current = null; });
    createInFlightRef.current = promise;
    return promise;
  }, [active.activeClientProfileId, createMutation, currentSignature, exposeWorkId]);

  const flushAutosave = useCallback(async (id: string) => {
    const nextSignature = currentSignature();
    if (nextSignature === lastPersistedRef.current) return;
    await autosaveMutation.mutateAsync({
      workItemId: id,
      request: requestRef.current.trim(),
      intent: intentRef.current,
      format: formatRef.current,
      settings: { targetFormats: targetFormatsRef.current },
    });
    lastPersistedRef.current = nextSignature;
    setAnnouncement("Alterações salvas");
  }, [autosaveMutation, currentSignature]);

  useEffect(() => {
    if (initialWorkId && !hydratedWorkRef.current) return;
    const timer = window.setTimeout(() => {
      if (!active.activeClientProfileId) {
        if (requestRef.current.trim()) focusBrandSwitcher();
        return;
      }
      const save = async () => {
        const id = workIdRef.current ?? await ensureDraft();
        if (id) await flushAutosave(id);
      };
      void save().catch((cause) => setError(cause instanceof Error ? cause.message : "Falha ao salvar"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [active.activeClientProfileId, ensureDraft, flushAutosave, format, initialWorkId, intent, request, targetFormats]);

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
    if (!active.activeClientProfileId) {
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
      const id = workIdRef.current ?? await ensureDraft();
      if (!id) return;
      await flushAutosave(id);
      const prepared = await prepareMutation.mutateAsync({ workItemId: id });
      setQuote(prepared.quote);
      await generateMutation.mutateAsync(id);
      setAnnouncement("Geração iniciada");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao gerar");
    } finally {
      submitGuardRef.current = false;
    }
  }, [ensureDraft, flushAutosave, generateMutation, prepareMutation]);

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

  return {
    composerRef: composerRef as RefObject<HTMLTextAreaElement | null>, request, setRequest,
    intent, selectIntent, format, setFormat: (value: Format) => {
      formatRef.current = value;
      setFormat(value);
      setQuote(canonicalQuote(intentRef.current, value, targetFormatsRef.current));
    },
    targetFormats, toggleTargetFormat, state, workId, brandName,
    sources: detail?.sources ?? [], outputs: detail?.outputs ?? [], quote, canGenerate, isUploading,
    error, announcement, requiresBrandSelection: active.requiresSelection,
    addFiles, updateSource, retrySource, removeSource, generate,
  };
}
