# Threads — Estratégia do Canal (v1)

> **Canal de descoberta "lateral" + distribuição cross-platform.**
> Criado em 2026-06-27 (ADR 0011) — substitui YouTube como 3º canal no Q3.
> Idioma: **PT-BR** (ADR 0010, Brasil-only).
> **Princípio operacional:** Threads é **reaproveitamento**. Sem criação original. Cada post é derivado de uma peça já existente (LI/IG).
> **Boilerplate cross-canal (ICP, tom, anti-padrões, métricas base):** [`_shared.md`](_shared.md).

---

## 1. Objetivo do canal

Alcançar gente que **não está no IG nem no LI** com texto curto conversacional, reaproveitando copy de peças longas já publicadas. Threads é canal de **distribuição lateral**, não de criação.

**Por que existe:**
- YouTube foi congelado Q3 (ADR 0009) — saiu o canal "lateral" da estratégia.
- Threads é Meta nativo (mesma auth do IG), texto curto sem edição pesada.
- Tem federação com ActivityPub (Mastodon, WordPress) e tração em B2B marketing no ciclo 2026-W26.

**Funil prático:**
1. Reaproveita copy do LI post longo (terça/sexta) ou IG carrossel (segunda/quarta).
2. Traz impressões novas → alguns clickam no link → caem no LI/IG.
3. Constrói base "lateral" pra quando YouTube reativar (Q4+), ter canal alternativo de funil.

---

## 2. Público

Mesmo ICP dos outros canais: [`_shared.md`](_shared.md) §1.

- **Primário:** donos/sócios de agência de marketing (Brasil), head of marketing.
- **Secundário:** designers seniores, gestores de tráfego.
- **Idioma:** **PT-BR only**.

---

## 3. Formatos

Threads tem **1 formato canônico** + variantes opcionais:

| Formato | Tamanho típico | Origem | Quando |
|---------|----------------|--------|--------|
| **Texto curto recap** (canônico) | 200–500 chars + 1 link | LI post longo (terça/sexta) | Sempre que LI publica |
| **Texto curto gancho** | 150–300 chars + 1 imagem opcional | IG carrossel (segunda/quarta) ou Reel (qua/sex) | Sempre que IG publica |
| **Texto independente** (raro) | 200–500 chars | Bastidor que nasceu curto | **Não usar no Q3** — só quando teses nascem thread-worthy |

**Regra:** postar Threads **no mesmo dia** da peça LI/IG correspondente. Não acumular backlog.

---

## 4. Cadência semanal no Threads (Q3)

| Dia | Origem | Conteúdo | Tempo |
|-----|--------|----------|-------|
| **Seg** | IG Reel | Recap do Reel (1 frase + "reel completo no IG → link") | 5 min |
| **Ter** | LI post longo | Trecho do post (2–3 frases + "leia completo no LinkedIn → link") | 5 min |
| **Qua** | IG carrossel | Gancho do carrossel (slide 1 ou 2 + "carrossel completo no IG → link") | 5 min |
| **Qui** | — | Folga (LI post texto, Threads não precisa de recap adicional) | 0 |
| **Sex** | LI post longo + IG Reel | Recap do LI + menção ao Reel | 5 min |

**Total:** 3 posts/semana (todos reaproveitamento). Tempo total = ~15 min/semana.

---

## 5. Estrutura típica de post Threads

```
[Linha 1 — gancho do post original, em 1 frase curta]

[1–2 linhas de desenvolvimento — a parte mais "punchy" do LI/IG]

[CTA — sempre com link]
→ Carrossel completo no IG: [link]
→ Post completo no LinkedIn: [link]
```

**Regras:**
- Texto curto (200–500 chars). Threads penaliza textão.
- Sem imagem ou **1 imagem** (print do slide/carrossel). Sem carousel nativo.
- 1–2 hashtags no máx. (`#ads` `#marketingdigital` `#agencia`).
- Sem pseudo-ciência em copy visível (ver `_shared.md` §6).

---

## 6. Métricas

Métricas universais: [`_shared.md`](_shared.md) §7.

| KPI | Meta mês 1 | Meta mês 3 |
|-----|------------|------------|
| Impressões médias por post | 500 | 2.500 |
| Replies qualificados/post | 2 | 8 |
| Cliques no link (LI/IG) | 5/post | 25/post |
| Seguidores totais | 200 | 1.000 |

**Premissa:** Threads é canal de **distribuição**, não de **conversão direta**. Métrica de qualidade = cliques no link (não impressões).

---

## 7. Engajamento ativo

| Atividade | Tempo |
|-----------|-------|
| Responder replies relevantes (perfis-fit) | 5 min/dia |
| Comentar em 2–3 posts de perfis do nicho (Hugorodriguess, tenbolabs, ocaradosrankings, saasflash) | 10 min/dia |

**Total:** ~15 min/dia.

---

## 8. Bio do perfil

```
ADScale
IA que escala criativos pra performance sem contratar +1 designer.
Curator > operator. Lab Notes toda semana.
🇧🇷 Brasil
```

> {{ nota: tagline "Curator > operator" em revisão — Jhonatan questionou em 2026-06-27 }}

---

## 9. Anti-padrões

Lista universal: [`_shared.md`](_shared.md) §8.

**Threads-específicos:**
- ❌ Texto > 500 chars (textão morre no Threads).
- ❌ Criar conteúdo original sem origem em LI/IG (defeito da proposta — reaproveitamento).
- ❌ Hashtag genérica de viralização (`#viral` `#fyp`).
- ❌ Cross-postar texto literal do LI sem reescrever pra tom Threads (Threads é conversacional, LI é articulado).
- ❌ Ativar federação ActivityPub sem estratégia (deixar pra upgrade path).

---

## 10. Upgrade path

Evoluir Threads quando (sem ordem):

1. **Cadência IG + LI fluindo** (Mês 2+, 6 peças/sem sem atrito + Threads).
2. **Métricas Threads confirmadas** — alcance >500 impressões/post, ou replies >5/semana.

Possíveis upgrades:
- Permitir **criação original** (não só reaproveitamento) — pra teses thread-worthy.
- **Ativar federação ActivityPub** — publicar também no Mastodon de comunidades B2B BR.
- **Testar formato imagem única** (card visual) como variação do texto-only.

---

## 11. Conexão com ADRs e docs

| O quê | Onde |
|-------|------|
| Decisão Threads entra no Q3 | ADR [`0011-threads-como-canal-novo.md`](../../../docs/adr/0011-threads-como-canal-novo.md) |
| Brasil-only (PT-BR only) | ADR [`0010-brasil-only-suspende-bilingue.md`](../../../docs/adr/0010-brasil-only-suspende-bilingue.md) |
| YouTube congelado Q3 (contexto) | ADR [`0009-youtube-congelado-q3.md`](../../../docs/adr/0009-youtube-congelado-q3.md) |
| Cadência semanal efetiva | [`../calendario/semanal-v2.md`](../calendario/semanal-v2.md) |
| ICP + tom + vocabulário canônico | [`_shared.md`](_shared.md) |

---

*Subpasta de `marketing/social-media/canais/` · **PT-BR only** (ADR 0010) · Versão 1 · Última atualização: 2026-06-27 · Owner: Jhonatan Soares*