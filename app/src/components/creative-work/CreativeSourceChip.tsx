"use client";

type Usage = "content" | "style" | "both";
type Status = "uploaded" | "analyzing" | "ready" | "failed";

type Props = {
  source: {
    id: string;
    name: string;
    origin: "upload" | "template" | "approved_work";
    usage: Usage;
    status: Status;
    contentAnalysis: Record<string, unknown> | null;
    styleAnalysis: Record<string, unknown> | null;
  };
  onUsageChange: (usage: Usage) => void;
  onReview: () => void;
  onRetry: () => void;
  onRemove: () => void;
};

const STATUS_LABELS: Record<Status, string> = {
  uploaded: "Upload concluído; aguardando análise",
  analyzing: "Analisando arte",
  ready: "Análise concluída",
  failed: "Falha na análise",
};

export function CreativeSourceChip({ source, onUsageChange, onReview, onRetry, onRemove }: Props) {
  const chips = [
    source.contentAnalysis?.product,
    source.contentAnalysis?.offer,
    source.styleAnalysis?.mood,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  return (
    <article className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div><strong>{source.name}</strong><div className="text-xs text-[var(--text-muted)]">{source.origin === "template" ? "Template" : source.origin === "approved_work" ? "Trabalho aprovado" : "Upload"}</div></div>
        <button type="button" onClick={onRemove} aria-label="Remover fonte">Remover</button>
      </div>
      <div className="mt-2 flex gap-2" role="group" aria-label="Usar arte como">
        {(["content", "style", "both"] as const).map((usage) => (
          <button key={usage} type="button" aria-pressed={source.usage === usage} onClick={() => onUsageChange(usage)}>
            {usage === "content" ? "Conteúdo" : usage === "style" ? "Estilo" : "Ambos"}
          </button>
        ))}
      </div>
      <p role="status" aria-live="polite" className="mt-2 text-sm">{STATUS_LABELS[source.status]}</p>
      {chips.length > 0 && (
        <details className="mt-2">
          <summary>Dados extraídos</summary>
          <div className="flex flex-wrap gap-1">{chips.map((chip) => <span key={chip}>{chip}</span>)}</div>
        </details>
      )}
      <div className="mt-2 flex gap-2">
        {source.status === "ready" && <button type="button" onClick={onReview}>Revisar dados</button>}
        {source.status === "failed" && <button type="button" onClick={onRetry}>Tentar novamente</button>}
      </div>
    </article>
  );
}
