"use client";

import { useCallback, type MutableRefObject } from "react";
import type { CreativeWorkItem, CreativeWorkQuote } from "@/lib/hooks/use-creative-work";
import type { CreativeDirectionPool } from "@/server/creative-work/contracts";
import { canonicalQuote, type ComposerIntent } from "./composer-state";

type Format = CreativeWorkItem["format"];

export function useComposerFormatControls({
  intentRef,
  formatRef,
  formatModeRef,
  targetFormatsRef,
  textLayoutRef,
  fontAssetKeyRef,
  directionPoolRef,
  markPlanInputEdited,
  setFormat,
  setFormatMode,
  setTargetFormats,
  setTextLayout,
  setFontAssetKey,
  setQuote,
}: {
  intentRef: MutableRefObject<ComposerIntent>;
  formatRef: MutableRefObject<Format>;
  formatModeRef: MutableRefObject<"auto" | "manual">;
  targetFormatsRef: MutableRefObject<Format[]>;
  textLayoutRef: MutableRefObject<"top" | "center" | "bottom" | "side">;
  fontAssetKeyRef: MutableRefObject<string | null>;
  directionPoolRef: MutableRefObject<CreativeDirectionPool | null>;
  markPlanInputEdited: () => void;
  setFormat: (value: Format) => void;
  setFormatMode: (value: "auto" | "manual") => void;
  setTargetFormats: (updater: (current: Format[]) => Format[]) => void;
  setTextLayout: (value: "top" | "center" | "bottom" | "side") => void;
  setFontAssetKey: (value: string | null) => void;
  setQuote: (value: CreativeWorkQuote) => void;
}) {
  const setFormatManual = useCallback((value: Format) => {
    markPlanInputEdited();
    formatRef.current = value;
    formatModeRef.current = "manual";
    setFormatMode("manual");
    setFormat(value);
    setQuote(canonicalQuote(intentRef.current, value, targetFormatsRef.current, directionPoolRef.current ?? undefined));
  }, [directionPoolRef, formatModeRef, formatRef, intentRef, markPlanInputEdited, setFormat, setFormatMode, setQuote, targetFormatsRef]);

  const setFormatAuto = useCallback(() => {
    markPlanInputEdited();
    formatModeRef.current = "auto";
    setFormatMode("auto");
  }, [formatModeRef, markPlanInputEdited, setFormatMode]);

  const toggleTargetFormat = useCallback((value: Format) => {
    markPlanInputEdited();
    setTargetFormats((current) => {
      const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
      targetFormatsRef.current = next;
      setQuote(canonicalQuote(intentRef.current, formatRef.current, next, directionPoolRef.current ?? undefined));
      return next;
    });
  }, [directionPoolRef, formatRef, intentRef, markPlanInputEdited, setQuote, setTargetFormats, targetFormatsRef]);

  const setTextLayoutValue = useCallback((value: "top" | "center" | "bottom" | "side") => {
    markPlanInputEdited();
    textLayoutRef.current = value;
    setTextLayout(value);
  }, [markPlanInputEdited, setTextLayout, textLayoutRef]);

  const setFontAssetKeyValue = useCallback((value: string | null) => {
    markPlanInputEdited();
    fontAssetKeyRef.current = value;
    setFontAssetKey(value);
  }, [fontAssetKeyRef, markPlanInputEdited, setFontAssetKey]);

  return {
    setFormat: setFormatManual,
    setFormatAuto,
    toggleTargetFormat,
    setTextLayout: setTextLayoutValue,
    setFontAssetKey: setFontAssetKeyValue,
  };
}
