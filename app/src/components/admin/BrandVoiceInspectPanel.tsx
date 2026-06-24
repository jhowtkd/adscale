"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

type VoiceConfigSection = {
  principles: string[];
  positiveSignals: string[];
  negativeSignals: string[];
  authorityAndClaims: string[];
  inviteRhythm: string[];
  correctButSoulless: string[];
  matchTerms?: string[];
};

type BrandVoiceInspectResponse = {
  clientProfileId: string;
  workspaceId: string;
  voiceId: string;
  displayName: string;
  reviewStatus: "pending_review" | "approved" | "changes_requested";
  source: string;
  config: VoiceConfigSection;
  approvedAt: string | null;
};

const SECTION_LABELS: Array<{ key: keyof VoiceConfigSection; label: string }> = [
  { key: "principles", label: "Princípios" },
  { key: "positiveSignals", label: "Sinais positivos" },
  { key: "negativeSignals", label: "Sinais negativos" },
  { key: "authorityAndClaims", label: "Autoridade e claims" },
  { key: "inviteRhythm", label: "Ritmo de convite" },
  { key: "correctButSoulless", label: "Correto mas sem alma" },
  { key: "matchTerms", label: "Termos de match" },
];

const REVIEW_STATUS_LABELS: Record<BrandVoiceInspectResponse["reviewStatus"], string> = {
  pending_review: "Pendente de revisão",
  approved: "Aprovado",
  changes_requested: "Alterações solicitadas",
};

async function fetchBrandVoice(
  clientProfileId: string
): Promise<BrandVoiceInspectResponse | "not_found" | "forbidden"> {
  const res = await apiFetch(`/api/admin/quality/brands/${clientProfileId}/voice`);
  if (res.status === 403) return "forbidden";
  if (res.status === 404) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (body.error === "voice_config_not_found") return "not_found";
    return "not_found";
  }
  if (!res.ok) throw new Error("failed");
  return (await res.json()) as BrandVoiceInspectResponse;
}

function VoiceSectionList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium text-[var(--text-primary)]">{title}</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function BrandVoiceInspectPanel({ clientProfileId }: { clientProfileId: string }) {
  const voiceQuery = useQuery({
    queryKey: ["brand-voice-inspect", clientProfileId],
    queryFn: () => fetchBrandVoice(clientProfileId),
    retry: false,
  });

  if (voiceQuery.isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">Carregando configuração de voz…</p>;
  }

  if (voiceQuery.data === "forbidden") {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        A inspeção de voz da marca é restrita a proprietários da plataforma.
      </p>
    );
  }

  if (voiceQuery.isError) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Não foi possível carregar a configuração de voz.
      </p>
    );
  }

  if (voiceQuery.data === "not_found") {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Nenhuma configuração de voz para esta marca.
      </p>
    );
  }

  if (!voiceQuery.data) {
    return null;
  }

  const voice = voiceQuery.data;

  return (
    <div className="space-y-6">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Marca</dt>
          <dd className="text-sm text-[var(--text-primary)]">{voice.displayName}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Voice ID</dt>
          <dd className="font-mono text-sm text-[var(--text-primary)]">{voice.voiceId}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
            Status de revisão
          </dt>
          <dd className="text-sm text-[var(--text-primary)]">
            {REVIEW_STATUS_LABELS[voice.reviewStatus]}
            <span className="ml-2 font-mono text-xs text-[var(--text-muted)]">
              ({voice.reviewStatus})
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Origem</dt>
          <dd className="font-mono text-sm text-[var(--text-primary)]">{voice.source}</dd>
        </div>
        {voice.approvedAt ? (
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
              Aprovado em
            </dt>
            <dd className="text-sm text-[var(--text-primary)]">
              {new Date(voice.approvedAt).toLocaleString("pt-BR")}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="space-y-5 border-t border-[var(--border-dim)] pt-6">
        {SECTION_LABELS.map(({ key, label }) => {
          const items = voice.config[key] ?? [];
          return <VoiceSectionList key={key} title={label} items={items} />;
        })}
      </div>
    </div>
  );
}
