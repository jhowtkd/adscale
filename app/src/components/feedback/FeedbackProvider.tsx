"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { useAppStore } from "@/lib/store";
import { useSubmitFeedback } from "@/lib/hooks/use-feedback";
import type { FeedbackContextPayload, SubmitFeedbackInput } from "@/lib/feedback/types";
import FeedbackModal from "./FeedbackModal";

type FeedbackOpenOptions = FeedbackContextPayload;

type FeedbackContextValue = {
  openFeedback: (options?: FeedbackOpenOptions) => void;
  closeFeedback: () => void;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error("useFeedback must be used within FeedbackProvider");
  }
  return ctx;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("feedback");
  const addToast = useAppStore((s) => s.addToast);
  const submitFeedback = useSubmitFeedback();
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<FeedbackOpenOptions>({});

  const openFeedback = useCallback((options: FeedbackOpenOptions = {}) => {
    setContext(options);
    setOpen(true);
  }, []);

  const closeFeedback = useCallback(() => {
    setOpen(false);
  }, []);

  const handleSubmit = useCallback(
    async (input: Omit<SubmitFeedbackInput, keyof FeedbackContextPayload>) => {
      try {
        await submitFeedback.mutateAsync({ ...input, ...context });
        addToast("success", t("submitSuccess"));
        setOpen(false);
      } catch {
        addToast("error", t("submitError"));
      }
    },
    [addToast, context, submitFeedback, t]
  );

  const value = useMemo(
    () => ({ openFeedback, closeFeedback }),
    [openFeedback, closeFeedback]
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <FeedbackModal
        open={open}
        onOpenChange={setOpen}
        context={context}
        submitting={submitFeedback.isPending}
        onSubmit={handleSubmit}
      />
    </FeedbackContext.Provider>
  );
}
