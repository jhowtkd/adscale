"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  isLayerizationRetryableFailure,
  type LayerizationFailureCode,
  type PublicLayerizationState,
} from "@/server/layerize/contracts";

const LAYERIZATION_FAILURE_KEYS: Record<LayerizationFailureCode, "unsafeMedia" | "fidelity" | "invalidResponse" | "provider" | "unknown"> = {
  unsafe_media: "unsafeMedia",
  fidelity_gate_failed: "fidelity",
  invalid_provider_response: "invalidResponse",
  provider_error: "provider",
  dispatch_failed: "unknown",
  missing_configuration: "unknown",
  source_missing: "unknown",
  no_longer_eligible: "unknown",
  storage_error: "unknown",
  submission_unknown: "unknown",
};

type LayerScannerProps = {
  sourceImageUrl: string;
  layerization: PublicLayerizationState | null;
  layerizeRemaining?: number | null;
  onRetryLayerize?: () => void;
};

function statusMessage(status: PublicLayerizationState["status"] | undefined, t: (key: string) => string) {
  if (status === "queued") return t("layerizeQueued");
  if (status === "processing") return t("layerizeProcessing");
  if (status === "reconciling") return t("layerizeReconciling");
  if (status === "finalizing") return t("layerizeFinalizing");
  if (status === "submission_unknown") return t("layerizeSubmissionUnknown");
  if (status === "failed") return t("layerizeFailed");
  return t("scanningLayers");
}

export function LayerScanner({ sourceImageUrl, layerization, layerizeRemaining, onRetryLayerize }: LayerScannerProps) {
  const t = useTranslations("dashboard.home.composer.results");
  const alertRef = useRef<HTMLDivElement>(null);
  const status = layerization?.status;
  const failed = status === "failed";
  const unknown = status === "submission_unknown";
  const scanning = !failed && !unknown;
  const canRetry = failed && isLayerizationRetryableFailure(layerization) && (layerizeRemaining === null || layerizeRemaining === undefined || layerizeRemaining > 0);
  const failureMessage = failed
    ? t(`layerizeFailure.${layerization?.failureCode ? LAYERIZATION_FAILURE_KEYS[layerization.failureCode] : "unknown"}`)
    : null;

  useEffect(() => {
    if (!(failed || unknown)) return;
    const focus = setTimeout(() => alertRef.current?.focus(), 0);
    return () => clearTimeout(focus);
  }, [failed, unknown]);

  return (
    <section aria-label={t("scanningLayers")} className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex-1 overflow-auto bg-[linear-gradient(45deg,var(--border-subtle)_25%,transparent_25%),linear-gradient(-45deg,var(--border-subtle)_25%,transparent_25%)] bg-[size:16px_16px]">
        <div className="relative mx-auto max-w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sourceImageUrl} alt="" className="mx-auto max-h-[min(80vh,900px)] max-w-full object-contain" />
          {scanning ? (
            <div className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden">
              <div className="absolute inset-x-0 h-24 bg-[linear-gradient(to_bottom,transparent,var(--selection-bg),transparent)] opacity-60 [animation:layer-scan_2.4s_ease-in-out_infinite]" />
            </div>
          ) : null}
        </div>
      </div>
      <div className="space-y-2 border-t px-4 py-3">
        <p role="status" aria-live="polite" className="text-sm text-[var(--text-secondary)]">{statusMessage(status, t)}</p>
        {failed || unknown ? (
          <div ref={alertRef} role="alert" tabIndex={-1} className="rounded-[var(--radius-control)] border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3 text-sm text-[var(--warning-text)]">
            <p>{unknown ? t("layerizeSubmissionUnknown") : failureMessage}</p>
            {canRetry ? <Button className="mt-2 min-h-11" onClick={onRetryLayerize}>{t("layerizeRetry")}</Button> : null}
          </div>
        ) : null}
      </div>
      <style>{`@keyframes layer-scan { 0% { top: -20%; } 100% { top: 100%; } }`}</style>
    </section>
  );
}
