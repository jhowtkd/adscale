# Marketing Q3 2026 — ADScale (Fase 0: produção de conteúdo)

> Plano operacional unificado do trimestre. **Fase 0: construção de base.**
> Sem meta de vendas, sem lançamento. **Objetivo: produzir conteúdo
> durante 30 dias e construir o motor antes de tentar qualquer coisa.**
>
> Reaproveita o que já existe em `marketing/` (tom de voz,
> mensagens-chave, plano de lançamento) e opera dentro do
> próprio repo.

---

## Estrutura

| Arquivo | Conteúdo |
|---------|----------|
| [`plano-marketing-completo.md`](./plano-marketing-completo.md) | **TL;DR + plano unificado da Fase 0.** Comece por aqui. |
| [`SETUP-CHECKLIST.md`](./SETUP-CHECKLIST.md) | **Ordem exata de setup pra começar segunda.** Passo-a-passo de 4h. |
| [`identidade-visual-para-marketing.md`](./identidade-visual-para-marketing.md) | Paleta, tipografia, raios, componentes. Conceito + valores. |
| [`assets/logo-oficial.svg`](./assets/logo-oficial.svg) | 🟢 Logo oficial "ADSCALE" (preta, geométrica). Pra fundo claro. |
| [`assets/logo-oficial-dark.svg`](./assets/logo-oficial-dark.svg) | 🟢 Logo oficial em dark mode (branca em fundo ink). Pra Reels e posts dark. |
| [`assets/logo-avatar.svg`](./assets/logo-avatar.svg) | 🟢 Símbolo "AD" do logo oficial (com accent verde). Pra favicon, watermark, uso secundário. |
| [`assets/logo-avatar-1080.svg`](./assets/logo-avatar-1080.svg) | 🟢 Avatar 1080×1080 pro perfil IG/LinkedIn. |
| [`tokens/design-tokens.json`](./tokens/design-tokens.json) | Tokens em formato W3C (pra importar no Figma/Tokens Studio). |
| [`tokens/tokens.css`](./tokens/tokens.css) | Variáveis CSS prontas pra copiar. |
| [`automacao-conteudo-kanban.md`](./automacao-conteudo-kanban.md) | Como rodar a produção com 1 pessoa + Kanban no próprio repo. |
| [`kanban/01-ideias.md`](./kanban/01-ideias.md) | 💡 Banco de ideias infinito. |
| [`kanban/02-briefs.md`](./kanban/02-briefs.md) | 📝 **3 briefs prontos pra semana 1.** |
| [`kanban/03-prontos.md`](./kanban/03-prontos.md) | ✅ Posts finalizados, prontos pra agendar. |
| [`kanban/04-publicados.md`](./kanban/04-publicados.md) | 📚 Log de publicações + métricas. |
| [`sequencia-emails.md`](./sequencia-emails.md) | 3 sequências escritas, validadas, **sem envio nesta fase**. |
| [`calendario/30-dias.md`](./calendario/30-dias.md) | Calendário executivo dia-a-dia (produção pura). |
| [`_futuro/`](./_futuro/) | Versões anteriores (lançamento) + material de ads — **não usar agora**. |

---

## 🚀 Ordem de execução (essa semana → segunda)

1. **Esse sábado (1 tarde, ~4h):** seguir o [`SETUP-CHECKLIST.md`](./SETUP-CHECKLIST.md) na ordem dos 4 blocos.
2. **Domingo à noite (15 min):** revisar os 3 briefs em [`kanban/02-briefs.md`](./kanban/02-briefs.md). Ajustar se quiser.
3. **Segunda 09h (D+0):** abrir o template de carrossel no Canva, produzir Slot 1 (60 min).
4. **Segunda 17h:** agendar no Meta Business Suite.
5. **Repetir** o ciclo de produção pra quarta (Reels) e sexta (LinkedIn).
6. **D+30 (domingo):** retrospectiva 30 dias, decidir próximo passo.

---

## Como usar este diretório no dia-a-dia

- **Antes de produzir conteúdo:** abrir [`kanban/02-briefs.md`](./kanban/02-briefs.md).
- **Antes de postar:** conferir `brand/tom-de-voz.md` e `brand/mensagens-chave.md`.
- **Antes de usar cor/fonte/raio:** conferir [`identidade-visual-para-marketing.md`](./identidade-visual-para-marketing.md).
- **Todo domingo à noite:** preencher métricas em [`kanban/04-publicados.md`](./kanban/04-publicados.md).
- **Todo dia:** 15-20 min de ativação leve (comentários em posts do ICP).
- **D+30:** retrospectiva honesta. Decidir se avança pra próxima fase ou repete.

---

## Princípios unificadores

| Princípio | Onde está |
|-----------|-----------|
| **Tom de voz consistente** | [`../brand/tom-de-voz.md`](../brand/tom-de-voz.md) |
| **Mensagens-chave (5 pilares)** | [`../brand/mensagens-chave.md`](../brand/mensagens-chave.md) |
| **Estratégia de lançamento** (pra quando chegar a hora) | [`../launch/plano-lancamento.md`](../launch/plano-lancamento.md) |
| **Estratégia por canal** | [`../social-media/canais/`](../social-media/canais/) |
| **Página de vendas (v1)** | [`../copy/sales-page.md`](../copy/sales-page.md) |
| **Design system do app (origem dos tokens)** | [`../../../design.md`](../../../design.md) + [`../../../app/src/app/globals.css`](../../../app/src/app/globals.css) |

**Regra:** se algo aqui conflitar com o `marketing/`, vence este documento (Q3 2026) pra operação. Conflito real? Abrir issue e alinhar.

---

## Status de implementação

| Item | Status | Quem |
|------|--------|------|
| Plano Fase 0 escrito | ✅ | — |
| Identidade visual pra marketing (tokens extraídos) | ✅ | — |
| Wordmark "ADScale" em SVG (3 versões) | ✅ | — |
| Tokens em JSON + CSS | ✅ | — |
| Kanban com 4 arquivos `.md` | ✅ | — |
| 20 ideias seed no `01-ideias.md` | ✅ | — |
| 3 briefs prontos pra semana 1 | ✅ | — |
| Sequências de e-mail escritas | ✅ | — |
| **Foto de perfil + bio IG + bio LinkedIn** | ⏳ | Jhonatan (25 min) |
| **Brand Kit Canva** (3 fontes + 12 cores + logo) | ⏳ | Jhonatan (20 min) |
| **Template de carrossel** | ⏳ | Jhonatan (45 min) |
| **Template de Reels** | ⏳ | Jhonatan (30 min) |
| **CapCut desktop instalado** | ⏳ | Jhonatan (15 min) |
| **Meta Business Suite conectado** | ⏳ | Jhonatan (20 min) |
| **Resend testado** | ⏳ | Jhonatan (30 min) |

**Pré-requisitos:**
- Domínio de e-mail próprio já configurado no Resend (✅ confirmado).
- Nenhuma conta de ads precisa ser criada (✅ confirmado).
- **Tudo zero:** conta IG nova, sem seguidores, sem leads (✅ confirmado).

---

## Quando a Fase 0 termina

**Sinais de que tá pronto pra Fase 1 (pré-lançamento):**

- ✅ Banco de ideias ≥ 30 itens.
- ✅ 12 posts publicados sem perder qualidade.
- ✅ ≥ 100 seguidores IG (mesmo poucos).
- ✅ ≥ 1 post viralizou (> 1k views OU > 500 impressões).
- ✅ Jhonatan tá com vontade de continuar.

**Sinais de que precisa mais 30 dias:**

- Posts fracos / sem salvamento.
- Banco travado.
- Burnout.
- Zero engajamento.

**Se a decisão for "mais 30 dias":** sem culpa. Repetir o ciclo.

---

*Subpasta de `marketing/` · PT-BR · Última atualização: 2026-06-23*
