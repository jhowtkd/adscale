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
import { useTranslations } from "next-intl";
import type { DerivationIntent } from "@/lib/hooks/use-derivation-flow";

interface DerivarModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (intent: DerivationIntent) => void;
}

interface OptionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}

function OptionCard({ icon, title, description, onClick }: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col items-center rounded-xl border bg-[var(--surface-base)] p-5 text-center transition-all duration-200",
        "border-[var(--border-dim)] hover:border-[var(--accent-green)] hover:-translate-y-px",
        "hover:shadow-[0_0_20px_rgba(0,179,74,0.12)]"
      )}
    >
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--text-primary)] transition-colors duration-200 group-hover:bg-[var(--accent-green-dim)] group-hover:text-[var(--accent-green-text)]">
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

export default function DerivarModal({
  open,
  onClose,
  onSelect,
}: DerivarModalProps) {
  const t = useTranslations("workspace.derivar");

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette size={18} className="text-[var(--accent-green)]" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <OptionCard
            icon={<Palette size={22} />}
            title={t("options.manualArt.title")}
            description={t("options.manualArt.description")}
            onClick={() => onSelect("manual_art")}
          />
          <OptionCard
            icon={<Wand2 size={22} />}
            title={t("options.autoArt.title")}
            description={t("options.autoArt.description")}
            onClick={() => onSelect("auto_art")}
          />
          <OptionCard
            icon={<Crop size={22} />}
            title={t("options.singleFormat.title")}
            description={t("options.singleFormat.description")}
            onClick={() => onSelect("single_format")}
          />
          <OptionCard
            icon={<Layers size={22} />}
            title={t("options.batchFormat.title")}
            description={t("options.batchFormat.description")}
            onClick={() => onSelect("batch_format")}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
