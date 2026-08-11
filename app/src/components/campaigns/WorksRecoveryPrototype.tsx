"use client";

// DESIGN PROTOTYPE — THROWAWAY. Keep only the selected direction after HITL review.
import { useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, ImageOff, RotateCcw } from "lucide-react";
import { PrototypeSwitcher } from "@/components/prototype/PrototypeSwitcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Variant = "A" | "B" | "C";
type Stage = "Rascunho" | "Gerando" | "Em revisão" | "Aprovado" | "Falhou";
type Lane = "Continuar" | "Revisar" | "Recuperar";

type PrototypeWork = {
  id: string;
  name: string;
  brand: string;
  protocol: string;
  stage: Stage;
  results: string;
  origin: string;
  updated: string;
  nextAction: string;
  lane: Lane;
  accent?: string;
};

const VARIANTS = [
  { id: "A", label: "Fila visual" },
  { id: "B", label: "Grade editorial" },
  { id: "C", label: "Próxima ação" },
] as const;

const WORKS: PrototypeWork[] = [
  { id: "preceptoria", name: "Preceptoria em Saúde", brand: "CENBRAP", protocol: "Peça única", stage: "Em revisão", results: "1 resultado", origin: "Avulso", updated: "há 8 min", nextAction: "Revisar", lane: "Revisar", accent: "linear-gradient(145deg,#172554,#2563eb 55%,#f8fafc)" },
  { id: "pos", name: "Lançamento Pós 2026", brand: "CENBRAP", protocol: "Variações", stage: "Gerando", results: "3 de 5 resultados", origin: "Campanha · Pós 2026", updated: "há 12 min", nextAction: "Acompanhar", lane: "Continuar", accent: "linear-gradient(145deg,#052e2b,#0f766e 58%,#fde68a)" },
  { id: "black-friday", name: "Black Friday — Stories", brand: "Loja Pascoal", protocol: "Adaptar formatos", stage: "Falhou", results: "2 de 3 resultados", origin: "Campanha · Black Friday", updated: "há 26 min", nextAction: "Recuperar geração", lane: "Recuperar", accent: "linear-gradient(145deg,#18181b,#7f1d1d 60%,#fb923c)" },
  { id: "norte", name: "Reposicionamento institucional", brand: "Marca Norte", protocol: "Mudar estilo", stage: "Rascunho", results: "Nenhum resultado", origin: "Avulso", updated: "ontem", nextAction: "Continuar briefing", lane: "Continuar" },
  { id: "medicos", name: "Dia do Médico", brand: "CENBRAP", protocol: "Peça única", stage: "Aprovado", results: "3 resultados", origin: "Campanha · Datas", updated: "há 2 dias", nextAction: "Abrir trabalho", lane: "Revisar", accent: "linear-gradient(145deg,#3f1d5e,#9333ea 58%,#f5d0fe)" },
];

const STAGE_STYLE: Record<Stage, string> = {
  Rascunho: "bg-neutral-100 text-neutral-700",
  Gerando: "bg-blue-50 text-blue-700",
  "Em revisão": "bg-amber-50 text-amber-800",
  Aprovado: "bg-emerald-50 text-emerald-700",
  Falhou: "bg-red-50 text-red-700",
};

function WorkPreview({ work, compact = false }: { work: PrototypeWork; compact?: boolean }) {
  return (
    <div
      className={cn("relative flex shrink-0 items-end overflow-hidden rounded-[var(--radius-control)] bg-[var(--surface-inset)]", compact ? "h-20 w-20" : "aspect-[4/3] w-full")}
      style={work.accent ? { background: work.accent } : undefined}
    >
      {work.accent ? (
        <div className="p-3 text-white"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-80">{work.brand}</p><p className="mt-0.5 max-w-40 text-sm font-bold leading-tight">{work.name}</p></div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-[var(--text-muted)]"><ImageOff className="size-5" /><span className="text-[10px] leading-tight">Sem preview<br />briefing preservado</span></div>
      )}
    </div>
  );
}

function StageBadge({ stage }: { stage: Stage }) {
  return <span className={cn("inline-flex rounded-full px-2 py-1 text-xs font-medium", STAGE_STYLE[stage])}>{stage}</span>;
}

function ActionButton({ work, onTry, subtle = false }: { work: PrototypeWork; onTry: (work: PrototypeWork) => void; subtle?: boolean }) {
  const Icon = work.stage === "Falhou" ? RotateCcw : ArrowUpRight;
  return (
    <Button type="button" onClick={() => onTry(work)} aria-label={`${work.nextAction}: ${work.name}`} variant={subtle ? "outline" : work.stage === "Falhou" ? "destructive" : "default"}>
      {work.nextAction}<Icon className="size-4" />
    </Button>
  );
}

function VisualQueue({ onTry }: { onTry: (work: PrototypeWork) => void }) {
  return (
    <div className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)]">
      {WORKS.map((work) => (
        <article key={work.id} className="grid gap-3 p-3 sm:grid-cols-[5rem_minmax(0,1fr)_9rem_12rem] sm:items-center">
          <WorkPreview work={work} compact />
          <div className="min-w-0"><h2 className="truncate font-semibold text-[var(--text-primary)]">{work.name}</h2><p className="truncate text-sm text-[var(--text-secondary)]">{work.brand} · {work.protocol}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{work.origin} · {work.updated}</p></div>
          <div className="space-y-1"><StageBadge stage={work.stage} /><p className="text-xs text-[var(--text-muted)]">{work.results}</p></div>
          <ActionButton work={work} onTry={onTry} />
        </article>
      ))}
    </div>
  );
}

function EditorialGrid({ onTry }: { onTry: (work: PrototypeWork) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {WORKS.map((work) => (
        <article key={work.id} className="overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] shadow-sm">
          <WorkPreview work={work} />
          <div className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-semibold">{work.name}</h2><p className="text-sm text-[var(--text-secondary)]">{work.brand}</p></div><StageBadge stage={work.stage} /></div>
            <dl className="grid grid-cols-2 gap-2 text-xs"><div><dt className="text-[var(--text-muted)]">Protocolo</dt><dd>{work.protocol}</dd></div><div><dt className="text-[var(--text-muted)]">Resultados</dt><dd>{work.results}</dd></div><div className="col-span-2"><dt className="text-[var(--text-muted)]">Origem</dt><dd>{work.origin}</dd></div></dl>
            <ActionButton work={work} onTry={onTry} subtle />
          </div>
        </article>
      ))}
    </div>
  );
}

function ActionLanes({ onTry }: { onTry: (work: PrototypeWork) => void }) {
  const laneMeta: Array<{ id: Lane; icon: typeof Clock3; detail: string }> = [
    { id: "Continuar", icon: Clock3, detail: "Retome de onde parou" },
    { id: "Revisar", icon: CheckCircle2, detail: "Decisões esperando você" },
    { id: "Recuperar", icon: AlertTriangle, detail: "Falhas com saída segura" },
  ];
  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      {laneMeta.map(({ id, icon: Icon, detail }) => (
        <section key={id} className="space-y-3 rounded-[var(--radius-object)] bg-[var(--surface-raised)] p-3">
          <header className="flex items-start gap-2"><Icon className="mt-0.5 size-4" /><div><h2 className="font-semibold">{id}</h2><p className="text-xs text-[var(--text-muted)]">{detail}</p></div></header>
          {WORKS.filter((work) => work.lane === id).map((work) => (
            <article key={work.id} className="space-y-3 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3">
              <div className="flex gap-3"><WorkPreview work={work} compact /><div className="min-w-0"><h3 className="font-medium leading-tight">{work.name}</h3><p className="mt-1 text-xs text-[var(--text-secondary)]">{work.brand} · {work.protocol}</p><div className="mt-2"><StageBadge stage={work.stage} /></div></div></div>
              <p className="text-xs text-[var(--text-muted)]">{work.results} · {work.updated}</p>
              <ActionButton work={work} onTry={onTry} />
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

export function WorksRecoveryPrototype({ variant }: { variant: Variant }) {
  const [notice, setNotice] = useState("");
  const onTry = (work: PrototypeWork) => setNotice(`${work.nextAction} é apenas demonstrativo; nenhum trabalho foi alterado.`);
  return (
    <div className="w-full space-y-5 pb-20">
      <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--text-muted)]">Protótipo descartável · decisão #207</p><h1 className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">Trabalhos</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">Reconheça pelo visual e retome do ponto certo.</p></div><p className="text-sm text-[var(--text-muted)]">5 trabalhos · atualização recente</p></header>
      {variant === "A" ? <VisualQueue onTry={onTry} /> : variant === "B" ? <EditorialGrid onTry={onTry} /> : <ActionLanes onTry={onTry} />}
      <p role="status" className={notice ? "text-center text-sm text-[var(--text-secondary)]" : "sr-only"}>{notice}</p>
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </div>
  );
}
