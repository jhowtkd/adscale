"use client";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Palette, Wand2, Crop, Layers } from "lucide-react";

// ============================================
// Types
// ============================================

interface DerivarModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (
    mode: "art_variation" | "format_adaptation",
    config: { batch?: boolean; auto?: boolean }
  ) => void;
}

interface OptionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}

// ============================================
// Sub-components
// ============================================

function OptionCard({ icon, title, description, onClick }: OptionCardProps) {
  return (
    <button type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col items-center rounded-xl border bg-[var(--surface-base)] p-5 text-center transition-all duration-200",
        "border-[var(--border-dim)] hover:border-[var(--accent-green)] hover:-translate-y-px",
        "hover:shadow-[0_0_20px_rgba(0,179,74,0.12)]"
      )}
    >
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--text-primary)] transition-colors duration-200 group-hover:bg-[var(--accent-green-dim)] group-hover:text-[var(--accent-green)]">
        {icon}
      </div>
      <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
        {title}
      </h4>
      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
        {description}
      </p>
    </button>
  );
}

// ============================================
// Component
// ============================================

export default function DerivarModal({
  open,
  onClose,
  onSelect,
}: DerivarModalProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette size={18} className="text-[var(--accent-green)]" />
            Derivar criativo
          </DialogTitle>
          <DialogDescription>
            Escolha como deseja derivar novos criativos a partir do atual.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <OptionCard
            icon={<Palette size={22} />}
            title="Criar novas variações"
            description="Configure manualmente os parâmetros para gerar variações artísticas."
            onClick={() => onSelect("art_variation", { auto: false })}
          />
          <OptionCard
            icon={<Wand2 size={22} />}
            title="Gerar novas variações"
            description="Deixe a IA sugerir automaticamente variações baseadas no criativo."
            onClick={() => onSelect("art_variation", { auto: true })}
          />
          <OptionCard
            icon={<Crop size={22} />}
            title="Variir tamanhos"
            description="Adapte o criativo para um único formato de tela diferente."
            onClick={() => onSelect("format_adaptation", { batch: false })}
          />
          <OptionCard
            icon={<Layers size={22} />}
            title="Criar derivações de tamanhos"
            description="Gere em lote adaptações para múltiplos formatos de uma vez."
            onClick={() => onSelect("format_adaptation", { batch: true })}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
