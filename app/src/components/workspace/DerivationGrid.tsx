"use client";

import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

// ============================================
// Types
// ============================================

interface Derivation {
  id: string;
  variantIndex: number;
  status: string;
}

interface DerivationGridProps {
  derivations: Derivation[];
  onAddNew: () => void;
}

// ============================================
// Sub-components
// ============================================

function DerivationCard({
  derivation,
}: {
  derivation: Derivation;
}) {
  const isApproved = derivation.status === "approved";

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center rounded-xl border bg-[var(--surface-base)] transition-all duration-200",
        "border-[var(--border-dim)] hover:border-[var(--border-medium)]",
        "aspect-[4/5]"
      )}
    >
      {/* Status Badge */}
      <div className="absolute top-2.5 left-2.5">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide",
            isApproved
              ? "bg-[var(--status-approved-bg)] text-[var(--accent-green)]"
              : "bg-[var(--surface-raised)] text-[var(--text-muted)]"
          )}
        >
          {isApproved ? "Aprovado" : derivation.status}
        </span>
      </div>

      {/* Placeholder Content */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex size-12 items-center justify-center rounded-lg bg-[var(--surface-raised)] text-[var(--text-muted)]">
          <span className="font-mono text-xs uppercase">
            #{derivation.variantIndex}
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--ghost)]">
          Var #{derivation.variantIndex}
        </span>
      </div>
    </div>
  );
}

function AddNewCard({ onClick }: { onClick: () => void }) {
  return (
    <button type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200",
        "border-[var(--border-dim)] bg-[var(--surface-base)] hover:border-[var(--accent-green)] hover:bg-[var(--accent-green-dim)]",
        "aspect-[4/5]"
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--text-muted)] transition-colors duration-200 group-hover:bg-[var(--accent-green)] group-hover:text-white">
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
}: DerivationGridProps) {
  return (
    <div
      className="grid gap-3 animate-fade-in"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}
    >
      {derivations.map((derivation) => (
        <DerivationCard key={derivation.id} derivation={derivation} />
      ))}
      <AddNewCard onClick={onAddNew} />
    </div>
  );
}
