"use client";

import { ShieldAlert, Flame, TrendingUp, HelpCircle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  usePersonaSimulation,
  useCreatePersonaSimulation,
  type PersonaResult,
} from "@/lib/hooks/use-persona-simulation";

// ============================================
// Types
// ============================================

interface PersonaSimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceType: "derivation" | "landing_page";
  sourceId: string;
  campaignName?: string;
}

type PersonaKey = "skeptical_buyer" | "warm_lead" | "financial_decision_maker" | "beginner";

// ============================================
// Persona Card
// ============================================

const personaIcons: Record<PersonaKey, React.ComponentType<{ size?: number; className?: string }>> = {
  skeptical_buyer: ShieldAlert,
  warm_lead: Flame,
  financial_decision_maker: TrendingUp,
  beginner: HelpCircle,
};

interface PersonaCardProps {
  personaKey: PersonaKey;
  result: PersonaResult;
}

function PersonaCard({ personaKey, result }: PersonaCardProps) {
  const t = useTranslations("personaSimulation");
  const Icon = personaIcons[personaKey];

  return (
    <div className="bg-[var(--surface-base)] border border-[var(--border-dim)] rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Icon size={18} className="text-[var(--text-secondary)]" />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t(personaKey)}</h3>
      </div>

      {/* Sections */}
      <div className="space-y-2">
        <div className="bg-[var(--accent-green-dim)] rounded-lg p-3">
          <span className="text-[10px] uppercase font-medium text-[var(--accent-green)]">
            {t("understands")}
          </span>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">{result.understands}</p>
        </div>

        <div className="bg-[var(--accent-rose)]/10 rounded-lg p-3">
          <span className="text-[10px] uppercase font-medium text-[var(--accent-rose)]">
            {t("rejects")}
          </span>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">{result.rejects}</p>
        </div>

        <div className="bg-[var(--accent-amber)]/10 rounded-lg p-3">
          <span className="text-[10px] uppercase font-medium text-[var(--accent-amber)]">
            {t("wants")}
          </span>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">{result.wants}</p>
        </div>
      </div>

      {/* Would click */}
      <div className="flex items-start gap-2 pt-1">
        <Badge
          className={cn(
            "text-xs shrink-0",
            result.wouldClick
              ? "bg-[var(--accent-green-dim)] text-[var(--accent-green)] border-[var(--accent-green)]/20"
              : "bg-[var(--accent-rose)]/10 text-[var(--accent-rose)] border-[var(--accent-rose)]/20"
          )}
        >
          {result.wouldClick ? t("yes") : t("no")}
        </Badge>
        <div>
          <span className="text-[10px] uppercase font-medium text-[var(--text-muted)]">
            {t("rationale")}
          </span>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">{result.rationale}</p>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Skeleton Card
// ============================================

function SkeletonCard() {
  return (
    <div className="bg-[var(--surface-base)] border border-[var(--border-dim)] rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="space-y-2">
        <div className="bg-[var(--surface-raised)] rounded-lg p-3 space-y-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
        <div className="bg-[var(--surface-raised)] rounded-lg p-3 space-y-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <div className="bg-[var(--surface-raised)] rounded-lg p-3 space-y-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-full" />
        </div>
      </div>
      <div className="flex items-start gap-2 pt-1">
        <Skeleton className="h-5 w-10 rounded-full" />
        <div className="space-y-1 flex-1">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-full" />
        </div>
      </div>
    </div>
  );
}

// ============================================
// Main Modal
// ============================================

export default function PersonaSimulationModal({
  isOpen,
  onClose,
  sourceType,
  sourceId,
  campaignName,
}: PersonaSimulationModalProps) {
  const t = useTranslations("personaSimulation");
  const commonT = useTranslations("common");

  const { data, isLoading, isError, refetch } = usePersonaSimulation(sourceType, sourceId);
  const createMutation = useCreatePersonaSimulation();

  const handleRegenerate = () => {
    createMutation.mutate({ sourceType, sourceId });
  };

  const results = data?.results;
  const isGenerating = createMutation.isPending;

  const personaKeys: PersonaKey[] = [
    "skeptical_buyer",
    "warm_lead",
    "financial_decision_maker",
    "beginner",
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl bg-[var(--deep-bg)] border-[var(--border-dim)] text-[var(--text-primary)]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-[var(--text-primary)]">
            {t("personaAnalysis")}
          </DialogTitle>
          {campaignName ? (
            <DialogDescription className="text-sm text-[var(--text-secondary)]">
              {campaignName}
            </DialogDescription>
          ) : (
            <DialogDescription className="text-sm text-[var(--text-secondary)]">
              {t("personaAnalysisSubtitle")}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="py-4">
          {isLoading || isGenerating ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {personaKeys.map((key) => (
                <SkeletonCard key={key} />
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <p className="text-sm text-[var(--accent-rose)]">{commonT("error")}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="border-[var(--border-dim)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
              >
                {commonT("retry")}
              </Button>
            </div>
          ) : results ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {personaKeys.map((key) => (
                <PersonaCard key={key} personaKey={key} result={results[key]} />
              ))}
            </div>
          ) : null}

          {data?.cached && (
            <div className="mt-3 text-right">
              <span className="text-[10px] text-[var(--text-muted)]">
                {t("cachedResult")}
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-[var(--border-dim)] bg-transparent">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={isGenerating}
            className="border-[var(--accent-green)] text-[var(--accent-green)] hover:bg-[var(--accent-green-dim)]"
          >
            {isGenerating ? (
              <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-1" />
            )}
            {t("reGenerate")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="border-[var(--border-dim)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
          >
            {commonT("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
