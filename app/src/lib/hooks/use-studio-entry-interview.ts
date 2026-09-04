import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { detectEntryGaps } from "@/lib/studio/detect-entry-gaps";
import { isEntryProtocol } from "@/lib/studio/entry-catalog";
import { formatEntryRequestTemplate } from "@/lib/studio/entry-request-template";
import type {
  EntryChip,
  EntryContext,
  EntryFacts,
  EntryLocale,
  EntryProtocol,
  EntrySlot,
} from "@/lib/studio/entry-types";
import { useStudioEntryContext } from "./use-studio-entry-context";

const FALLBACK_CONTEXT: EntryContext = {
  protocol: null,
  offer: null,
  audience: null,
  tone: null,
  protocolCandidates: [],
  offerCandidates: [],
  audienceCandidates: [],
  toneCandidates: [],
  workCount: 0,
};

const POST_DEBOUNCE_MS = 400;

function contextFacts(context: EntryContext): EntryFacts {
  return {
    protocol: context.protocol,
    offer: context.offer,
    audience: context.audience,
    tone: context.tone,
  };
}

function mergeFacts(context: EntryContext, answers: Partial<Record<EntrySlot, string>>): EntryFacts {
  return {
    protocol: (answers.protocol as EntryProtocol | undefined) ?? context.protocol,
    offer: answers.offer ?? context.offer,
    audience: answers.audience ?? context.audience,
    tone: answers.tone ?? context.tone,
  };
}

function answersToChips(answers: Partial<Record<EntrySlot, string>>): Partial<EntryFacts> {
  const chips: Partial<EntryFacts> = {};
  const protocol = answers.protocol;
  if (protocol && isEntryProtocol(protocol)) chips.protocol = protocol;
  if (answers.offer) chips.offer = answers.offer;
  if (answers.audience) chips.audience = answers.audience;
  if (answers.tone) chips.tone = answers.tone;
  return chips;
}

export function useStudioEntryInterview(input: {
  enabled: boolean;
  clientProfileId: string | null;
  request: string;
  hasAttachment: boolean;
  carouselEnabled: boolean;
  locale: EntryLocale;
  setRequest: (value: string) => void;
  recordStudioEvent: (eventKey: string, properties?: Record<string, string | number | boolean>) => void;
  requestFocused: boolean;
}) {
  const {
    enabled,
    clientProfileId,
    request,
    hasAttachment,
    carouselEnabled,
    locale,
    setRequest,
    recordStudioEvent,
    requestFocused,
  } = input;

  const contextQuery = useStudioEntryContext({ enabled, clientProfileId });
  const contextData = contextQuery.data;
  const usedFallback = !contextData || contextQuery.isError;
  const context = contextData ?? FALLBACK_CONTEXT;

  const [answers, setAnswers] = useState<Partial<Record<EntrySlot, string>>>({});
  const answersRef = useRef(answers);
  const requestFocusedRef = useRef(requestFocused);
  const lastWrittenRef = useRef("");
  const prevClientProfileIdRef = useRef(clientProfileId);
  const prevRequestRef = useRef(request);
  const userEditedSinceWriteRef = useRef(false);
  const postAbortRef = useRef<AbortController | null>(null);
  const postDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postGenerationRef = useRef(0);
  const chipsShownSignatureRef = useRef<string | null>(null);

  answersRef.current = answers;
  requestFocusedRef.current = requestFocused;

  const writeRequest = useCallback((value: string) => {
    lastWrittenRef.current = value;
    userEditedSinceWriteRef.current = false;
    setRequest(value);
  }, [setRequest]);

  const chips = useMemo<EntryChip[]>(() => {
    if (!enabled || !clientProfileId) return [];
    return detectEntryGaps({
      context,
      request,
      hasAttachment,
      carouselEnabled,
    });
  }, [enabled, clientProfileId, context, request, hasAttachment, carouselEnabled]);

  const hasProtocolChip = chips.some((chip) => chip.slot === "protocol");
  const pendingProtocol = hasProtocolChip && !answers.protocol;
  const answeredProtocol = answers.protocol && isEntryProtocol(answers.protocol)
    ? answers.protocol
    : null;
  const suggestedProtocol = !hasProtocolChip ? context.protocol : null;

  useEffect(() => {
    if (prevClientProfileIdRef.current === clientProfileId) return;
    prevClientProfileIdRef.current = clientProfileId;

    setAnswers({});
    chipsShownSignatureRef.current = null;
    lastWrittenRef.current = "";
    userEditedSinceWriteRef.current = false;
    prevRequestRef.current = "";
    setRequest("");
    postGenerationRef.current += 1;
    if (postDebounceRef.current) clearTimeout(postDebounceRef.current);
    postDebounceRef.current = null;
    postAbortRef.current?.abort();
    postAbortRef.current = null;
  }, [clientProfileId, setRequest]);

  useEffect(() => {
    if (!enabled || !clientProfileId) return;

    const previousRequest = prevRequestRef.current;
    prevRequestRef.current = request;
    if (request === previousRequest) return;

    if (request === lastWrittenRef.current) {
      userEditedSinceWriteRef.current = false;
      return;
    }

    userEditedSinceWriteRef.current = true;
    if (!postDebounceRef.current && !postAbortRef.current) return;

    const hadInFlightPost = Boolean(postAbortRef.current);
    postGenerationRef.current += 1;
    if (postDebounceRef.current) clearTimeout(postDebounceRef.current);
    postDebounceRef.current = null;
    postAbortRef.current?.abort();
    postAbortRef.current = null;
    if (hadInFlightPost) {
      recordStudioEvent("studio_entry_request_preserved");
    }
  }, [request, enabled, clientProfileId, recordStudioEvent]);

  useEffect(() => {
    if (!enabled || !clientProfileId || chips.length === 0) return;
    const signature = [
      clientProfileId,
      context.workCount,
      chips.map((chip) => chip.slot).join(","),
      usedFallback,
    ].join(":");
    if (chipsShownSignatureRef.current === signature) return;
    chipsShownSignatureRef.current = signature;
    recordStudioEvent("studio_entry_chips_shown", {
      workCount: context.workCount,
      slots: chips.map((chip) => chip.slot).join(","),
      usedFallback,
    });
  }, [enabled, clientProfileId, chips, context.workCount, usedFallback, recordStudioEvent]);

  useEffect(() => {
    if (!enabled || !clientProfileId || requestFocused || request) return;
    if (!contextData || contextQuery.isError) return;

    const template = formatEntryRequestTemplate(mergeFacts(context, answers), locale);
    if (!template || template === lastWrittenRef.current) return;

    writeRequest(template);
    recordStudioEvent("studio_entry_request_written", { requestSource: "template" });
  }, [
    enabled,
    clientProfileId,
    requestFocused,
    request,
    contextData,
    contextQuery.isError,
    context,
    answers,
    locale,
    writeRequest,
    recordStudioEvent,
  ]);

  const schedulePost = useCallback((
    nextAnswers: Partial<Record<EntrySlot, string>>,
    generation: number,
  ) => {
    if (!enabled || !clientProfileId || !contextData) return;

    if (postDebounceRef.current) clearTimeout(postDebounceRef.current);
    if (postAbortRef.current) postAbortRef.current.abort();

    postDebounceRef.current = setTimeout(() => {
      if (postGenerationRef.current !== generation) return;

      const controller = new AbortController();
      postAbortRef.current = controller;

      void apiFetch("/api/creative-work/entry-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facts: contextFacts(contextData),
          chips: answersToChips(nextAnswers),
          locale,
        }),
        timeoutMs: 8000,
        signal: controller.signal,
      })
        .then(async (res) => {
          if (postGenerationRef.current !== generation) return;
          if (!res.ok) return;
          const payload = await res.json() as { sentence: string; requestSource: "template" | "model" };
          if (postGenerationRef.current !== generation) return;
          if (requestFocusedRef.current || userEditedSinceWriteRef.current) {
            recordStudioEvent("studio_entry_request_preserved");
            return;
          }
          lastWrittenRef.current = payload.sentence;
          userEditedSinceWriteRef.current = false;
          setRequest(payload.sentence);
          recordStudioEvent("studio_entry_request_written", { requestSource: payload.requestSource });
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") return;
        })
        .finally(() => {
          if (postAbortRef.current === controller) {
            postAbortRef.current = null;
          }
        });
    }, POST_DEBOUNCE_MS);
  }, [enabled, clientProfileId, contextData, locale, setRequest, recordStudioEvent]);

  useEffect(() => () => {
    if (postDebounceRef.current) clearTimeout(postDebounceRef.current);
    postAbortRef.current?.abort();
  }, []);

  const selectChip = useCallback((slot: EntrySlot, value: string) => {
    const next = { ...answersRef.current, [slot]: value };
    postGenerationRef.current += 1;
    const generation = postGenerationRef.current;

    setAnswers(next);

    const template = formatEntryRequestTemplate(mergeFacts(context, next), locale);
    writeRequest(template);
    recordStudioEvent("studio_entry_chip_selected", { slot });
    schedulePost(next, generation);
  }, [context, locale, writeRequest, recordStudioEvent, schedulePost]);

  return {
    chips,
    answers,
    pendingProtocol,
    answeredProtocol,
    suggestedProtocol,
    selectChip,
    usedFallback,
  };
}
