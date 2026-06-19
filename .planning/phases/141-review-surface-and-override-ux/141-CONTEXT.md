---
phase: 141
slug: review-surface-and-override-ux
status: planning
created: 2026-06-19
depends_on:
  - 140
requirements:
  - REVIEW-01
  - REVIEW-02
  - REVIEW-03
  - REVIEW-04
---

# Phase 141 - Context

## Goal

A workspace mostra a mesa de direcao correta: `Olhar` primeiro, `Exportacao` depois, decisoes humanas estruturadas e override auditavel.

## Why Now

Phases 138-140 trocaram a regua criativa do backend: existe constituicao do Olhar, voz Cenbrap inicial, dual verdicts, validador de exportacao, QA direction-first e prompt de geracao orientado por direcao de arte.

O ponto fraco agora esta na experiencia de review. A UI ainda herda a linguagem operacional antiga:

- card e modal priorizam `qualityScore`, `qualityVerdict` legado e status generico;
- a decisao humana ainda aparece como `approve/reject`, nao como direcao editorial;
- `DerivationReviewSheet` mostra qualidade como checklist longo, nao como leitura visual compacta;
- a API de review bloqueia `approved + invalid`, mas nao tem contrato de decisao estruturada (`Entra`, `Quase - regenerar assim`, `Nao entra`);
- pacote de aprovacao ainda olha principalmente para `status === approved` e `outputKey`, entao a fase precisa tornar explicita a regra de pacote contra `sem_opiniao`, `confusa` e `exportStatus: bloqueado`.

## Current Code Truth

Observed on 2026-06-19:

- `app/src/components/workspace/DerivationCard.tsx` still displays numeric score badges next to status and legacy invalid/improvable badges.
- `app/src/components/workspace/DerivationReviewSheet.tsx` contains a contract panel and a quality panel, but not a first-class Olhar/Exportacao split.
- `app/src/lib/hooks/use-review.ts` sends only `{ status: "approved" | "rejected" }`.
- `app/src/app/api/derivations/[id]/review/route.ts` already blocks unapprovable approval via `assertDerivationApprovable`.
- `app/src/server/ai/client-approval-package.ts` package eligibility is still rooted in approval status and output availability.
- `app/src/server/output-learning/output-decision-events.ts` and recorder already provide an auditable evidence path for output decisions.

## Design Principle

The review surface should feel like an art director's table, not a QA ticket.

Primary surface:

1. `Olhar`: verdict, direction note, what works, what blocks.
2. Decision: `Entra`, `Quase - regenerar assim`, `Nao entra`.
3. `Exportacao`: collapsed/secondary details for brand, CTA, claims, format and technical blockers.
4. Score: optional detail only, never the first visual priority.

## Non-Goals

- Do not implement full calibration reports; Phase 142 owns Cenbrap agreement evidence.
- Do not approve Cenbrap voice injection; `138-VOICE-REVIEW.md` remains the human gate.
- Do not redesign the whole workspace shell.
- Do not claim live quality improvement from UI changes alone.

## Open Debt Carried Forward

- v12.6 live corpus remains operator/data dependent.
- Phase 140 left workspace score demotion deferred by design.
- Existing generated derivations may not all have dual verdict payloads; UI must degrade gracefully.
