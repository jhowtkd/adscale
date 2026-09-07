"use client";

import { useCallback, useRef, useState } from "react";
import type { CreativeWorkBrandConflict, CreativeWorkItem } from "@/lib/hooks/use-creative-work";
import {
  createDefaultCreativeDirectionPool,
  type CreativeDirection,
  type CreativeDirectionPool,
  type CreativeWorkFactPack,
  type CreativeWorkBriefingOverrides,
  type InferredBriefing,
} from "@/server/creative-work/contracts";
import { canonicalQuote, type ComposerActionPhase, type ComposerIntent, type DraftSnapshot } from "./composer-state";
import { captureDraftSnapshot } from "./composer-draft";

type Format = CreativeWorkItem["format"];

export function useComposerSessionState(input: {
  initialWorkId?: string;
  initialCampaignId?: string;
  internalInitialIntent: ComposerIntent;
  initialObjective: ComposerIntent | null;
  initialTargetFormats: Format[];
}) {
  const { initialWorkId, initialCampaignId, internalInitialIntent, initialObjective, initialTargetFormats } = input;
  const [workId, setWorkId] = useState<string | null>(initialWorkId ?? null);
  const [pendingCampaignId, setPendingCampaignId] = useState<string | null>(initialCampaignId ?? null);
  const [request, setRequestState] = useState("");
  const [invalidatedPlanRevision, setInvalidatedPlanRevision] = useState<string | null>(null);
  const [intent, setIntent] = useState<ComposerIntent>(internalInitialIntent);
  const [objective, setObjective] = useState<ComposerIntent | null>(initialObjective);
  const [bufferedFile, setBufferedFile] = useState<File | null>(null);
  const [format, setFormat] = useState<Format>("4:5");
  const [formatMode, setFormatMode] = useState<"auto" | "manual">("auto");
  const [targetFormats, setTargetFormats] = useState<Format[]>(initialTargetFormats);
  const [textLayout, setTextLayout] = useState<"top" | "center" | "bottom" | "side">("top");
  const [fontAssetKey, setFontAssetKey] = useState<string | null>(null);
  const [directionPool, setDirectionPool] = useState<CreativeDirectionPool | null>(
    internalInitialIntent === "variations" ? createDefaultCreativeDirectionPool() : null,
  );
  const [quote, setQuote] = useState(() => canonicalQuote(
    internalInitialIntent,
    "4:5",
    initialTargetFormats,
    internalInitialIntent === "variations" ? createDefaultCreativeDirectionPool() : undefined,
  ));
  const [inferredBriefingContext, setInferredBriefingContext] = useState<{
    briefing: InferredBriefing;
    factPack: CreativeWorkFactPack;
  } | null>(null);
  const inferredBriefing = inferredBriefingContext?.briefing ?? null;
  const briefingFactPack = inferredBriefingContext?.factPack ?? null;
  const [briefingEditState, setBriefingEditState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [directionSuggestionState, setDirectionSuggestionState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [pendingDirectionSuggestions, setPendingDirectionSuggestions] = useState<{
    directions: CreativeDirection[];
    preserveSelection: boolean;
  } | null>(null);
  const [directionSuggestionRetryToken, setDirectionSuggestionRetryToken] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const uploadInFlightRef = useRef(false);
  const [actionPhase, setActionPhase] = useState<ComposerActionPhase>("idle");
  const [preparedPlanCycle, setPreparedPlanCycle] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [approvalErrorOutputId, setApprovalErrorOutputId] = useState<string | null>(null);
  const [brandConflict, setBrandConflict] = useState<CreativeWorkBrandConflict | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pendingProtocolSwitch, setPendingProtocolSwitch] = useState<ComposerIntent | null>(null);
  const [protocolSwitchNotice, setProtocolSwitchNotice] = useState<{
    from: ComposerIntent;
    to: ComposerIntent;
  } | null>(null);
  const [brandTrainingSuggestion, setBrandTrainingSuggestion] = useState<string | null>(null);
  const [failedInitialTemplateId, setFailedInitialTemplateId] = useState<string | null>(null);
  const [templateRetryToken, setTemplateRetryToken] = useState(0);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const draftKeyRef = useRef(crypto.randomUUID());
  const workIdRef = useRef(workId);
  const pendingCampaignIdRef = useRef(pendingCampaignId);
  const requestRef = useRef(request);
  const intentRef = useRef(intent);
  const objectiveRef = useRef(objective);
  const formatRef = useRef(format);
  const targetFormatsRef = useRef(targetFormats);
  const textLayoutRef = useRef<"top" | "center" | "bottom" | "side">("top");
  const fontAssetKeyRef = useRef<string | null>(null);
  const directionPoolRef = useRef<CreativeDirectionPool | null>(directionPool);
  const formatModeRef = useRef<"auto" | "manual">("auto");
  const briefingOverridesRef = useRef<CreativeWorkBriefingOverrides | undefined>(undefined);
  const briefingVersionRef = useRef<number | undefined>(undefined);
  const hydratedWorkRef = useRef<string | null>(null);
  const lastPersistedRef = useRef<string | null>(null);
  const createInFlightRef = useRef<Promise<string | null> | null>(null);
  const draftEpochRef = useRef(0);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const submitGuardRef = useRef(false);
  const directionSuggestionRequestedRef = useRef<string | null>(null);
  const directionTouchedRef = useRef(false);
  const autosaveBlockedWorkRef = useRef<string | null>(null);
  const didFocusComposerRef = useRef(false);
  const focusFrameRef = useRef<number | null>(null);
  const autoTemplateRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const restoredProfileRef = useRef<string | null>(null);
  const lifecycleRef = useRef(0);
  const persistOnUnmountRef = useRef<() => Promise<void>>(async () => undefined);
  const revisionAttemptsRef = useRef(new Map<string, { revisionKey: string; revisionAssetId: string | null }>());
  const pendingProtocolTransitionRef = useRef<((committed: boolean) => void) | null>(null);
  const planInputEditEpochRef = useRef(0);
  const preparedPlanInputRef = useRef<{ revision: string; signature: string } | null>(null);
  const hydratingPreparedPlanRevisionRef = useRef<string | null>(null);
  const shownPreparedRevisionRef = useRef<string | null>(null);
  const markPlanInputEdited = useCallback(() => {
    planInputEditEpochRef.current += 1;
  }, []);
  const captureSnapshot = useCallback((): DraftSnapshot => captureDraftSnapshot({
    request: requestRef.current,
    intent: intentRef.current,
    format: formatRef.current,
    targetFormats: targetFormatsRef.current,
    formatMode: formatModeRef.current,
    textLayout: textLayoutRef.current,
    fontAssetKey: fontAssetKeyRef.current,
    directionPool: directionPoolRef.current,
    briefingOverrides: briefingOverridesRef.current,
    briefingVersion: briefingVersionRef.current,
  }), []);

  return {
    workId, setWorkId, pendingCampaignId, setPendingCampaignId, request, setRequestState,
    invalidatedPlanRevision, setInvalidatedPlanRevision, intent, setIntent, objective, setObjective,
    bufferedFile, setBufferedFile, format, setFormat, formatMode, setFormatMode,
    targetFormats, setTargetFormats, textLayout, setTextLayout, fontAssetKey, setFontAssetKey,
    directionPool, setDirectionPool, quote, setQuote, inferredBriefingContext, setInferredBriefingContext,
    inferredBriefing, briefingFactPack, briefingEditState, setBriefingEditState,
    directionSuggestionState, setDirectionSuggestionState, pendingDirectionSuggestions, setPendingDirectionSuggestions,
    directionSuggestionRetryToken, setDirectionSuggestionRetryToken, isUploading, setIsUploading,
    uploadInFlightRef, actionPhase, setActionPhase, preparedPlanCycle, setPreparedPlanCycle,
    error, setError, approvalErrorOutputId, setApprovalErrorOutputId, brandConflict, setBrandConflict,
    announcement, setAnnouncement, pendingProtocolSwitch, setPendingProtocolSwitch,
    protocolSwitchNotice, setProtocolSwitchNotice, brandTrainingSuggestion, setBrandTrainingSuggestion,
    failedInitialTemplateId, setFailedInitialTemplateId, templateRetryToken, setTemplateRetryToken,
    composerRef, draftKeyRef, workIdRef, pendingCampaignIdRef, requestRef, intentRef, objectiveRef,
    formatRef, targetFormatsRef, textLayoutRef, fontAssetKeyRef, directionPoolRef, formatModeRef,
    briefingOverridesRef, briefingVersionRef, hydratedWorkRef, lastPersistedRef, createInFlightRef,
    draftEpochRef, saveChainRef, submitGuardRef, directionSuggestionRequestedRef, directionTouchedRef,
    autosaveBlockedWorkRef, didFocusComposerRef, focusFrameRef, autoTemplateRef, mountedRef,
    restoredProfileRef, lifecycleRef, persistOnUnmountRef, revisionAttemptsRef,
    pendingProtocolTransitionRef, planInputEditEpochRef, preparedPlanInputRef,
    hydratingPreparedPlanRevisionRef, shownPreparedRevisionRef,
    markPlanInputEdited, captureSnapshot,
  };
}
