# Item 50 — UAT desktop e mobile (Phase 6 / Gate 6)

**Pré-requisito:** item **49b** fechado (strategy recipe surface server-derived).  
**Objetivo Gate 6:** um usuário inicia, retoma, revisa e entrega sem precisar entender os antigos subsistemas.

## Ambiente

| Campo | Valor |
|-------|--------|
| Branch | `chore/convergencia-produto-arquitetura` |
| Build | deploy local / staging com conta beta real |
| Desktop | 1280×800 e 1440×900 |
| Mobile | 390×844 (iPhone) e 360×800 (Android) |
| Marcas | ≥ 2 client profiles / Brand Kit com assets |
| Contas | owner e tester (se feedback for testado) |

## Evidência por cenário (obrigatório)

Para **cada** cenário abaixo registrar:

1. **URL** final  
2. **Viewport** (desktop/mobile + dimensões)  
3. **Resultado** (pass / fail / blocked)  
4. **Screenshot** (nome: `uat-50-S##-viewport.png`)  
5. **Console** (erros JS)  
6. **Network** (4xx/5xx relevantes)  
7. **Notas** (créditos antes/depois, IDs de work/campaign)

---

## S01 — Home: novo trabalho (intenção)

| | |
|--|--|
| **Caminho** | `/` → Novo trabalho |
| **Esperado** | Picker: Campanha · Criar post · Assistente; sem pular para superfície sem escolha |
| **Mobile** | Bottom nav Home; logo/home abre o mesmo fluxo |

## S02 — Novo trabalho **com campanha**

| | |
|--|--|
| **Caminho** | Home → Campanha → `/campaigns?new=1` → criar |
| **Esperado** | Modal/criação; redireciona para `/campaigns/{id}` em briefing (stage Briefing) |
| **Checar** | Nav **Trabalhos** lista a campanha (filtro Campanhas ou Todos) |

## S03 — Novo **Criar Post** sem campanha

| | |
|--|--|
| **Caminho** | Home → Criar post → brief → copy → assets → gerar |
| **Esperado** | Wizard com `?workId=`; três propostas; sem erro de console |
| **Checar** | Home/Trabalhos (filtro Posts) listam o trabalho após criar |

## S04 — Retomada pela **Home** (Continuar)

| | |
|--|--|
| **Setup** | 1 campanha em `generating`/`reviewing` + 1 post em andamento |
| **Caminho** | `/` → Continuar de onde parei |
| **Esperado** | Prefere in-progress canônico; **não** abre `approved`/`delivered` como “continuar” |
| **Post** | `resumeHref` usa `workId` (não workItemId) |
| **Campanha** | Abre `/campaigns/{id}` |

## S05 — Retomada por **Trabalhos**

| | |
|--|--|
| **Caminho** | Nav Trabalhos → filtros Todos / Campanhas / Posts → abrir linha |
| **Esperado** | Lista canônica; ações de campanha (duplicar/arquivar) só em origin campaign; post abre create-post |
| **Grade/Quadro** | Só campanhas; paginação funciona; contagem coerente |

## S06 — Briefing → Produzir → Revisar → Entregar (campanha)

| | |
|--|--|
| **Caminho** | Workspace da campanha |
| **Steps** | Stage strip: Briefing · Produzir · Revisar · Entregar |
| **Esperado** | Clicar Revisar → scroll `mission-review`; Entregar → `mission-share` (não o mesmo bloco) |
| **Produzir** | Recipe panel: ranking/créditos vindos da API (network `POST /api/strategy-recipe/resolve`) |

## S07 — Preview **auto-aprovado** (quality ok)

| | |
|--|--|
| **Caminho** | Gerar preview com qualidade acceptable |
| **Esperado** | `produceSurface.shouldAutoContinuePreview` true (via GET derivations); batch enfileira sem gate manual |
| **Créditos** | Saldo antes/depois bate com preview + batch cobrados |

## S08 — Preview **bloqueado** pelo gate

| | |
|--|--|
| **Caminho** | Preview com quality invalid / hardFailures |
| **Esperado** | Gate manual visível; **sem** auto-continue; usuário ajusta ou continua explicitamente |

## S09 — Créditos exibidos vs cobrança

| | |
|--|--|
| **Caminho** | Recipe panel: previewCredits / batchCredits na UI |
| **Checar** | Network `POST /api/strategy-recipe/resolve` → `previewCredits`/`batchCredits` iguais à UI |
| **Após run** | Extrato/billing (ou saldo) reflete custo real do batch |

## S10 — Template materializado

| | |
|--|--|
| **Caminho** | Templates → materializar → campanha nova |
| **Esperado** | Aparece em Trabalhos (canônico); double-submit bloqueado; invalidação de lista |

## S11 — Salvar post na **Biblioteca**

| | |
|--|--|
| **Caminho** | Criar Post → Salvar na biblioteca |
| **Esperado** | Redirect `/library`; imagem visível (proxy `/api/workspace/assets/{id}/file`) |
| **Reload** | Imagem permanece |

## S12 — Estados vazio / loading / erro / retry

| Superfície | Vazio | Loading | Erro + retry |
|------------|-------|---------|--------------|
| Home | continueEmpty | skeleton continue | errorTitle + retry |
| Trabalhos lista | empty + limpar filtros | skeleton lista | error loading + retry |
| Workspace | n/a | generating spinner | derivation load banner |
| Recipe panel | n/a | loading surface | isError / refetch se aplicável |

## S13 — Navegação **mobile** completa

| Item | Destino |
|------|---------|
| Home | `/` |
| Trabalhos | `/campaigns` |
| Biblioteca | `/library` |
| Marcas | `/brand-kit` |
| Mais | Config `/settings`, Templates, Assistente |

**Esperado:** sem labels legados “Dashboard/Campanhas” no bottom; Config **não** no primary row.

## S14 — Assistente como modo (intent)

| | |
|--|--|
| **Caminho** | Home → Assistente |
| **Esperado** | Abre `/assistant`; não cria work até o usuário agir |

---

## Critérios de pass do item 50

- [ ] Desktop **e** mobile: S01–S14 sem P1  
- [ ] Com campanha **e** sem campanha cobertos  
- [ ] Preview auto + gate manual cobertos  
- [ ] Créditos UI = response server (S09)  
- [ ] Zero erros de console bloqueantes nos happy paths  
- [ ] Evidência (screenshots + notas) anexada ao Gate 6  

## Não é escopo do UAT (já gate de código)

- Imports runtime de `@/server/ai/strategy-recipes` no client (verificação automatizada no 49b)  
- `as never` na facade workspace (já fechado)

## Após UAT

Atualizar plan: Gate 6 aprovado **somente** se S01–S14 passarem e 49b permanecer verde no CI.
