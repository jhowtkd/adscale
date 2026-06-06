"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSubmitMissionInsight } from "@/lib/hooks/use-mission-insight";
import {
  hasMissionInsightBeenPrompted,
  markMissionInsightPrompted,
} from "@/lib/mission-insights/storage";
import type {
  MissionInsightAction,
  MissionInsightPromptContext,
  MissionInsightReason,
  MissionInsightSentiment,
} from "@/lib/mission-insights/types";
import MissionInsightPrompt from "./MissionInsightPrompt";

type MissionInsightContextValue = {
  maybePromptMissionInsight: (context: MissionInsightPromptContext) => void;
  recordMissionSignal: (
    context: MissionInsightPromptContext,
    action: MissionInsightAction,
    extras?: {
      sentiment?: MissionInsightSentiment;
      reason?: MissionInsightReason;
      optionalText?: string;
    }
  ) => Promise<void>;
};

const MissionInsightContext = createContext<MissionInsightContextValue | null>(null);

export function useMissionInsight() {
  const ctx = useContext(MissionInsightContext);
  if (!ctx) {
    throw new Error("useMissionInsight must be used within MissionInsightProvider");
  }
  return ctx;
}

export function MissionInsightProvider({ children }: { children: ReactNode }) {
  const submitInsight = useSubmitMissionInsight();
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<MissionInsightPromptContext | null>(null);

  const recordMissionSignal = useCallback(
    async (
      promptContext: MissionInsightPromptContext,
      action: MissionInsightAction,
      extras?: {
        sentiment?: MissionInsightSentiment;
        reason?: MissionInsightReason;
        optionalText?: string;
      }
    ) => {
      try {
        await submitInsight.mutateAsync({
          moment: promptContext.moment,
          missionKey: promptContext.missionKey,
          action,
          sentiment: extras?.sentiment,
          reason: extras?.reason,
          optionalText: extras?.optionalText,
          campaignId: promptContext.campaignId,
          derivationId: promptContext.derivationId,
          route: promptContext.route,
          diagnosticContext: promptContext.diagnosticContext,
        });
      } catch {
        // Non-blocking — insight capture must never interrupt workflow
      }
    },
    [submitInsight]
  );

  const maybePromptMissionInsight = useCallback(
    (promptContext: MissionInsightPromptContext) => {
      if (hasMissionInsightBeenPrompted(promptContext.moment)) return;
      markMissionInsightPrompted(promptContext.moment);
      setContext(promptContext);
      setOpen(true);
    },
    []
  );

  const closeAndRecord = useCallback(
    async (
      action: MissionInsightAction,
      extras?: {
        sentiment?: MissionInsightSentiment;
        reason?: MissionInsightReason;
        optionalText?: string;
      }
    ) => {
      if (context) {
        await recordMissionSignal(context, action, extras);
      }
      setOpen(false);
      setContext(null);
    },
    [context, recordMissionSignal]
  );

  const value = useMemo(
    () => ({ maybePromptMissionInsight, recordMissionSignal }),
    [maybePromptMissionInsight, recordMissionSignal]
  );

  return (
    <MissionInsightContext.Provider value={value}>
      {children}
      {context ? (
        <MissionInsightPrompt
          open={open}
          context={context}
          submitting={submitInsight.isPending}
          onDismiss={() => void closeAndRecord("dismissed")}
          onSkip={() => void closeAndRecord("skipped")}
          onSubmit={async (input) => {
            await closeAndRecord("submitted", input);
          }}
        />
      ) : null}
    </MissionInsightContext.Provider>
  );
}

/** Safe hook for optional mission insight emission outside guaranteed provider trees. */
export function useMissionInsightOptional(): MissionInsightContextValue | null {
  return useContext(MissionInsightContext);
}
