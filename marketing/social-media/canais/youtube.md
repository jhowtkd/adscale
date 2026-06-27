# YouTube — Estratégia do Canal (v2)

> {{ status: CONGELADO no Q3 inteiro (até set/2026) — ver ADR 0009 }}
> Atualizado em 2026-06-27 com base nos ADRs 0001–0011.
> Canal mantido como **referência histórica** pra reativação no Q4+.
> Quando reativar: PT-BR only (trilha EN suspensa por ADR 0010, Brasil-only).

> **Este arquivo NÃO é playbook ativo no Q3.** É documentação do que existia e do que volta a valer quando o canal reativar. Ver seção 5 (Upgrade path) pra condições de reativação.

---

## 1. Por que YouTube foi congelado

Ver ADR [`0009-youtube-congelado-q3.md`](../../../docs/adr/0009-youtube-congelado-q3.md) (decisão completa).

**Resumo:** decisão consciente de foco. ICP ainda não pediu vídeo (Tier 1 mudo). Manter canal YouTube ativo = overhead de edição dedicada, thumbnails, capítulos, watch time — energia que no Q3 vai pra IG + LI.

---

## 2. O que existia (referência histórica)

YouTube foi incluído na cadência v2 (ADR 0002) com:

| Formato | Frequência | Tamanho típico | Pilar Lab Notes |
|---------|------------|----------------|-----------------|
| **Short** (vertical, ≤90s) | 1/semana = 4/mês | 30–90s | B (principal — corte de Reels Lab Notes) + A (secundário) |
| **Vídeo longo** (tutorial / demo / deep dive) | 1/mês PT + 1/mês EN | 10–20 min | B (principal) + A (secundário) |
| **Live quinzenal (opcional)** | 2/mês (se demanda) | 30–60 min | C (bastidor, Q&A) |

**Categorias de vídeo longo (% do conteúdo):**

| Categoria | % | Pilar Lab Notes |
|-----------|---|-----------------|
| Tutorial prático | 40% | B — Experimento |
| Análise / opinião | 25% | A — Tese |
| Bastidor técnico | 15% | C — Bastidor |
| Estudo de caso | 10% | A ou B (com prova) |
| Comparativo | 10% | A — Tese |

**Princípios YouTube-específicos:**

| Princípio | Implicação |
|-----------|------------|
| Search > Browse | Otimizar pra busca, não pra viralizar. Títulos descritivos. |
| Evergreen > Trend | Vídeo de 2027 ainda tem que fazer sentido. |
| Watch time é tudo | Primeiros 30 segundos decidem se fica. |
| Reaproveitar > criar do zero | 80% dos Shorts são cortes de Reels Lab Notes ou vídeos longos. |

---

## 3. Estrutura típica de vídeo longo (referência)

```
00:00–00:15  Gancho (o que você vai aprender / problema que vai resolver)
00:15–00:45  Contexto (por que importa, pra quem)
00:45–02:00  Overview (o que vai mostrar no vídeo)
02:00–XX:XX  Conteúdo principal (passo a passo, demo, análise)
XX:XX–YY:YY  Conclusão + takeaway
YY:YY–final  CTA (waitlist, próximo vídeo, inscrito)
```

**Regra dos 30 segundos:** se o espectador sair antes dos 30s, o YouTube para de recomendar. Investir 1 hora de edição só nos 30s iniciais vale a pena.

---

## 4. Estrutura típica de Short (referência)

```
00:00–00:03  Gancho visual + frase
00:03–00:60  Conteúdo (1 ideia, 1 demo, 1 número — corte de Reel Lab Notes)
00:60–00:90  CTA curto ("segue pra parte 2", "link na bio")
```

**Origem:** 80% dos Shorts seriam **cortes** de Reels Lab Notes IG (quarta). Não criar Short do zero — cortar, relegend, exportar.

**Estrutura igual ao Reels Lab Notes do IG** (premissa → gargalo → tese → demo → evidência → CTA). Short só é a versão <90s, vertical, sem CTA longo.

---

## 5. SEO YouTube (referência pra quando reativar)

### Título
- ≤ 60 caracteres.
- Inclui palavra-chave que o ICP busca.
- Sem clickbait. Sem CAPS LOCK.
- Exemplo bom: "Como produzir variações de criativo com IA (workflow completo)"
- Exemplo ruim: "VOCÊ NÃO VAI ACREDITAR NESSA FERRAMENTA 🤯"

### Descrição
- 2–3 parágrafos. Primeiro com a palavra-chave nos primeiros 2 linhas.
- Links: waitlist, site, Instagram, LinkedIn.
- Timestamps (chapters) quando ≥ 8 min.

### Tags
- 5–8 tags. Misturar broad + específica.
- Exemplo: "marketing de performance", "criativos para ads", "variação de criativo", "IA para marketing", "ADScale".

### Thumbnail
- 1280×720, alto contraste.
- 3 palavras no máx, fonte bold.
- Rosto com emoção (> CTR em B2B).
- Não repetir layout entre vídeos do mês.

---

## 6. Canal EN vs trilha EN no mesmo canal (referência)

**Recomendação inicial:** trilha EN no **mesmo canal** (playlist "EN content"), não canal separado.

**Quando separar:**
- Após 6 meses com audiência consolidada em PT.
- Quando o conteúdo EN tiver tema próprio (não só tradução).
- Quando quiser ter equipe dedicada a EN.

**Por que:** começar com 1 canal reduz overhead.

---

## 7. Cross-pollination com outros canais (referência)

| Origem | YouTube | Shorts viram | Vídeo longo linka pra |
|--------|---------|--------------|----------------------|
| Reels Lab Notes IG (quarta, Pilar B) | Short reaproveitado (com legenda PT) | — | — |
| Post LinkedIn que rendeu (Pilar A ou C) | Vídeo deep dive do tema | 2–3 Shorts | Próximo vídeo da série |
| Pergunta de DM/comentário (Tier 1) | Vídeo "respondendo perguntas" | Short da resposta | Waitlist |

**Regra de ouro:** Shorts são derivados, não origem. O "original" sai no IG (Reels Lab Notes) ou LI (post longo) — Short é o corte.

---

## 8. KPIs (referência pra quando reativar)

| KPI | Meta mês 3 (pós-reativação) | Meta mês 6 (pós-reativação) |
|-----|------------------------------|------------------------------|
| Inscritos | 1.000 | 3.000 |
| Views totais (todos vídeos) | 5.000 | 25.000 |
| Watch time médio por vídeo longo | 4 min | 6 min |
| CTR médio (todos vídeos) | 4% | 6% |
| Vídeos com > 1.000 views | 3 | 10 |
| Vídeos ranqueando em top 3 do YouTube Search | 1 | 5 |

---

## 9. Upgrade path — quando reativar

**2 condições (sem ordem):**

1. Cadência IG + LI fluindo sem atrito (Mês 2+ com cadência de 6 peças/sem Q3 cumprida).
2. Tier 1 confirmar demanda (perguntas reais em DMs/comentários sobre "tem vídeo disso?" ou "faz um vídeo explicando X").

**Ordem recomendada pra retomar:**

1. 1 Short/semana (reaproveitando Reels Lab Notes de quarta) por 4 semanas.
2. Adicionar 1 vídeo longo/mês (PT) no Mês 2 de reativação.
3. Considerar trilha EN ou canal EN separado no Mês 3+ de reativação.

Esse upgrade só se acontecer naturalmente — não é meta forçada.

---

## 10. Anti-padrões (referência)

- Short sem gancho nos 3 primeiros segundos.
- Título clickbait ("VOCÊ NÃO VAI ACREDITAR 🤯").
- Vídeo longo sem overview nos primeiros 2 minutos.
- Short com legenda hardcoded cobrindo a fala.
- Pseudo-ciência em copy ("paper 0X", "anomalia" — vedado).
- Vocabulário sneaker/RAD (drop, hype, cool, streetwear).

---

## 11. Conexão com a documentação

- **ADR 0009** — decisão de congelar YouTube no Q3 (origem desta v2).
- **ADR 0002** — cadência framework original (com Short de sexta).
- **ADR 0006** — frequência Nível A framework (7 peças/sem).
- **`canais/_shared.md`** — boilerplate cross-canal (ICP, tom, anti-padrões universais).
- **`canais/instagram.md`**, **`canais/linkedin.md`** — canais ativos no Q3.
- **`conceituacao.md`** §3.6 — regra do Reel Lab Notes (tela liberada quando faz sentido narrativo).

---

*Subpasta de `marketing/social-media/canais/` · PT-BR (principal) + EN (trilha) · Versão 2 (congelado Q3) · Última atualização: 2026-06-26 · Owner: Jhonatan Soares*
