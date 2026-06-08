# Project Research Summary

**Project:** ADScale v12.0 Monetização Real
**Domain:** SaaS subscription billing atop existing credit ledger
**Researched:** 2026-06-08
**Confidence:** HIGH

## Executive Summary

ADScale already has ~80% of Stripe billing implemented (Checkout with 14-day trial, Customer Portal, webhook handlers, monthly credit grants on `invoice.paid`, beta entitlements). v12.0 is a **production hardening + conversion** milestone, not a greenfield billing build.

The recommended approach: go-live checklist first, then clarify subscription status in access/UX, wire checkout CTAs to existing 402 block surfaces, and preserve beta codes for invited cohorts. Main risks are double credit grants, webhook idempotency, and confusing `past_due`/beta exhaustion states.

## Key Findings

**Stack:** Keep Stripe Checkout Sessions + existing credit ledger. No new payment libraries.

**Must have:** Prod webhook, trial→paid credit grant path, upgrade from 402, portal access, beta exhaustion CTA.

**Defer:** Annual plans, top-ups, Stripe Tax, dunning emails, admin cohort UI.

## Implications for Roadmap

| Phase | Name | Rationale |
|-------|------|-----------|
| 97 | Go-Live & Lifecycle | Webhook prod, idempotency tests, status model |
| 98 | Dunning & Access Policy | past_due UX, spend rules, portal prompts |
| 99 | Beta→Paid Conversion | 402 CTAs, beta exhaustion, mission hooks |
| 100 | Billing UI & History | Status badges, grants/invoices list |
| 101 | Regression & Ship | TestSprite, full CI, runbook |

**Overall confidence:** HIGH — codebase is source of truth; Stripe patterns are standard.

---
*Research completed: 2026-06-08*
*Ready for roadmap: yes*
