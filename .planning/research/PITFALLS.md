# Pitfalls Research: v11.5 Qualidade IA Orientada por Feedback

**Date:** 2026-06-05
**Milestone:** v11.5 Qualidade IA Orientada por Feedback

## Pitfall: Prompt Changes Break Existing Modes

**Risk:** Fixing one mode degrades another, especially art variation vs format adaptation vs restyling.

**Prevention:** Add prompt snapshots and fixtures per mode before broad prompt changes.

## Pitfall: Scoring Contradicts QA

**Risk:** User sees high score and hard failure at the same time, or QA suggests export while review blocks approval.

**Prevention:** Standardize criteria names, verdict thresholds and hard failure taxonomy across score, QA and quality gate.

## Pitfall: Feedback Becomes Prompt Injection

**Risk:** Beta feedback text is passed directly into regeneration and overrides hard rules.

**Prevention:** Convert feedback to categorized issue context; never let feedback override contract fields.

## Pitfall: Overblocking

**Risk:** QA blocks too many outputs for subjective polish issues and users lose trust.

**Prevention:** Keep hard failures limited to contract-breaking issues: wrong CTA, missing offer/product, severe illegibility, bad format, factual contamination, unsafe cropping.

## Pitfall: No Visual Evidence

**Risk:** Tests only assert strings and miss real visual failures.

**Prevention:** Combine prompt/logic tests with a small manual or semi-automated fixture checklist for known visual failure categories.

## Pitfall: Costly Auto Loops

**Risk:** Automatic regeneration loops burn credits and still fail.

**Prevention:** Keep regeneration user-confirmed; improve suggestions and context before automating retries.
