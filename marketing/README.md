# Marketing — ADScale

> Repositório central de marketing, redes sociais e lançamento do ADScale.
> Tudo aqui é fonte única de verdade para copy, posicionamento, calendário e métricas.

---

## Estrutura

| Pasta | Conteúdo |
|-------|----------|
| [`research/`](./research/) | Pesquisa de público, mercado, concorrência e tendências. Insumo pra tudo o que vem depois. |
| [`brand/`](./brand/) | Tom de voz, pilares de mensagem, identidade verbal, guia de estilo. |
| [`copy/`](./copy/) | Textos prontos: página de vendas, landing pages, posts, anúncios, e-mails. |
| [`social-media/`](./social-media/) | Estratégia, calendário editorial e plano por canal (Instagram, LinkedIn, X, YouTube, TikTok). |
| [`launch/`](./launch/) | Plano de lançamento: timeline, fases, ativos, canais de aquisição, conversão. |
| [`metrics/`](./metrics/) | KPIs, dashboards, metas, tracking e relatório mensal. |
| [`2026-Q3/`](./2026-Q3/) | **Plano operacional unificado do trimestre:** Kanban de produção, sequências de e-mail, copy de ads, calendário 90 dias. |

---

## Princípios do repositório

1. **Uma decisão, um lugar.** Cada escolha de marketing vive em um único arquivo. Mudou de ideia? Atualiza lá.
2. **Documentos vivos.** Tudo aqui pode (e deve) ser atualizado conforme aprendemos. Nenhum documento é "final".
3. **PT-BR como padrão.** Salvo indicação explícita em contrário, todo documento é escrito em português brasileiro.
4. **Conecta com o código.** Quando um documento referencia uma feature, aponta pra `app/src/...` ou `README.md` da raiz.
5. **Tudo que é insumo vai pra `research/`.** Insight de LinkedIn, dado de concorrente, thread de X — guarda lá com data e fonte.

---

## Como usar este repositório

- **Antes de escrever qualquer copy:** abre [`brand/tom-de-voz.md`](./brand/tom-de-voz.md) e [`research/publico-alvo.md`](./research/publico-alvo.md).
- **Antes de postar nas redes:** confere o calendário em [`social-media/calendario/`](./social-media/calendario/).
- **Antes de planejar campanha paga:** olha [`metrics/kpis.md`](./metrics/kpis.md) pra saber o que tá sendo medido.

---

## Status atual

### Concluído ✅
- [x] **Plano de redes sociais** — [`social-media/plano-redes-sociais.md`](./social-media/plano-redes-sociais.md)
- [x] **Plano de lançamento** — [`launch/plano-lancamento.md`](./launch/plano-lancamento.md)
- [x] **Timeline do lançamento** (12 semanas) — [`launch/timeline.md`](./launch/timeline.md)
- [x] **Canais de aquisição** — [`launch/canais-aquisicao.md`](./launch/canais-aquisicao.md)
- [x] **Tom de voz** — [`brand/tom-de-voz.md`](./brand/tom-de-voz.md)
- [x] **Mensagens-chave** (5 pilares) — [`brand/mensagens-chave.md`](./brand/mensagens-chave.md)
- [x] **Estratégia por canal** (Instagram, LinkedIn, YouTube) — [`social-media/canais/`](./social-media/canais/)
- [x] **Página de vendas** (v1) — [`copy/sales-page.md`](./copy/sales-page.md)
- [x] **Plano unificado Q3 2026** — [`2026-Q3/plano-marketing-completo.md`](./2026-Q3/plano-marketing-completo.md)
- [x] **Automação de produção (Kanban + rotinas)** — [`2026-Q3/automacao-conteudo-kanban.md`](./2026-Q3/automacao-conteudo-kanban.md)
- [x] **Sequência de e-mails** (6 sequências, 20 e-mails prontos) — [`2026-Q3/sequencia-emails.md`](./2026-Q3/sequencia-emails.md)
- [x] **Copy de ads pagos** (Meta + Google + LinkedIn) — [`2026-Q3/ads-lancamento.md`](./2026-Q3/ads-lancamento.md)
- [x] **Calendário executivo 90 dias** — [`2026-Q3/calendario/90-dias.md`](./2026-Q3/calendario/90-dias.md)

### Pendente ⏳
- [ ] Pesquisa de público-alvo (entrevistas/desk)
- [ ] Pesquisa de concorrentes (AdCreative.ai, Pencil, Madgicx, etc.)
- [ ] KPIs e tracking (definir fontes: PostHog, Stripe, Metricool)
- [ ] Pesquisa de mercado e tendências
- [ ] Press kit e bio oficial EN
- [ ] **Setup operacional:** Kanban no Trello, e-mails no Resend, pixel Meta/tag Google, contas de ads. (Detalhe em `2026-Q3/README.md`)

---

*Mantido por Jhonatan Soares · Última atualização: 2026-06-23*