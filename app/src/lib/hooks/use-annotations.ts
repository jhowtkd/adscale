"use client";

import { useCallback, useState, useEffect } from "react";
import type { Annotation } from "@/lib/mock-data";

const STORAGE_KEY = "adscale_annotations";

function getStorageKey(derivationId: string): string {
  return `${STORAGE_KEY}_${derivationId}`;
}

function loadAnnotations(derivationId: string): Annotation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey(derivationId));
    if (!raw) return [];
    return JSON.parse(raw) as Annotation[];
  } catch {
    return [];
  }
}

function saveAnnotations(derivationId: string, annotations: Annotation[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getStorageKey(derivationId), JSON.stringify(annotations));
  } catch {
    // ignore storage errors
  }
}

export function useAnnotations(derivationId: string) {
  const [annotations, setAnnotations] = useState<Annotation[]>(() =>
    loadAnnotations(derivationId)
  );

  // Sync with localStorage whenever annotations change
  useEffect(() => {
    saveAnnotations(derivationId, annotations);
  }, [derivationId, annotations]);

  const addAnnotation = useCallback((annotation: Annotation) => {
    setAnnotations((prev) => [...prev, annotation]);
  }, []);

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAnnotations = useCallback(() => {
    setAnnotations([]);
  }, []);

  const updateAnnotation = useCallback((id: string, updates: Partial<Annotation>) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...updates } : a))
    );
  }, []);

  return {
    annotations,
    addAnnotation,
    removeAnnotation,
    clearAnnotations,
    updateAnnotation,
  };
}
