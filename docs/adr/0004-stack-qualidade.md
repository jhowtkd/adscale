# 0004 — Stack de QUALIDADE (não de produção)

**Data:** 2026-06-25
**Status:** ✅ Aceita
**Decisor:** Jhonatan Soares (founder)

## Contexto

A primeira proposta de stack era de **produção**: Canva + CapCut + BIGVU teleprompter + Meta Business Suite + Resend + Loom + OBS + PostHog + Metricool + ... Cada ferramenta com seu tutorial, sua manutenção, sua curva de aprendizado. Jhonatan sinalizou: "eu não quero stack de produção, quero focar em uma stack de qualidade de conteúdo inicialmente."

A intuição é sólida: **sem qualidade de conteúdo, a melhor stack de produção só acelera a produção de lixo.** E fundação de conteúdo tem payback maior (cada tese no Banco de Teses dura meses) do que ferramenta de produção (cada template vira commodity em semanas).

## Decisão

Adotar **Stack de Qualidade Essencial (4 blocos)**, em vez de stack de produção:

| # | Bloco | Frequência | Duração | Função |
|---|-------|------------|---------|--------|
| **1** | **Consumo** | Diário | 30 min/dia | Ler/assistir referências do ICP (Twitter/X, LinkedIn, newsletters, podcasts). Banco de inputs brutos. |
| **2** | **Pesquisa** | Semanal (DOM, dentro da sessão-âncora) | 60 min/sem | Trends (Google Trends, Twitter trending, YouTube search) + concorrentes (AdCreative.ai, Pencil, Madgicx, Canva, Adobe Firefly, Midjourney) + SEO (palavras-chave que o ICP busca). |
| **3** | **Banco de Teses** | Contínuo | 10–15 min/inscrição | Toda ideia vira 1 tese escrita (claim + prova + implicação). Persistente em `marketing/2026-Q3/banco-teses/`. Sessão-âncora usa como filtro. |
| **4** | **Revisão automatizada Mavis** | Toda peça (antes de publicar) | 5–10 min/peça | Mavis revisa tom (founder-cientista), vocabulário canônico, peso dos pilares (A/B/C conforme ADR 0001), anti-padrões (sneaker/RAD, jargão coach, TL;DR no fim). Bloqueia se falhar. |

**Stack de produção fica DEPOIS.** Quando a cadência travar (banco de teses saturado, briefs repetindo), aí sim entra stack de produção (Canva para carrossel, CapCut para Reels, etc.). Mas não antes.

**Ferramentas ativas hoje (mínimo viável):**
- `marketing/2026-Q3/kanban/` — Kanban 4 colunas no repo (ideias / briefs / prontos / publicados).
- `marketing/2026-Q3/banco-teses/` — pastas por pilar (A-Tese / B-Experimento / C-Bastidor).
- Mavis (este agente) — revisão automatizada bloco 4.
- Navegador + leitor RSS — bloco 1 (consumo).

## Consequências

**Mais fácil:**
- Custo de aprendizado de ferramentas = zero no início. Jhonatan não vira "operador de Canva".
- Energia vai pra **pensar** (qual tese, qual copy), não pra **executar ferramenta** (qual template, qual atalho).
- Banco de Teses vira ativo permanente: cada tese serve 5+ peças em momentos diferentes.

**Mais difícil:**
- **Bloco 4 (revisão Mavis) só funciona se Mavis tiver contexto.** Requer carregar ADRs + brand/conceituacao + memoria nas sessões. Mitigação: prompts do Mavis pré-configurados com CONTEXT.md + ADRs relevantes.
- **Sem stack de produção, peças "nasce" mais devagar.** Se Jhonatan quiser postar amanhã sem brief pronto no `02-briefs.md`, não tem atalho. Mitigação: briefs sempre prontos no domingo — não precisa improvisar.
- **Bloco 3 (Banco de Teses) é a disciplina mais crítica.** Se Jhonatan não registrar teses durante a semana, domingo fica pobre.

**Destrava:**
- Cada bloco é **acumulativo**: Consumo de segunda alimenta Banco de Teses na quarta, que alimenta brief no domingo, que alimenta peça na segunda seguinte.
- Mavis como gatekeeper (bloco 4) evita regressão de tom — copy que foge do "founder-cientista" não passa.
- Banco de Teses é **queryable**: quando Jhonatan travar numa pauta, `grep` por tese serve de semente.

## Alternativas consideradas

- **Stack de produção completo desde o dia 1:** rejeitado explicitamente por Jhonatan.
- **Stack de qualidade com 8+ blocos:** rejeitado. 4 blocos é o "essencial" — qualquer coisa a mais dilui.
- **Substituir Mavis por checklist manual:** rejeitado. Mavis como gatekeeper força disciplina sem custo cognitivo.
- **Banco de Teses em Notion:** rejeitado. Banco no repo (`banco-teses/*.md`) versiona com git, integra com kanban, e é queryable via grep.

---

*Decidido em sessão-âncora DOM 19–21h de 2026-06-22 · Registrado 2026-06-25.*
