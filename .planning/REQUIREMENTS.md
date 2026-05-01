# Requirements: ADScale v3.0 — Modos de Derivação Fiel

## Overview

Milestone v3.0 repositions ADScale as a campaign derivation system, not a generic generator. The flow supports two clear objectives: `Variar arte` (art variation) and `Variar formato` (format adaptation), with per-piece CTAs, explicit visual fidelity rules, and less repetitive generation.

## Requirements

### MODE — Modos de Campanha

- [x] **MODE-01**: Usuário escolhe `Variar arte` ou `Variar formato` ao criar campanha.
- [x] **MODE-02**: `Variar arte` gera novas versões no mesmo formato da peça base.
- [x] **MODE-03**: `Variar formato` adapta a peça para `1:1`, `4:5` e `9:16`.
- [x] **MODE-04**: Modo escolhido aparece no briefing, galeria e cards de derivação.
- [x] **MODE-05**: Campanhas antigas continuam funcionando com fallback para `Variar arte`.

### CTA — CTAs por Peça

- [x] **CTA-01**: Briefing mostra exatamente `CTA peça 1`, `CTA peça 2`, `CTA peça 3`.
- [x] **CTA-02**: Em `Variar arte`, CTA vazio não gera derivação.
- [x] **CTA-03**: Em `Variar arte`, todos CTAs vazios bloqueiam geração com erro claro.
- [x] **CTA-04**: Em `Variar formato`, CTAs são opcionais e mapeados por formato: peça 1 `1:1`, peça 2 `4:5`, peça 3 `9:16`.
- [x] **CTA-05**: Em `Variar formato`, CTA vazio preserva o texto original da peça base.

### DATA — Modelo e API

- [x] **DATA-01**: Campaign salva `generationMode`, `ctaVariants` e `targetFormats`.
- [x] **DATA-02**: Derivation salva `generationMode`, `variantIndex`, `ctaText` e `format`.
- [x] **DATA-03**: `POST /api/campaigns` e `PATCH /api/campaigns/[id]` aceitam os novos campos.
- [x] **DATA-04**: `POST /api/campaigns/[id]/derivations` cria jobs a partir da configuração da campanha, não de `count`.
- [x] **DATA-05**: Tipos client/server refletem os novos contratos sem abusar de `prompt` ou `feedback`.

### AI — Derivação Fiel

- [x] **AI-01**: Prompt diferencia claramente `art_variation` de `format_adaptation`.
- [x] **AI-02**: `Variar arte` exige variação perceptível de fundo, composição, módulo de CTA e hierarquia visual.
- [x] **AI-03**: `Variar formato` prioriza adaptação de proporção sem reinventar a peça.
- [x] **AI-04**: Prompt inclui regra fixa: não inventar logo; preservar apenas se existir na referência.
- [x] **AI-05**: Geração mantém a correção atual de não trafegar base64 entre etapas do Inngest.

### OUTPUT — Formatos e Galeria

- [x] **OUT-01**: Saídas finais são normalizadas com `sharp`: `1080x1080`, `1080x1350`, `1080x1920`.
- [x] **OUT-02**: Galeria mostra labels `Peça 1/2/3` ou `1:1 / 4:5 / 9:16`.
- [x] **OUT-03**: Cards mostram CTA aplicado quando existir.
- [x] **OUT-04**: Botão `Gerar mais` respeita o modo da campanha, sem criar lotes genéricos.
- [x] **OUT-05**: Erros de geração aparecem como mensagem legível, não JSON cru.

### CR — Régua de Criatividade

- [ ] **CR-01**: Template `conservative` preserva personagem/produto, paleta, textura, tipografia, marca e estrutura visual; muda apenas disposição/layout e textos.
- [ ] **CR-02**: Template `balanced` muda layout, hierarquia, espaçamento e módulo de CTA; preserva paleta, personagem/produto, textura e sistema de marca.
- [ ] **CR-03**: Template `bold` pode mudar textura, personagem/tratamento visual, fundo, layout e energia criativa; preserva marca, produto, oferta e CTA.

### CTA — CTA Exato (extensões)

- [ ] **CTA-06**: Quando `ctaText` existir, o prompt deve exigir uso literal, sem sinônimos, tradução, reescrita ou troca por CTAs do plano.
- [ ] **CTA-07**: Recomendações de CTA do plano viram contexto secundário e nunca sobrescrevem `ctaText`.

### REST — Quick Tool Restilização

- [ ] **REST-01**: Home substitui card desativado de relatórios por "Restilização".
- [ ] **REST-02**: Modal rápido coleta: nome, cliente/marca, objetivo/oferta, CTA exato, observações, imagem base e imagem referência.
- [ ] **REST-03**: `POST /api/quick-tools/restyling` recebe multipart form, cria campanha, salva dois assets e cria derivação com `generationMode: "restyling"`.
- [ ] **REST-04**: Adicionar campo `role` em `campaign_assets`: `base` ou `style_reference`, com `base` como padrão para assets antigos.
- [ ] **REST-05**: No job de geração, `base` fornece marca, produto, paleta, informações, oferta e CTA; `style_reference` fornece apenas disposição, estilo visual e linguagem de design.
- [ ] **REST-06**: Usar `images.edit` com as duas imagens como entrada (SDK aceita array); resultado salvo na campanha e usuário direcionado para galeria.

## Deferred (Future Milestones)

- Multi-format cross-combination (CTA × format) — out of v3.0 scope
- Format adaptation beyond 1:1, 4:5, 9:16 — future milestone
- AI-generated copy suggestions for CTAs — requires content model fine-tuning
- Bulk CTA import from spreadsheet/CSV — future UX improvement

## Out of Scope

- Auto-translation of CTA text — user input stays as-is
- LGPD compliance — separate milestone
- Real billing/subscription processing — MVP uses simple usage/credits tracking only
- Direct Meta/TikTok/Google Ads export/integration — stubbed for future milestone

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| MODE-01 | 11 | Not started |
| MODE-02 | 12 | Not started |
| MODE-03 | 12 | Not started |
| MODE-04 | 11, 14 | Not started |
| MODE-05 | 10 | Not started |
| CTA-01 | 11 | Not started |
| CTA-02 | 11 | Not started |
| CTA-03 | 11 | Not started |
| CTA-04 | 11 | Not started |
| CTA-05 | 11 | Not started |
| DATA-01 | 10 | Not started |
| DATA-02 | 10 | Not started |
| DATA-03 | 10 | Not started |
| DATA-04 | 12 | Not started |
| DATA-05 | 10 | Not started |
| AI-01 | 13 | Not started |
| AI-02 | 13 | Not started |
| AI-03 | 13 | Not started |
| AI-04 | 13 | Not started |
| AI-05 | 13 | Not started |
| OUT-01 | 13 | Not started |
| OUT-02 | 14 | Not started |
| OUT-03 | 14 | Not started |
| OUT-04 | 14 | Not started |
| OUT-05 | 14 | Not started |
