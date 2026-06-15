# Pitfalls Research: v12.3 Integridade Criativa

**Researched:** 2026-06-15
**Confidence:** HIGH

## Critical Pitfalls

### 1. Declared-but-unwired rules (CURRENT STATE)

**Warning sign:** Constants exist; ESLint `no-unused-vars`; tests pass; corpus fails.

**Prevention:** Every new rule needs prompt regression asserting section presence.

**Phase:** 122 (tests) + 116 (contract)

### 2. Preserve-all-modules prompts

**Warning sign:** "preserve every visual element", "all badges/icons/panels" in same prompt as simplify.

**Prevention:** Explicit precedence: facts > hierarchy > decoration.

**Phase:** 116, 118

### 3. Generic aesthetic as polish

**Warning sign:** `polishSuggestions` contains "generic", "premium tech", "neon"; export still allowed.

**Prevention:** Promote to `generic_template_aesthetic` hard failure when severe.

**Phase:** 119, 120

### 4. Style-reference factual contamination

**Warning sign:** Restyling outputs show reference athletes/brands not in base.

**Prevention:** Separate factual inventory from style attributes in prompt + post-gen gate.

**Phase:** 117, 118 (restyling)

### 5. Format adaptation narrative drift

**Warning sign:** 9:16 becomes different campaign (Cantona, red United theme).

**Prevention:** Semantic campaign identity check before approve.

**Phase:** 118 (format_adaptation), 120

### 6. Tests green, quality red

**Warning sign:** 152/152 pass; manual rubric 58.5 avg.

**Prevention:** Corpus fixtures must fail before fix, pass after.

**Phase:** 115, 122

### 7. Retry from contaminated output

**Warning sign:** `derivation.ts` retries restyling from child; amplifies wrong entities.

**Prevention:** Retry always uses factual parent; restyling retry enabled with correction prompt.

**Phase:** 121

### 8. Score rewards completion over truth

**Warning sign:** High scores on `27069645` despite 0 on factual dimensions.

**Prevention:** Score ceilings per hard failure category.

**Phase:** 121

## Phase Ownership

| Pitfall | Primary phase |
|---------|---------------|
| Unwired rules | 116, 122 |
| Module overload | 116, 118, 119 |
| Generic passes | 119, 120 |
| Restyling contamination | 117, 118 |
| Format drift | 118, 120 |
| False-green tests | 115, 122 |
| Bad retry | 121 |

---
*Pitfalls research for: v12.3 Integridade Criativa*
