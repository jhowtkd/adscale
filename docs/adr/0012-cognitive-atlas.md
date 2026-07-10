# 0012 — Cognitive Atlas (órgãos da cabeça criativa)

**Data:** 2026-07-09  
**Status:** ✅ Aceita  
**Decisor:** Jhonatan Soares (founder)

## Contexto

O ADScale acumulou muitos motores reais (`assistant/`, `ai/olhar/`, `output-learning/`, `brand-taste/`, `human-quality/`, `billing/`, …) documentados sobretudo como fases, APIs e pastas. Isso dificulta ver **ligações** e aperfeiçoar o sistema como um corpo — o que sente, o que julga, o que produz, o que aprende.

Já existia linguagem de produto para um órgão (`Olhar ADScale`). Faltava um mapa canônico, lúdico e estável, em inglês (produto internacional), cobrindo a **cognição** (cabeça), não o produto inteiro.

## Decisão

Adotar o **Cognitive Atlas v0.1** como mapa mental canônico da cabeça criativa:

| Organ (EN) | Função | Code home |
|------------|--------|-----------|
| **Cortex** | Intent → confirmed actions | `app/src/server/assistant/` |
| **Hands** | Produce the image | `app/src/server/ai/` + `jobs/derivation.ts` |
| **Gaze (Olhar)** | Art judgment | `app/src/server/ai/olhar/` |
| **Skin** | Export / factual readiness | `app/src/server/ai/export-validation.ts` |
| **Nerve** | Fast user-decision learning | `app/src/server/output-learning/` |
| **Taste** | Approved brand prompt constraints | `app/src/server/brand-taste/` |
| **Memory** | Recalled brand/campaign context | `app/src/server/memory/` |
| **Marrow** | Deep owner calibration | `human-quality/` + `olhar-calibration/` |
| **Energy** | Credits & access (fuel, not thought) | `app/src/server/billing/` |

**Documento canônico:** [`docs/COGNITIVE-ATLAS.md`](../COGNITIVE-ATLAS.md)  
**Referências cruzadas:** [`ARCHITECTURE.md`](../ARCHITECTURE.md), [`SERVER-MODULES.md`](../SERVER-MODULES.md)

**Regras do atlas:**

1. Nomes de órgãos em **inglês** (estáveis). Alias de produto no código: **Olhar = Gaze**.
2. Escopo = **cognição** (intent → make → judge → learn). Limbs (ex.: performance / Muscle, progression) ficam fora até merecerem card próprio.
3. Billing chama-se **Energy** (não “blood”): alimenta motores; não julga criativo.
4. Atlas é **modelo mental**, não segunda arquitetura. Conflito com código → **código vence**, depois atualiza o atlas.
5. Dual truth obrigatória: **Gaze ⟂ Skin** (arte ≠ export).

## Consequências

**Mais fácil:**

- Onboarding e design de feature: “isso é Cortex ou Hands?” corta escopo.
- Docs e conversas de produto usam o mesmo vocabulário que o mapa do repo.
- Loops (vital / reflex / calibration / brand) ficam nomeados e auditáveis.

**Mais difícil:**

- Tentação de renomear pastas do código para bater com o atlas — **não fazer** sem migração explícita; o atlas aponta para paths atuais.
- Risco de o atlas envelhecer se novas fases não atualizarem `COGNITIVE-ATLAS.md`.

**Destrava:**

- Aprofundamento órgão a órgão (caractere a caractere) sem perder o mapa.
- Futuros cards para Contract, Circulation (Inngest), Muscle, quando fizer sentido.

## Alternativas consideradas

- **Só ARCHITECTURE.md / SERVER-MODULES.md:** rejeitado. São inventários técnicos; não dão metáfora de corpo nem circulações.
- **Nomes só em PT-BR (Olhar, Mãos, Medula…):** rejeitado para o atlas canônico — produto internacional; PT-BR fica na conversa e no copy localizado. **Olhar** permanece como alias de produto/código do Gaze.
- **Incluir Muscle e Progression no v0.1:** rejeitado. Fora do escopo “cabeça”; evita diluir o atlas na primeira versão.
