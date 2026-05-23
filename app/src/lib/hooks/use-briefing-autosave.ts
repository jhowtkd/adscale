"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { BriefingFormData } from "@/components/workspace/BriefingStep";

interface AutoSaveState {
  hasDraft: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;
}

function getStorageKey(campaignId: string) {
  return `adscale:briefing-draft:${campaignId}`;
}

function serializeDraft(data: BriefingFormData): string {
  return JSON.stringify(data);
}

function deserializeDraft(raw: string): BriefingFormData | null {
  try {
    return JSON.parse(raw) as BriefingFormData;
  } catch {
    return null;
  }
}

export function useBriefingAutoSave(
  campaignId: string,
  formData: BriefingFormData
) {
  const key = getStorageKey(campaignId);

  const [state, setState] = useState<AutoSaveState>(() => {
    const existing = localStorage.getItem(key);
    const draft = existing ? deserializeDraft(existing) : null;
    return {
      hasDraft: !!draft,
      isSaving: false,
      lastSavedAt: null,
    };
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save on formData change (debounced)
  useEffect(() => {
    // Don't auto-save if the form is essentially empty
    const isEssentiallyEmpty =
      !formData.name.trim() &&
      !formData.client.trim() &&
      !formData.objective.trim() &&
      !formData.audience.trim() &&
      !formData.offer.trim() &&
      !formData.constraints.trim() &&
      !formData.notes.trim() &&
      formData.ctaVariants.every((c) => !c.trim());

    if (isEssentiallyEmpty) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      requestAnimationFrame(() => {
        setState((s) => ({ ...s, isSaving: false }));
      });
      return;
    }

    requestAnimationFrame(() => {
      setState((s) => ({ ...s, isSaving: true }));
    });

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      localStorage.setItem(key, serializeDraft(formData));
      setState({
        hasDraft: true,
        isSaving: false,
        lastSavedAt: new Date(),
      });
    }, 5000);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [formData, key]);

  const restoreDraft = useCallback((): BriefingFormData | null => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return deserializeDraft(raw);
  }, [key]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(key);
    setState({
      hasDraft: false,
      isSaving: false,
      lastSavedAt: null,
    });
  }, [key]);

  return {
    ...state,
    restoreDraft,
    clearDraft,
  };
}
