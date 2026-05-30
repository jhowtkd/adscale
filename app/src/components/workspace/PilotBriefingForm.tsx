"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Lightbulb, Check } from "lucide-react";

// ============================================
// Types
// ============================================

interface CampaignBriefing {
  objective: string;
  audience: string;
  tone: string;
  platforms: string;
  ctaText: string;
  constraints: string;
}

interface PilotBriefingFormProps {
  analysis: {
    detectedConcept: string;
    tone: string;
    elements: string;
    format: string;
    suggestedObjective?: string;
    suggestedAudience?: string;
    suggestedTone?: string;
    suggestedPlatforms?: string;
    suggestedCta?: string;
  };
  onSubmit: (briefing: CampaignBriefing) => void;
  onSkip: () => void;
}

const TONE_OPTIONS = [
  "Profissional",
  "Casual",
  "Direto e persuasivo",
  "Emocional",
  "Humorístico",
  "Inspirador",
  "Técnico",
];

// ============================================
// Component
// ============================================

export default function PilotBriefingForm({
  analysis,
  onSubmit,
  onSkip,
}: PilotBriefingFormProps) {
  const [form, setForm] = useState<CampaignBriefing>({
    objective: "",
    audience: "",
    tone: "",
    platforms: "",
    ctaText: "",
    constraints: "",
  });

  useEffect(() => {
    setForm({
      objective: analysis.suggestedObjective ?? "",
      audience: analysis.suggestedAudience ?? "",
      tone: analysis.suggestedTone ?? "",
      platforms: analysis.suggestedPlatforms ?? "",
      ctaText: analysis.suggestedCta ?? "",
      constraints: "",
    });
  }, [analysis]);

  const handleChange = (
    field: keyof CampaignBriefing,
    value: string
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const isSuggested = (field: keyof CampaignBriefing) => {
    const map: Record<string, string | undefined> = {
      objective: analysis.suggestedObjective,
      audience: analysis.suggestedAudience,
      tone: analysis.suggestedTone,
      platforms: analysis.suggestedPlatforms,
      ctaText: analysis.suggestedCta,
    };
    return Boolean(map[field]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="w-full max-w-[640px]">
      {/* Detected Card */}
      <div className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4 mb-6 animate-fade-in">
        <div className="flex items-center gap-2 mb-3">
          <Check size={16} className="text-[var(--accent-green)]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)]">
            Detectado no criativo
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--ghost)] mb-1">
              Conceito
            </p>
            <p className="text-sm text-[var(--text-primary)]">{analysis.detectedConcept}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--ghost)] mb-1">
              Tom
            </p>
            <p className="text-sm text-[var(--text-primary)]">{analysis.tone}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--ghost)] mb-1">
              Elementos
            </p>
            <p className="text-sm text-[var(--text-primary)]">{analysis.elements}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--ghost)] mb-1">
              Formato
            </p>
            <p className="text-sm text-[var(--text-primary)]">{analysis.format}</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in">
        {/* Objetivo */}
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)] mb-1.5">
            Objetivo
          </label>
          <input
            type="text"
            value={form.objective}
            onChange={(e) => handleChange("objective", e.target.value)}
            placeholder="Ex: Aumentar vendas do lançamento"
            className="w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[var(--accent-green)]"
          />
          {isSuggested("objective") && (
            <p className="mt-1 flex items-center gap-1 text-xs text-[var(--accent-amber)]">
              <Lightbulb size={12} />
              Sugerido pela análise do criativo
            </p>
          )}
        </div>

        {/* Público-alvo */}
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)] mb-1.5">
            Público-alvo
          </label>
          <input
            type="text"
            value={form.audience}
            onChange={(e) => handleChange("audience", e.target.value)}
            placeholder="Ex: Jovens adultos 18-35"
            className="w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[var(--accent-green)]"
          />
          {isSuggested("audience") && (
            <p className="mt-1 flex items-center gap-1 text-xs text-[var(--accent-amber)]">
              <Lightbulb size={12} />
              Sugerido pela análise do criativo
            </p>
          )}
        </div>

        {/* Tom de voz */}
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)] mb-1.5">
            Tom de voz
          </label>
          <select
            value={form.tone}
            onChange={(e) => handleChange("tone", e.target.value)}
            className="w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-green)]"
          >
            <option value="">Selecione um tom</option>
            {TONE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {isSuggested("tone") && (
            <p className="mt-1 flex items-center gap-1 text-xs text-[var(--accent-amber)]">
              <Lightbulb size={12} />
              Sugerido pela análise do criativo
            </p>
          )}
        </div>

        {/* Plataformas */}
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)] mb-1.5">
            Plataformas
          </label>
          <input
            type="text"
            value={form.platforms}
            onChange={(e) => handleChange("platforms", e.target.value)}
            placeholder="Ex: Instagram, Facebook"
            className="w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[var(--accent-green)]"
          />
          {isSuggested("platforms") && (
            <p className="mt-1 flex items-center gap-1 text-xs text-[var(--accent-amber)]">
              <Lightbulb size={12} />
              Sugerido pela análise do criativo
            </p>
          )}
        </div>

        {/* CTA */}
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)] mb-1.5">
            CTA
          </label>
          <input
            type="text"
            value={form.ctaText}
            onChange={(e) => handleChange("ctaText", e.target.value)}
            placeholder="Ex: Compre agora"
            className="w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[var(--accent-green)]"
          />
          {isSuggested("ctaText") && (
            <p className="mt-1 flex items-center gap-1 text-xs text-[var(--accent-amber)]">
              <Lightbulb size={12} />
              Sugerido pela análise do criativo
            </p>
          )}
        </div>

        {/* Restrições */}
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)] mb-1.5">
            Restrições
          </label>
          <textarea
            value={form.constraints}
            onChange={(e) => handleChange("constraints", e.target.value)}
            placeholder="Ex: Não usar vermelho, manter logo no canto superior"
            rows={3}
            className="w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus:border-[var(--accent-green)] resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--border-dim)] bg-transparent px-6 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-all duration-200 hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] active:scale-[0.98]"
          >
            Pular sugestões
          </button>
          <button
            type="submit"
            className="group relative inline-flex min-h-10 items-center justify-center overflow-hidden rounded-md bg-[var(--ink)] px-6 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:-translate-y-px active:scale-[0.98]"
          >
            <span className="relative z-10 flex items-center gap-2">
              Confirmar e ir para ações
              <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
            </span>
            <span className="absolute inset-0 -translate-x-full bg-[var(--accent-green)] transition-transform duration-300 group-hover:translate-x-0" />
          </button>
        </div>
      </form>
    </div>
  );
}
