# Design Audit — ADScale App (logado)

Capturado em **2026-08-10 07:21-07:29 BRT** via Kimi WebBridge (Chrome do Jhonatan, logado) + agent-browser (mobile, login/signup públicas).

## Mapa do app

A raiz `/` (quando logado) é o **Início** com seletor de protocolo de criação. Sidebar fixa tem 3 itens + Treinamento Visual (BETA) + lista de Campanhas Recentes + Configurações/Sair.

```
.design-audit/2026-08-10/app/
├── 01-app-home.png                   DESKTOP — Início (4 protocolos: Variações, Peça única, Adaptar, Mudar estilo)
├── 02-app-dashboard.png              DESKTOP — /dashboard (mesmo conteúdo que /, parece rota legacy)
├── 02-app-library.png                DESKTOP — Biblioteca (81 assets em grid, drop-zone, search)
├── 02-app-campaigns.png              DESKTOP — Trabalhos (41 cards: PM/FU/CU/TQ/CP/DI/F3/KE)
├── 02-app-templates.png              DESKTOP — Templates (empty state "Nenhum template de briefing ainda")
├── 02-app-assistant.png              DESKTOP — /assistant (heurística, página simples)
├── 02-app-settings.png               DESKTOP — Configurações (grid 8 cards: Perfil/Workspace/Equipe/Faturamento/Histórico/Planos/Integrações/Privacidade)
├── 02-app-feedback.png               DESKTOP — Feedback (top: Analytics beta, Human quality corpus)
├── 03-app-feedback-scroll-1.png      DESKTOP — Feedback scroll 1500 (Queue progress, Inspirações globais)
├── 03-app-feedback-scroll-2.png      DESKTOP — Feedback scroll 3000
├── 03-app-feedback-scroll-3.png      DESKTOP — Feedback scroll 4500 (Perfis tester)
├── 03-app-feedback-scroll-4.png      DESKTOP — Feedback scroll 6000 (Feedback de qualidade da jornada guiada)
├── 03-app-feedback-scroll-5.png      DESKTOP — Feedback scroll 7500 (Beta Sessions)
│
├── 02-app-restyling.png              ⚠️  IGUAL a campaigns (rota /restyling → /campaigns)
├── 02-app-docs.png                   DESKTOP — /docs
├── 02-app-invite.png                 DESKTOP — /invite (Accept invite)
├── 02-app-share.png                  ⚠️  404 (rota não implementada)
├── 02-app-monitoring.png             ⚠️  404
├── 02-app-admin.png                  ⚠️  404
├── 02-app-quick-tools.png            ⚠️  404
├── 02-app-trabalhos.png              ⚠️  404 (/jobs não existe, real é /campaigns)
│
├── 10-mobile-login.png               MOBILE 390×full — /login (Bem-vindo de volta, magic link, cookies)
└── 11-mobile-signup.png              MOBILE 390×full — /signup (Crie sua conta, 3 campos, T&C)
```

## Estado das rotas

| Rota | Status | Conteúdo |
|------|--------|----------|
| `/` | ✅ 200 | Início (dashboard principal) |
| `/dashboard` | ✅ 200 | Mesmo que `/` — provável rota legacy |
| `/library` | ✅ 200 | Biblioteca de assets (81) |
| `/campaigns` | ✅ 200 | Trabalhos (41 cards) |
| `/templates` | ✅ 200 | Empty state |
| `/assistant` | ✅ 200 | Página simples |
| `/settings` | ✅ 200 | Grid de configurações |
| `/feedback` | ✅ 200 | Triagem beta (Analytics + Corpus + Sessões) |
| `/docs` | ✅ 200 | Documentação |
| `/restyling` | ⚠️ 307→/campaigns | Redirect, não é rota própria |
| `/invite` | ✅ 200 | Accept invite page |
| `/share` | ❌ 404 | Não implementada |
| `/monitoring` | ❌ 404 | Não implementada |
| `/admin` | ❌ 404 | Não implementada |
| `/quick-tools` | ❌ 404 | Não implementada |
| `/jobs` | ❌ 404 | Não implementada (nav usa "Trabalhos" mas rota é /campaigns) |
| `/login` | 🔀 → / | Logado, redireciona pro app |
| `/signup` | 🔀 → / | Logado, redireciona pro app |

## Observações de design (você pediu pra auditar)

### Pontos fortes
- **Sidebar consistente** em todas as telas: logo + nav + campanhas recentes + user
- **Dark mode coerente** com accent verde neon (CTAs primários)
- **Status badges** semânticos (Em revisão, Falhou, Em briefing) com cores distintas
- **Settings page** com grid bem organizado e status de implementação (Fora do laboratório, Implementado, Captura pendente, Em breve)
- **Biblioteca** com drop-zone, search, filtros por tag, paginação ("24 de 81 assets")

### Pontos de fricção
- **Nav usa "Trabalhos" mas a rota é `/campaigns`** — confuso, vale unificar (ou label ou path)
- **Treinamento Visual (BETA)** aparece como nav item mas não sei se é feature ou upsell
- **"Implementado" / "Captura pendente"** badges em Settings — usuário comum vai entender? Vale docstring
- **Filtros do Feedback** com 7 selects (Status/Cohort/Source/Client profile/Mode/Format) — overload cognitivo
- **Analytics beta** mostra "Não foi possível carregar os analytics" sem ação óbvia pra resolver
- **Workspace selector** só mostra um ícone de imagem no topo direito — sem label, sem avatar
- **Sidebar "Dev Admin"** com role "DEV ADMIN" visível — confuso se é tipo o cargo ou flag

### Inconsistências
- **"Fora do laboratório"** como status (Settings → Perfil, Workspace) — copy técnica que vaza pro user final
- **CTAs repetidos**: "Criar template" aparece 2× na mesma página (botão header + empty state CTA)
- **Início "Continuar de onde parei"** mostra só 1 card — se o user tem 5 trabalhos pendentes, vira limitação arbitrária

### Sidebar vazia
- `/assistant` (175 bytes) e `/jobs` (24KB) e `/share` (24KB) — todos diferentes mas com altura suspeita. Vale revisar se são feature shells ou erro de render

## Mobile — limitação importante

**Mobile só captura login/signup** (públicas, sem auth). O app logado precisa do Chrome do Jhonatan em viewport mobile, mas:
- Porta 9222 (Chrome DevTools) não está exposta no Chrome dele
- agent-browser tem viewport control mas usa Chrome próprio, sem sessão logada
- Solução: você redimensionar a janela do Chrome pra ~390px de largura e me avisar (eu refaço via Kimi)

## Como refazer

```bash
# Desktop (precisa estar logado no Chrome real):
SESSION=adscale-app ./_capture.sh ./app/02-app-NOME.png

# Mobile (públicas):
agent-browser set viewport 390 844
agent-browser open https://adscale.jhonatansoares.com/login
agent-browser wait --load networkidle
agent-browser screenshot --full ./app/10-mobile-login.png
```

{{ status: rascunho — auditoria visual ainda não feita }}
