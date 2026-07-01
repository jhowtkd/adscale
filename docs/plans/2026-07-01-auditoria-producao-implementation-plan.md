# Plano de implementação da auditoria de produção

## Objetivo

Resolver os achados confirmados da auditoria em dois repositórios:

- `ADScale_2`: segurança, SEO do domínio, dashboard, cache, navegação mobile e linguagem canônica.
- `site-adscale`: migração da landing Vite para Next.js SSR, mantendo a superfície pública separada em `/hi`.

P2 e P3 avançam somente após os gates técnicos e operacionais.

## Reclassificações verificadas

- O pricing real já usa `Growth`; somente uma copy residual ainda diz `Pro`.
- `/settings` já possui skeleton; não requer nova implementação.
- Novos briefs PT-BR já persistem o prefixo traduzido de objeções; dados históricos em inglês continuam compatíveis com o parser.
- A alternância clara/escura da landing é deliberada e não será tratada como defeito.
- Baseline: 37 testes direcionados e o build Vite passam antes das mudanças.

## Sequência de implementação

### 1. Segurança e SEO no ADScale_2

1. Reduzir `GET /api/health` para `{ ok, service, timestamp }`, mantendo HTTP 200 para o health check do Render.
2. Adicionar teste que impeça a reexposição de caminho do processo, estado de memória ou diagnóstico de assets.
3. Configurar `poweredByHeader: false`.
4. Criar `/robots.txt` e `/sitemap.xml` no domínio principal:
   - incluir `/hi`, `/privacy` e `/terms` no sitemap;
   - excluir autenticação, APIs e superfícies privadas;
   - aplicar `X-Robots-Tag: noindex, nofollow` às rotas de autenticação.

### 2. Correções funcionais no ADScale_2

5. Propagar `campaign.platforms` pelo contrato `DashboardStats.recentCampaigns` e renderizar as plataformas no dashboard. Usar `—` apenas quando a campanha não tiver plataformas.
6. Exibir `0% vs período anterior` quando a variação for zero.
7. Fazer as mutations de exclusão aguardarem, via `Promise.all`, as invalidações das queries de campanhas e dashboard antes da navegação.
8. Adicionar testes do mapper do dashboard e da mutation de exclusão.

### 3. Navegação e linguagem no ADScale_2

9. Alterar a barra mobile para Dashboard, Campanhas, Inteligência criativa, Biblioteca e Mais.
10. Reutilizar o sheet existente para o menu Mais, contendo Templates, Restilização e Configurações.
11. Garantir títulos completos em 390×844, inclusive Dashboard, sem truncamento.
12. Aplicar `Inteligência criativa` e `Creative intelligence` como nomes canônicos de `/assistant`.
13. Remover o link duplicado `Receita de estratégia` para `/templates`.
14. Substituir linguagem de curador/curar/curadoria por briefing, decisão, supervisão e aprovação nas copies PT-BR e EN.
15. Inverter os testes de narrativa: o vocabulário antigo passa a ser proibido e o novo passa a ser obrigatório nas superfícies relevantes.
16. Corrigir copies residuais:
    - `Starter / Pro / Scale` para `Starter / Growth / Scale`;
    - `Restyling` para `Restilização` em PT-BR;
    - `Não informado` para `Ainda não avaliado` nos estados de Olhar e Exportação;
    - pontuação e grafia de `e-mail` na waitlist.

### 4. Migração SSR do site-adscale

17. Preservar as alterações locais existentes: remoção de `Abrir app` e intenção da mudança de roteamento no `render.yaml`.
18. Substituir Vite por Next.js 16.2.6 e React 19, mantendo Tailwind e os componentes atuais.
19. Criar uma página server-rendered e uma única fronteira client para os componentes interativos; remover `createRoot`, o root vazio e o bloqueio `body { opacity: 0 }`.
20. Substituir as variáveis `VITE_*` por:
    - `NEXT_PUBLIC_APP_URL`;
    - `NEXT_PUBLIC_SITE_URL`;
    - `NEXT_PUBLIC_ASSET_PREFIX`.
21. Manter a landing no upstream raiz e usar o subdomínio Render como asset prefix, evitando colisão com os assets `/_next` do produto no proxy `/hi`.
22. Adicionar metadata SSR com canonical público, Open Graph, Twitter e imagem social 1200×630 gerada por `opengraph-image`.
23. Remover `centenas` e `infinito`; limitar a promessa a `dezenas` e aos volumes reais dos planos.
24. Migrar o Blueprint do Render de site estático para serviço Node com `next start`, health check e headers de segurança.
25. Entregar CSP, frame denial, referrer policy, permissions policy e HSTS no upstream e confirmar que sobrevivem ao proxy `/hi`.

### 5. Gate P2 de hardening

26. Desabilitar `X-Powered-By` nos dois projetos.
27. Avaliar a CSP candidata em navegador automatizado e catalogar violações antes de remover `unsafe-inline`.
28. Não aplicar nonces imediatamente ao produto: isso força renderização dinâmica, elimina otimização estática/CDN e aumenta custo operacional.
29. Remover `unsafe-inline` apenas quando scripts e estilos necessários tiverem alternativas verificadas.

### 6. Gate P3 de evidência operacional

30. Avaliar dez peças: cinco com mismatch intencional e cinco controles compatíveis com o brief.
31. Cobrir pelo menos dois perfis ou segmentos, incluindo um fora de educação.
32. Registrar decisão humana, resultado de `briefMatch`, falso positivo e falso negativo.
33. Executar os gates existentes de sample coverage, quality trend e operational quality.
34. Bloquear claims de PMF, melhoria de qualidade ou aprovação generalizada enquanto o corpus estiver `insufficient_sample`.
35. Exigir ao menos uma campanha concluída fora da Cenbrap antes de considerar um case multissegmento.

## Interfaces e contratos

- `GET /api/health`: payload público reduzido.
- `DashboardStats.recentCampaigns[]`: passa a incluir `platforms: string[]`.
- Novas rotas públicas: `/robots.txt` e `/sitemap.xml`.
- Landing: HTML completo por request, canonical e Open Graph explícitos.
- Nenhuma migração de banco.
- Dados históricos com `Objections to address` permanecem legíveis pelo parser atual.

## Testes e aceite

- `ADScale_2`: testes direcionados, suíte completa, typecheck, lint e build.
- `site-adscale`: typecheck, lint, build Next e smoke local com servidor real.
- Browser UAT em 390×844 e desktop:
  - todos os destinos mobile acessíveis;
  - título sem truncamento;
  - exclusão desaparece da lista sem reload;
  - plataformas aparecem no dashboard.
- Produção:
  - `/robots.txt` e `/sitemap.xml` retornam 200;
  - `/hi` contém headings no HTML inicial;
  - canonical e `og:image` estão presentes;
  - `/hi` recebe CSP e demais headers;
  - `/api/health` não expõe diagnóstico interno.
- Deploy em duas etapas: primeiro `site-adscale`, validar o upstream; depois `ADScale_2`, validar o domínio público e executar os gates P3.

## Premissas

- `Inteligência criativa` é o nome canônico também na navegação.
- A landing continua no repositório `site-adscale`.
- Alterações locais não commitadas em `site-adscale` pertencem ao usuário e devem ser incorporadas, não sobrescritas.
- O gate P2 pode concluir por não aplicar nonce enquanto custo, cache ou violações impedirem uma política segura em produção.
