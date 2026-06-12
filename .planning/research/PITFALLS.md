# Pitfalls Research

**Domain:** Importing ad performance and deriving creative recommendations
**Researched:** 2026-06-12
**Confidence:** HIGH

## Critical Pitfalls

### 1. Declaring winners from non-comparable delivery

**What goes wrong:** A creative with different audience, budget, placement or date window is called superior.

**Avoid:** Store context and require comparison eligibility. Provide `not comparable` and `no clear winner` states.

**Warning signs:** Ranking exists without platform/window/objective/sample explanation.

**Phase:** Comparison foundation.

### 2. Treating directional asset ratios as causal truth

**What goes wrong:** CTR/CPA/ROAS for an asset is attributed entirely to the image although delivery and asset combinations affected it.

**Avoid:** Label observational results as directional; reserve stronger language for controlled hypotheses with one changed variable.

**Warning signs:** “This CTA caused +X% ROAS” from a normal campaign export.

**Phase:** Hypothesis and interpretation UX.

### 3. Duplicate or mutable imports corrupt memory

**What goes wrong:** Re-importing a file doubles spend/conversions, or attribution updates silently replace history.

**Avoid:** File hash, source identity, batch audit, transactional upsert and explicit replacement summary.

**Warning signs:** Totals change after retry without an audit event.

**Phase:** Import foundation.

### 4. Locale and currency normalization errors

**What goes wrong:** `1.234,56` becomes `1.23456`, percentage fields are multiplied twice, or BRL and USD are aggregated.

**Avoid:** Mapping preview, explicit locale/currency, decimal-string parsing, same-currency comparisons only.

**Warning signs:** Derived CPC/ROAS disagrees with source by orders of magnitude.

**Phase:** Import foundation.

### 5. Sparse data presented with false confidence

**What goes wrong:** One click or one conversion becomes a permanent client rule.

**Avoid:** Minimum evidence thresholds, sample display, confidence tiers, contradiction retention and recency metadata.

**Warning signs:** Recommendation cards omit counts/date range or never say insufficient evidence.

**Phase:** Learning engine.

### 6. CSV injection and unsafe exports

**What goes wrong:** Imported labels beginning with formula characters later execute when exported/opened in spreadsheets.

**Avoid:** Treat CSV cells as untrusted, bound lengths, sanitize spreadsheet exports, and never execute formulas.

**Warning signs:** Raw labels are round-tripped to export without formula neutralization.

**Phase:** Import foundation and security verification.

### 7. Cross-workspace learning leakage

**What goes wrong:** Client performance or recommendations include another workspace's data.

**Avoid:** Workspace ID on every table and repository predicate; verify campaign/derivation/client relationships server-side.

**Warning signs:** Repository accepts only derivation ID or client ID without workspace ID.

**Phase:** Data foundation.

### 8. LLM becomes the evidence engine

**What goes wrong:** Recommendations change nondeterministically or cite nonexistent campaigns.

**Avoid:** Deterministic comparison and evidence packet; optional model only formats bounded facts.

**Warning signs:** Prompt receives raw database dump and returns winner/confidence directly.

**Phase:** Recommendation engine.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store entire CSV as JSONB | Fast prototype | Poor constraints, dedupe and querying | Keep original mapping metadata only |
| Trust imported CTR/CPA/ROAS | Less math | Contradictions and locale errors | Display source comparison only |
| Append-only without source identity | Simple insert | Duplicate totals | Never |
| Hardcode Meta column names | Quick demo | Breaks other exports/locales | Only as optional mapping preset |
| Publish learnings directly to Mem0 | Easy retrieval | No audit/recompute path | Only after Postgres canonical learning exists |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Import fails after submit with generic error | User cannot repair file | Preview rows, field errors, downloadable rejected-row report |
| One giant metrics dashboard | No next action | Campaign result summary plus client pattern plus recommended experiment |
| Hidden comparison filters | User trusts invalid winner | Show platform, period, objective, sample and exclusion reasons |
| Recommendation auto-applies | User loses creative control | Accept/edit/ignore and show exactly what will prefill |

## Looks Done But Is Not

- [ ] Re-importing the same data does not double totals.
- [ ] Updated attribution windows replace the intended snapshot and leave audit evidence.
- [ ] Manual and CSV paths produce the same canonical record.
- [ ] Currency, decimal comma, percentages, blank conversions and zero denominators are tested.
- [ ] `no clear winner`, `not comparable` and `insufficient evidence` are first-class UI states.
- [ ] Every learning cites supporting and contradicting campaigns/derivations.
- [ ] Workspace isolation tests cover all new APIs and repositories.
- [ ] Spreadsheet exports neutralize formula-leading cells.

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Duplicates, locale, CSV security, isolation | Data and Import Foundation | Fixture matrix + retry/import audit tests |
| Non-comparable and directional claims | Hypothesis and Comparison | Controlled/observational scenario tests |
| Sparse data and contradictions | Client Learning | Threshold and contradictory-evidence fixtures |
| LLM as evidence engine | Recommendation to Action | Deterministic packet snapshot tests |
| Looks done but isn't | Release Gate | Full tests, build, migration check and operator UAT |

## Sources

- https://support.google.com/google-ads/answer/16259414 — asset ratios are directional
- https://support.google.com/google-ads/answer/6318747 — insufficient data and no-clear-winner behavior
- https://support.google.com/google-ads/answer/13719071 — isolate one variable
- https://owasp.org/www-community/attacks/CSV_Injection — spreadsheet formula injection
- https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/07-Input_Validation_Testing/21-Testing_for_CSV_Injection — CSV injection testing
- https://www.postgresql.org/docs/current/sql-copy.html — import error and transaction characteristics

---
*Pitfalls research for: v12.1 Memória Criativa e Aprendizado de Performance*
*Researched: 2026-06-12*
