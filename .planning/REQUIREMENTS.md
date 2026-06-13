# Requirements: ADScale v12.2 Refinamento Visual e Consistência da Interface

**Defined:** 2026-06-12
**Milestone:** v12.2 Refinamento Visual e Consistência da Interface
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Scope

Refinar todas as superfícies autenticadas do ADScale para uma linguagem compacta, profissional, consistente e estruturalmente responsiva. O milestone pode reorganizar hierarquia, densidade e ações quando necessário, mas deve preservar capacidades, regras e contratos dos fluxos existentes.

**In scope:** fundações visuais, shell, navegação, dashboard, campanhas, workspace, biblioteca, templates/restyling, feedback, configurações, estados de interface, overlays, acessibilidade e validação responsiva de mobile a ultrawide.

**Out of scope:** novas capacidades de produto, mudanças backend sem necessidade visual, rebrand, site de marketing e adoção de outro framework de UI.

## Requirements

### Foundations (FOUND)

- [ ] **FOUND-01**: Usuário encontra cores, superfícies, bordas, textos e estados semânticos consistentes em todas as superfícies autenticadas.
- [ ] **FOUND-02**: Usuário percebe uma escala consistente de tipografia, espaçamento e densidade adequada a uma ferramenta profissional compacta.
- [ ] **FOUND-03**: Todas as rotas usam contratos compartilhados de gutters, larguras de conteúdo, top bar, sidebar, navegação mobile e offsets sticky.
- [ ] **FOUND-04**: Conteúdo, navegação, sticky regions, popovers, backdrops, modais, sheets e toasts seguem uma escala única de camadas sem competição de z-index.
- [ ] **FOUND-05**: Componentes equivalentes convergem para uma linguagem única de botões, controles, badges, painéis, estados e feedback interativo.

### Shell and Navigation (SHELL)

- [ ] **SHELL-01**: Usuário navega pelo app sem sidebar, top bar ou navegação mobile sobrepor ou ocultar conteúdo.
- [ ] **SHELL-02**: Identidade, título, busca, ações, notificações e conta na top bar se reorganizam sem cortes em larguras intermediárias.
- [ ] **SHELL-03**: Todas as rotas autenticadas usam o mesmo frame de página e comportamento previsível de largura e gutters.
- [ ] **SHELL-04**: Navegação ativa, foco, menus, notificações e controles globais apresentam estados visuais e interativos consistentes.
- [ ] **SHELL-05**: Shell e navegação permanecem utilizáveis com zoom, safe areas, teclado e textos longos em PT-BR e EN.

### Product Surfaces (SURF)

- [ ] **SURF-01**: Usuário reconhece a mesma hierarquia de título, descrição, ação primária, ações secundárias e seções em todas as rotas.
- [ ] **SURF-02**: Usuário vê menos containers e cards redundantes sem perder agrupamento, contexto ou escaneabilidade.
- [ ] **SURF-03**: Ações primárias, secundárias e destrutivas têm prioridade inequívoca e comportamento consistente.
- [ ] **SURF-04**: Tabelas, filtros, formulários, toolbars e abas possuem alternativas estruturais utilizáveis em telas estreitas.
- [ ] **SURF-05**: Estados vazio, loading, erro e sucesso seguem padrões compartilhados, instrutivos e acessíveis.
- [ ] **SURF-06**: Dashboard, campanhas, biblioteca, templates/restyling, feedback e configurações usam a mesma linguagem visual e de interação.

### Campaign Workspace (WORK)

- [ ] **WORK-01**: Usuário mantém orientação clara entre briefing, upload, geração, revisão, entrega e performance mesmo após simplificação da hierarquia.
- [ ] **WORK-02**: Barras sticky, painéis, galerias, sidebars e rodapés do workspace não ocultam conteúdo nem ações em qualquer viewport suportado.
- [ ] **WORK-03**: Dialogs, sheets e popovers preservam foco, scroll, fechamento, retorno de foco e contexto do fluxo principal.
- [ ] **WORK-04**: Dados densos, status e metadados operacionais continuam acessíveis por hierarquia ou progressive disclosure, sem serem removidos apenas para limpar a tela.
- [ ] **WORK-05**: Nenhuma mudança visual altera regras de negócio, estados, permissões ou contratos existentes do fluxo de campanha.

### Responsive Behavior (RESP)

- [ ] **RESP-06**: Nenhuma rota autenticada apresenta scroll horizontal acidental, corte, colisão ou sobreposição de elementos.
- [ ] **RESP-07**: Rotas e estados representativos são validados em 390, 768, 1024, 1280, 1440 e 1920 pixels de largura.
- [ ] **RESP-08**: Telas ultrawide aproveitam espaço para galerias e dados sem esticar leitura, formulários ou controles indefinidamente.
- [ ] **RESP-09**: Controles e ações permanecem utilizáveis por toque, mouse e teclado em cada estrutura responsiva.

### Accessibility and Localization (A11Y)

- [ ] **A11Y-06**: Foco visível, ordem de tabulação e retorno de foco funcionam em navegação, menus, dialogs, sheets e popovers.
- [ ] **A11Y-07**: Contraste, seleção, erro, alerta e sucesso permanecem compreensíveis sem depender apenas de cor.
- [ ] **A11Y-08**: PT-BR e EN suportam textos longos, números, datas e labels sem quebra estrutural ou truncamento de informação crítica.
- [ ] **A11Y-09**: Light e dark mode preservam legibilidade, hierarquia, foco e significado sem exigir paridade decorativa artificial.

### Verification (QA)

- [ ] **QA-14**: Cada rota autenticada e família de componentes pertence a exatamente uma phase de implementação e a pelo menos um cenário de browser no release gate.
- [ ] **QA-15**: A matriz de validação cobre dados densos, vazio, loading, erro, conteúdo longo e combinações críticas de overlays.
- [ ] **QA-16**: Regressões visuais ou responsivas com lógica reproduzível recebem cobertura automatizada focada.
- [ ] **QA-17**: `npm test`, `npm run lint`, `npm run build`, auditoria de acessibilidade e UAT visual passam antes do release.

## Future Requirements

### Visual Regression Automation

- Baselines de screenshot automatizados em CI para todas as combinações de rota, tema e viewport após estabilização do conjunto inicial.
- Monitoramento contínuo de contraste, overflow e layout shift em produção.

### Personalization

- Preferência de densidade confortável/compacta por usuário após o modo compacto padrão ser validado.
- Configuração persistente de painéis e colunas por fluxo após observar uso real.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Novas capacidades de produto | O milestone reduz irregularidade da interface existente e não deve expandir o domínio funcional |
| Rebrand ou nova identidade visual | PRODUCT.md e DESIGN.md já definem uma direção adequada; o problema é consistência de aplicação |
| Redesign do site público | Marketing permanece em repositório separado |
| Novo framework, UI kit ou icon set | O stack atual é suficiente e outra camada aumentaria divergência |
| Animação decorativa ampla | Movimento deve comunicar estado e feedback, não competir com tarefas |
| Pixel-perfect idêntico entre telas não equivalentes | Consistência de sistema e comportamento importa mais que uniformidade artificial |
| Remoção de metadados para “limpar” telas | Usuários especialistas precisam de contexto operacional; usar hierarquia e disclosure |
| Refatoração backend sem necessidade para a interface | Mudanças devem permanecer limitadas ao que viabiliza contratos visuais e responsivos |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 109 | Pending |
| FOUND-02 | Phase 109 | Pending |
| FOUND-03 | Phase 109 | Pending |
| FOUND-04 | Phase 109 | Pending |
| FOUND-05 | Phase 109 | Pending |
| SHELL-01 | Phase 110 | Pending |
| SHELL-02 | Phase 110 | Pending |
| SHELL-03 | Phase 110 | Pending |
| SHELL-04 | Phase 110 | Pending |
| SHELL-05 | Phase 110 | Pending |
| SURF-01 | Phase 111 | Pending |
| SURF-02 | Phase 111 | Pending |
| SURF-03 | Phase 111 | Pending |
| SURF-04 | Phase 111 | Pending |
| SURF-05 | Phase 111 | Pending |
| SURF-06 | Phase 113 | Pending |
| WORK-01 | Phase 112 | Pending |
| WORK-02 | Phase 112 | Pending |
| WORK-03 | Phase 112 | Pending |
| WORK-04 | Phase 112 | Pending |
| WORK-05 | Phase 112 | Pending |
| RESP-06 | Phase 113 | Pending |
| RESP-07 | Phase 114 | Pending |
| RESP-08 | Phase 113 | Pending |
| RESP-09 | Phase 113 | Pending |
| A11Y-06 | Phase 113 | Pending |
| A11Y-07 | Phase 113 | Pending |
| A11Y-08 | Phase 113 | Pending |
| A11Y-09 | Phase 113 | Pending |
| QA-14 | Phase 109 | Pending |
| QA-15 | Phase 114 | Pending |
| QA-16 | Phase 114 | Pending |
| QA-17 | Phase 114 | Pending |

**Coverage:**
- v12.2 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-12*
*Last updated: 2026-06-13 after roadmap creation*
