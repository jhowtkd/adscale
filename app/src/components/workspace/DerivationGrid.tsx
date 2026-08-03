"use client";

import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { Derivation } from "@/lib/mock-data";
import DerivationCard from "./DerivationCard";
import DerivationPreviewGateFooter from "./DerivationPreviewGateFooter";
import type { ReviewDerivationVariables } from "@/lib/hooks/use-review";
import { mapDecisionToStatus } from "@/lib/derivation-display";

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
  qaAnalyzingId?: string | null;
  regeneratingId?: string | null;
  savingReferenceId?: string | null;
  reviewPending?: boolean;
  reviewVariables?: ReviewDerivationVariables | null;
  previewGate?: {
    campaignId: string;
    previewId: string;
    isApproving?: boolean;
    onApproveBatch: () => void;
    onAdjustStrategy?: () => void;
  };
}

function AddNewCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200 min-h-[280px]",
        "border-[var(--border-dim)] bg-[var(--surface-base)] hover:border-[var(--selection-border)] hover:bg-[var(--selection-bg)]"
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--utility-icon)] transition-colors duration-200 group-hover:bg-[var(--selection-bg)] group-hover:text-[var(--selection-text)]">
        <Plus size={18} />
      </div>
      <span className="mt-2 font-mono text-[var(--text-caption)] uppercase tracking-wide text-[var(--ghost)] group-hover:text-[var(--selection-text)]">
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
  qaAnalyzingId,
  regeneratingId,
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
                "rounded-xl ring-2 ring-[var(--selection-border)] ring-offset-2 ring-offset-[var(--surface-base)]"
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
              onReject={onReject ? () => onPreview(derivation.id) : undefined}
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
              qaAnalyzingId={qaAnalyzingId}
              regeneratingId={regeneratingId}
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
                isApproving={previewGate.isApproving}
                isGenerating={derivation.status === "generating"}
                onApproveBatch={previewGate.onApproveBatch}
                onAdjustStrategy={previewGate.onAdjustStrategy}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
