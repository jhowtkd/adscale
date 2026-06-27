# 0010 — Brasil-only (suspende bilíngue)

**Data:** 2026-06-27
**Status:** ✅ Aceita
**Decisor:** Jhonatan Soares (founder)

> **Escopo:** ADScale foca 100% no mercado Brasil (PT-BR) a partir de 2026-06-27. Estratégia bilíngue (PT-BR + EN, LinkedIn EN, YouTube EN) suspensa. Reativação exige novo ADR.

---

## Contexto

ADR 0002 (cadência) e o plano `marketing/social-media/plano-redes-sociais.md` nasceram com premissa bilíngue:

- "Brasil + EUA (bilíngue desde o dia 1)" — premissa geográfica + de idioma.
- LinkedIn em **EN** (decisor global, mercado EUA).
- YouTube com trilha EN separada (canal principal PT + trilha EN).

Resultado prático depois de ~1 mês:

- **ICP está no Brasil.** Agência brasileira é quem pergunta, quem aparece nos DMs, quem curte e compartilha. Decisor EUA ainda não apareceu com sinal consistente.
- **LinkedIn EN tem baixa tração BR.** Posts EN performam pior que PT (audiência brasileira entende, mas não comenta nem compartilha com a mesma força em EN).
- **Trilha EN do YouTube = 2× trabalho.** SEO, descrição, exemplos em USD/EN, moderação de comentários — tudo duplicado pra um mercado que não está convertido.

Decisão do Jhonatan (2026-06-27, registrada via anotação `[]` em `plano-redes-sociais.md:12`): "focar só no brasil por enquanto".

## Decisão

**ADScale opera 100% em PT-BR a partir de 2026-06-27.** Estratégia bilíngue (LinkedIn EN, YouTube EN) suspensa.

### O que muda concretamente

| Item | Antes | Agora |
|------|-------|-------|
| Geografia | Brasil + EUA | **Brasil only** |
| LinkedIn (idioma) | **EN** | **PT-BR** |
| YouTube EN trilha | Planejado | **Suspenso** |
| YouTube geral | Já congelado Q3 (ADR 0009) | Mantém congelado Q3 |
| Princípio "Bilíngue com função, não por vaidade" | Ativo | **Removido** do plano |

### O que NÃO muda

- ICP: agência de marketing brasileira (decisor = dono/sócio, operacional = designer, gestor de tráfego, atendimento). Mesmo ICP, só com escopo geográfico mais estreito.
- Tom, vocabulário, pilares Lab Notes (Tese/Experimento/Bastidor): todos já são PT-BR-first. Não muda.
- Cadência: 6 peças/sem (IG + LI), Threads reaproveita (ADR 0011).
- Banco de Teses: teses seed já estão em pt-BR. Não muda.

## Consequências

**Mais fácil:**
- Copy 100% PT-BR — sem duplicar mental load "vou escrever em EN agora?".
- LinkedIn volta a performar pra audiência brasileira (mesma língua, mesmo humor, mesma referência cultural).
- Threads entra no lugar do YouTube (mesmo esforço, melhor encaixe na cadência leve — ver ADR 0011).
- Métricas mais simples — 2 dashboards (IG + LI) em vez de 3 (IG + LI EN + LI PT).

**Mais difícil:**
- **Mercado EUA fica em standby.** Quando Jhonatan decidir reativar, vai ser "do zero" em EN — não é só voltar, é reconstruir audência, ajustar copy, ajustar tom.
- Sem canal "global" — toda a estratégia de marca é local BR. Isso limita captação de投資 / partnerships internacionais até reativação.
- Posts antigos em EN ficam "mortos" — sem atualização, viram referência histórica.

**Destrava:**
- `marketing/social-media/canais/linkedin.md` sai de "EN, decisor global" → "PT-BR, decisor BR". Conteúdo pode ser reaproveitado cross-postando IG↔LI sem reescrita.
- `marketing/social-media/canais/_shared.md` reduz variantes — sem "EN version", "BR version", "tom global vs tom local".
- `marketing/brand/conceituacao.md` §3 simplifica (sem referências a mercado EUA, sem copy EN de exemplo).
- Banco de Teses não precisa filtrar "aplicável em EN" — todas teses são PT-BR.

## Alternativas consideradas

- **Manter LinkedIn EN com foco em decisor EUA + LinkedIn PT separado:** rejeitado. Criar 2 LinkedIns = 2× trabalho de audiência, 2× manutenção. Decisão radical = LinkedIn único, em PT-BR.
- **Manter YouTube EN trilha, congelar só o PT:** rejeitado. ADR 0009 já congelou YouTube inteiro no Q3. Threads entrou no lugar (ADR 0011).
- **Fazer bilíngue "leve" (LinkedIn EN 1× por semana + resto PT):** rejeitado. Bilíngue parcial = mesma confusão, sem o ganho de focar. Foco total PT-BR é mais limpo.
- **Suspender só até tração EUA aparecer:** rejeitado. Jhonatan quer decisão consciente, não espera passiva. Se tração EUA surgir, novo ADR reativa.

## Upgrade path

Reativar bilíngue (EN) quando **2 condições** forem verdade (sem ordem):

1. **Tração BR consolidada** — LinkedIn BR com 1.000+ conexões de decisores qualificados, IG BR com 5k+ seguidores qualificados.
2. **Sinal concreto de mercado EUA** — leads EN chegando organicamente (DMs, e-mails, mentions em LI EN), ou pedido explícito de "tem versão EN disso?".

Quando reativar:
1. Criar LinkedIn **EN-only** separado (não converter o PT) — `@adscale-en`.
2. Avaliar YouTube EN trilha no Q4 (junto com reativação do canal principal YouTube — ver ADR 0009 §Upgrade path).
3. Validar copy com native speaker (não traduzir — reescrever com referências EN).

Esse upgrade só acontece com sinal claro de mercado. Não é meta do Q3.

## Relação com ADRs existentes

- **ADR 0002 (cadência semanal)** — permanece ✅. Não menciona EN explicitamente, então não conflita.
- **ADR 0005 (fontes de pauta)** — permanece ✅. Tier 2 (concorrência) inclui Canva, Adobe Firefly, Midjourney — todos globais. Não muda.
- **ADR 0006 (frequência Nível A)** — permanece ✅. Não menciona EN.
- **ADR 0009 (YouTube congelado Q3)** — ✅ Convive. ADR 0009 corta YouTube inteiro, ADR 0010 também cortaria a trilha EN se YouTube estivesse ativo. Mesma direção.
- **ADR 0011 (Threads)** — novo, criado junto. Complementa: Threads é o canal "lateral" de descoberta que substitui YouTube no Q3.

---

*Decidido em 2026-06-27 · Registrado 2026-06-27 · Owner: Jhonatan Soares*