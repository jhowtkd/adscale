"use client";

import { useCallback, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useUpdateCampaign } from "@/lib/hooks/use-campaigns";
import {
  type GuidedBriefingAnswers,
  type GuidedBriefingHints,
  type GuidedBriefingStepId,
  buildSuggestion,
  getNextStep,
  mapGuidedAnswersToCampaignDraft,
} from "@/server/ai/guided-briefing";

export interface UseGuidedBriefingOptions {
  campaignId: string;
  initialAnswers?: GuidedBriefingAnswers;
  hints?: GuidedBriefingHints;
}

export function useGuidedBriefing({
  campaignId,
  initialAnswers = {},
  hints = {},
}: UseGuidedBriefingOptions) {
  const locale = useLocale();
  const guidedLocale = locale.startsWith("pt") ? "pt-BR" : "en";
  const updateCampaign = useUpdateCampaign(campaignId);

  const [answers, setAnswers] = useState<GuidedBriefingAnswers>(initialAnswers);
  const [editValue, setEditValue] = useState("");
  const [productEditValue, setProductEditValue] = useState("");
  const [offerEditValue, setOfferEditValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const currentStep = useMemo(() => getNextStep(answers), [answers]);

  const suggestion = useMemo(() => {
    if (!currentStep) return "";
    return buildSuggestion(currentStep, answers, hints, guidedLocale);
  }, [currentStep, answers, hints, guidedLocale]);

  const persistDraft = useCallback(
    async (nextAnswers: GuidedBriefingAnswers) => {
      const draft = mapGuidedAnswersToCampaignDraft(nextAnswers, guidedLocale);
      if (Object.keys(draft).length === 0) return;
      await updateCampaign.mutateAsync(draft);
    },
    [guidedLocale, updateCampaign]
  );

  const applyStepValue = useCallback(
    async (stepId: GuidedBriefingStepId, value: string, extra?: Partial<GuidedBriefingAnswers>) => {
      const patch: GuidedBriefingAnswers = { ...extra };
      switch (stepId) {
        case "productOffer":
          break;
        case "audience":
          patch.audience = value;
          break;
        case "promise":
          patch.promise = value;
          break;
        case "objections":
          patch.objections = value;
          break;
        case "cta":
          patch.cta = value;
          break;
        case "platforms":
          patch.platforms = value;
          break;
        case "constraints":
          patch.constraints = value;
          break;
        default:
          break;
      }

      const nextAnswers = { ...answers, ...patch };
      setAnswers(nextAnswers);
      setIsEditing(false);
      setEditValue("");
      setProductEditValue("");
      setOfferEditValue("");
      await persistDraft(nextAnswers);
      return nextAnswers;
    },
    [answers, persistDraft]
  );

  const acceptSuggestion = useCallback(async () => {
    if (!currentStep) return answers;
    if (currentStep === "productOffer") {
      const [productPart, offerPart] = suggestion.includes(" — ")
        ? suggestion.split(" — ", 2)
        : [suggestion, ""];
      const nextAnswers = {
        ...answers,
        product: productPart.trim() || answers.product,
        offer: offerPart.trim() || answers.offer || productPart.trim(),
      };
      setAnswers(nextAnswers);
      setIsEditing(false);
      await persistDraft(nextAnswers);
      return nextAnswers;
    }
    return applyStepValue(currentStep, suggestion);
  }, [answers, applyStepValue, currentStep, persistDraft, suggestion]);

  const acceptEditedValue = useCallback(async () => {
    if (!currentStep) return answers;
    if (currentStep === "productOffer") {
      const nextAnswers = {
        ...answers,
        product: productEditValue.trim() || answers.product,
        offer: offerEditValue.trim() || answers.offer,
      };
      setAnswers(nextAnswers);
      setIsEditing(false);
      await persistDraft(nextAnswers);
      return nextAnswers;
    }
    return applyStepValue(currentStep, editValue.trim());
  }, [
    answers,
    applyStepValue,
    currentStep,
    editValue,
    offerEditValue,
    persistDraft,
    productEditValue,
  ]);

  const skipStep = useCallback(async () => {
    if (!currentStep) return answers;
    const patch: GuidedBriefingAnswers = {};
    if (currentStep === "objections") patch.objections = "";
    if (currentStep === "constraints") patch.constraints = answers.constraints ?? "";
    const nextAnswers = { ...answers, ...patch };
    setAnswers(nextAnswers);
    setIsEditing(false);
    setEditValue("");
    return nextAnswers;
  }, [answers, currentStep]);

  const startEditing = useCallback(() => {
    if (!currentStep) return;
    setIsEditing(true);
    if (currentStep === "productOffer") {
      setProductEditValue(answers.product ?? "");
      setOfferEditValue(answers.offer ?? "");
      return;
    }
    setEditValue(suggestion);
  }, [answers.offer, answers.product, currentStep, suggestion]);

  const isComplete = currentStep === null;

  return {
    answers,
    currentStep,
    suggestion,
    isComplete,
    isEditing,
    editValue,
    setEditValue,
    productEditValue,
    setProductEditValue,
    offerEditValue,
    setOfferEditValue,
    acceptSuggestion,
    acceptEditedValue,
    skipStep,
    startEditing,
    setIsEditing,
    isPersisting: updateCampaign.isPending,
  };
}
