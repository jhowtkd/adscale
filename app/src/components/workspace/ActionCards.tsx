"use client";

import { cn } from "@/lib/utils";
import { Palette, Sparkles, ArrowRight } from "lucide-react";

// ============================================
// Types
// ============================================

interface ActionCardsProps {
  onDerivar: () => void;
  onEstilizar: () => void;
}

interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  meta: string[];
  onClick: () => void;
}

// ============================================
// Sub-components
// ============================================

function ActionCard({ icon, title, description, meta, onClick }: ActionCardProps) {
  return (
    <button type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-start rounded-xl border bg-[var(--surface-base)] p-5 text-left transition-all duration-200",
        "border-[var(--border-dim)] hover:border-[var(--accent-green)] hover:-translate-y-px",
        "hover:shadow-[0_0_20px_rgba(0,179,74,0.12)]"
      )}
    >
      {/* Icon */}
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-[var(--surface-raised)] text-[var(--text-primary)] transition-colors duration-200 group-hover:bg-[var(--accent-green-dim)] group-hover:text-[var(--accent-green-text)]">
        {icon}
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
        {title}
      </h3>

      {/* Description */}
      <p className="text-xs text-[var(--text-secondary)] mb-4 leading-relaxed">
        {description}
      </p>

      {/* Meta tags */}
      <div className="mt-auto flex flex-wrap gap-1.5">
        {meta.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center rounded bg-[var(--surface-raised)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-[var(--ghost)]"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Arrow */}
      <ArrowRight
        size={16}
        className="absolute top-5 right-5 text-[var(--border-medium)] transition-all duration-200 group-hover:text-[var(--accent-green)] group-hover:translate-x-0.5"
      />
    </button>
  );
}

// ============================================
// Component
// ============================================

export default function ActionCards({ onDerivar, onEstilizar }: ActionCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 animate-fade-in">
      <ActionCard
        icon={<Palette size={20} />}
        title="Derivar criativo"
        description="Crie novas variações artísticas ou adapte para diferentes formatos a partir do criativo atual."
        meta={["Variações", "Formatos", "Batch"]}
        onClick={onDerivar}
      />
      <ActionCard
        icon={<Sparkles size={20} />}
        title="Workflow de estilização"
        description="Aplique estilos visuais distintos ao criativo usando referências e controle de intensidade."
        meta={["Estilos", "Referências", "IA"]}
        onClick={onEstilizar}
      />
    </div>
  );
}
