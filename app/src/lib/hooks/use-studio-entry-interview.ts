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

function answersToChips(answers: Partial<Record<EntrySlot, string>>) {
  const chips: Partial<EntryFacts> = {};
  for (const slot of ["protocol", "offer", "audience", "tone"] as const) {
    const value = answers[slot];
    if (value) chips[slot] = slot === "protocol" ? (value as EntryProtocol) : value;
  }
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
  const requestRef = useRef(request);
  const requestFocusedRef = useRef(requestFocused);
  const lastWrittenRef = useRef("");
  const postAbortRef = useRef<AbortController | null>(null);
  const postDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chipsShownSignatureRef = useRef<string | null>(null);

  requestRef.current = request;
  requestFocusedRef.current = requestFocused;

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
    setAnswers({});
    chipsShownSignatureRef.current = null;
  }, [clientProfileId]);

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

    lastWrittenRef.current = template;
    setRequest(template);
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
    setRequest,
    recordStudioEvent,
  ]);

  const schedulePost = useCallback((nextAnswers: Partial<Record<EntrySlot, string>>) => {
    if (!enabled || !clientProfileId || !contextData) return;

    if (postDebounceRef.current) clearTimeout(postDebounceRef.current);
    if (postAbortRef.current) postAbortRef.current.abort();

    postDebounceRef.current = setTimeout(() => {
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
          if (!res.ok) return;
          const payload = await res.json() as { sentence: string; requestSource: "template" | "model" };
          if (requestFocusedRef.current) {
            recordStudioEvent("studio_entry_request_preserved");
            return;
          }
          if (requestRef.current !== lastWrittenRef.current) return;
          lastWrittenRef.current = payload.sentence;
          setRequest(payload.sentence);
          recordStudioEvent("studio_entry_request_written", { requestSource: "model" });
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") return;
        });
    }, POST_DEBOUNCE_MS);
  }, [enabled, clientProfileId, contextData, locale, requestFocused, setRequest, recordStudioEvent]);

  useEffect(() => () => {
    if (postDebounceRef.current) clearTimeout(postDebounceRef.current);
    postAbortRef.current?.abort();
  }, []);

  const selectChip = useCallback((slot: EntrySlot, value: string) => {
    setAnswers((previous) => {
      const next = { ...previous, [slot]: value };
      const template = formatEntryRequestTemplate(mergeFacts(context, next), locale);
      lastWrittenRef.current = template;
      setRequest(template);
      recordStudioEvent("studio_entry_chip_selected", { slot });
      schedulePost(next);
      return next;
    });
  }, [context, locale, setRequest, recordStudioEvent, schedulePost]);

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
