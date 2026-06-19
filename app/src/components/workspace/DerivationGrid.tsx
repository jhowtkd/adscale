"use client";

import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { Derivation } from "@/lib/mock-data";
import DerivationCard from "./DerivationCard";
import DerivationPreviewGateFooter from "./DerivationPreviewGateFooter";
import type { BatchCreditBreakdown } from "@/server/ai/strategy-recipes";
import type { ConversionErrorPayload } from "@/lib/billing/conversion-contract";
import type { ReviewDerivationVariables } from "@/lib/hooks/use-review";
import { mapDecisionToStatus } from "@/lib/derivation-review-display";

// ============================================
// Types
// ============================================

export interface DerivationGridProps {
  derivations: Derivation[];
  onAddNew: () => void;
  onPreview: (id: string) => void;
  onDownload?: (id: string) => void;
  onRegenerate?: (id: string, feedback?: string) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onCreateDeliveryPackage?: (id: string) => void;
  onRunQa?: (id: string) => void;
  onSaveAsReference?: (id: string) => void;
  onGenerateLandingPage?: (id: string) => void;
  onSimulatePersonas?: (id: string) => void;
  qaAnalyzingId?: string | null;
  regeneratingId?: string | null;
  landingPageGeneratingId?: string | null;
  simulatingPersonasId?: string | null;
  savingReferenceId?: string | null;
  reviewPending?: boolean;
  reviewVariables?: ReviewDerivationVariables | null;
  previewGate?: {
    campaignId: string;
    previewId: string;
    previewCreditsSpent: number;
    batchBreakdown: BatchCreditBreakdown;
    creditBalance?: number;
    conversionPayload?: ConversionErrorPayload | null;
    isApproving?: boolean;
    onReviseRecipe: () => void;
    onApproveBatch: () => void;
  };
}

function AddNewCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200 min-h-[280px]",
        "border-[var(--border-dim)] bg-[var(--surface-base)] hover:border-[var(--accent-green)] hover:bg-[var(--accent-green-dim)]"
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--text-muted)] transition-colors duration-200 group-hover:bg-[var(--accent-green)] group-hover:text-[var(--accent-green-on-fill)]">
        <Plus size={18} />
      </div>
      <span className="mt-2 font-mono text-[10px] uppercase tracking-wide text-[var(--ghost)] group-hover:text-[var(--accent-green)]">
        Nova
      </span>
    </button>
  );
}

// ============================================
// Component
// ============================================

export default function DerivationGrid({
  derivations,
  onAddNew,
  onPreview,
  onDownload,
  onRegenerate,
  onApprove,
  onReject,
  onCreateDeliveryPackage,
  onRunQa,
  onSaveAsReference,
  onGenerateLandingPage,
  onSimulatePersonas,
  qaAnalyzingId,
  regeneratingId,
  landingPageGeneratingId,
  simulatingPersonasId,
  savingReferenceId,
  reviewPending,
  reviewVariables,
  previewGate,
}: DerivationGridProps) {
  return (
    <div
      className="grid gap-4 animate-fade-in"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
    >
      <AddNewCard onClick={onAddNew} />
      {derivations.map((derivation, index) => {
        const isPreviewGateCard =
          previewGate != null && previewGate.previewId === derivation.id;
        const reviewStatus =
          reviewVariables?.status ??
          (reviewVariables?.decision
            ? mapDecisionToStatus(reviewVariables.decision)
            : undefined);

        return (
          <div
            key={derivation.id}
            className={cn(
              isPreviewGateCard &&
                "rounded-xl ring-2 ring-[var(--accent-green)]/40 ring-offset-2 ring-offset-[var(--surface-base)]"
            )}
          >
            <DerivationCard
              derivation={derivation}
              index={index}
              onPreview={onPreview}
              onDownload={onDownload}
              onRegenerate={onRegenerate}
              onApprove={
                onApprove ? () => onApprove(derivation.id) : undefined
              }
              onReject={onReject ? () => onReject(derivation.id) : undefined}
              onCreateDeliveryPackage={
                onCreateDeliveryPackage
                  ? () => onCreateDeliveryPackage(derivation.id)
                  : undefined
              }
              onRunQa={onRunQa ? () => onRunQa(derivation.id) : undefined}
              onSaveAsReference={
                onSaveAsReference
                  ? () => onSaveAsReference(derivation.id)
                  : undefined
              }
              onGenerateLandingPage={
                onGenerateLandingPage
                  ? () => onGenerateLandingPage(derivation.id)
                  : undefined
              }
              onSimulatePersonas={
                onSimulatePersonas
                  ? () => onSimulatePersonas(derivation.id)
                  : undefined
              }
              qaAnalyzingId={qaAnalyzingId}
              regeneratingId={regeneratingId}
              landingPageGeneratingId={landingPageGeneratingId}
              simulatingPersonasId={simulatingPersonasId}
              interactionState={{
                savingReference: savingReferenceId === derivation.id,
                approving:
                  reviewPending &&
                  reviewVariables?.id === derivation.id &&
                  reviewStatus === "approved",
                rejecting:
                  reviewPending &&
                  reviewVariables?.id === derivation.id &&
                  reviewStatus === "rejected",
              }}
            />
            {isPreviewGateCard ? (
              <DerivationPreviewGateFooter
                campaignId={previewGate.campaignId}
                previewCreditsSpent={previewGate.previewCreditsSpent}
                batchBreakdown={previewGate.batchBreakdown}
                creditBalance={previewGate.creditBalance}
                conversionPayload={previewGate.conversionPayload}
                isApproving={previewGate.isApproving}
                isGenerating={derivation.status === "generating"}
                onReviseRecipe={previewGate.onReviseRecipe}
                onApproveBatch={previewGate.onApproveBatch}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
