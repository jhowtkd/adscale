/**
 * Contrato canônico de trabalho criativo (Convergence Phase 2 / Gate 2).
 *
 * Camada de leitura apenas — não migra persistência. Campanha e Creative Work
 * (Criar Post) projetam-se nesta interface consumível compartilhada.
 *
 * ADR 0013 + docs/plans/2026-07-12-convergencia-produto-arquitetura-implementation-plan.md
 */
import type {
  CreativeWorkFunnelStage,
  CreativeWorkOrigin,
} from "@/server/creative-work/funnel-events";

export type CanonicalWorkOrigin = CreativeWorkOrigin;
export type CanonicalWorkState = CreativeWorkFunnelStage;
export type CanonicalWorkNextAction = "resume" | "review" | "retry" | "open";

export type CanonicalWorkRefKind = "campaign" | "creative_work";

/** Stable cross-origin id: `campaign:<uuid>` | `creative_work:<uuid>`. */
export type CanonicalWorkId = `${CanonicalWorkRefKind}:${string}`;

export interface CanonicalIntent {
  kind: "campaign" | "social_post" | "assistant_goal";
  objective: string | null;
  formatHint: string | null;
  platforms: string[];
}

export interface CanonicalBriefing {
  product: string | null;
  client: string | null;
  audience: string | null;
  offer: string | null;
  tone: string | null;
  constraints: string | null;
  notes: string | null;
  headline: string | null;
  body: string | null;
  cta: string | null;
  theme: string | null;
}

export type CanonicalOutputStatus =
  | "queued"
  | "processing"
  | "ready"
  | "approved"
  | "rejected"
  | "failed";

export interface CanonicalOutput {
  id: string;
  sourceKind: "derivation" | "creative_work_output";
  status: CanonicalOutputStatus;
  format: string | null;
  creativeLevel: string | null;
  outputKey: string | null;
  isSelected: boolean;
  versionLabel: string;
  createdAt: string | null;
}

/** Version view over an output (lineage-lite until Phase 5). */
export interface CanonicalVersion {
  id: string;
  label: string;
  outputId: string;
  createdAt: string | null;
}

export interface CanonicalCreativeWork {
  id: CanonicalWorkId;
  originKind: CanonicalWorkRefKind;
  originId: string;
  origin: CanonicalWorkOrigin;
  workspaceId: string;
  clientProfileId: string | null;
  name: string;
  state: CanonicalWorkState;
  intent: CanonicalIntent;
  briefing: CanonicalBriefing;
  outputs: CanonicalOutput[];
  versions: CanonicalVersion[];
  selectedOutputId: string | null;
  createdAt: string;
  updatedAt: string;
  /** True when the work can be resumed in its native surface. */
  resumable: boolean;
  /** Path hint for resume (no UI change in Phase 2 — contract only). */
  resumeHref: string;
  protocol?: string | null;
  brandName?: string | null;
  previewHref?: string | null;
  previewAlt?: string | null;
  resultCount?: number;
  nextAction?: CanonicalWorkNextAction;
}

export interface CanonicalWorkSummary {
  id: CanonicalWorkId;
  originKind: CanonicalWorkRefKind;
  originId: string;
  origin: CanonicalWorkOrigin;
  workspaceId: string;
  clientProfileId: string | null;
  name: string;
  state: CanonicalWorkState;
  updatedAt: string;
  resumable: boolean;
  resumeHref: string;
  protocol?: string | null;
  brandName?: string | null;
  previewHref?: string | null;
  previewAlt?: string | null;
  resultCount?: number;
  nextAction?: CanonicalWorkNextAction;
}

export function makeCanonicalWorkId(
  kind: CanonicalWorkRefKind,
  originId: string
): CanonicalWorkId {
  return `${kind}:${originId}`;
}

export function parseCanonicalWorkId(
  id: string
): { kind: CanonicalWorkRefKind; originId: string } | null {
  const campaign = id.match(/^campaign:([0-9a-f-]{36})$/i);
  if (campaign) return { kind: "campaign", originId: campaign[1] };
  const work = id.match(/^creative_work:([0-9a-f-]{36})$/i);
  if (work) return { kind: "creative_work", originId: work[1] };
  return null;
}

export function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function requireIso(value: Date | string | null | undefined): string {
  return toIso(value) ?? new Date(0).toISOString();
}
