# Tasks: Ship sequence (um por um)

Status inicial: todas `pending`. Executar **uma task por vez**; marcar `done` só no checkpoint.

---

## F1 — Higiene local

### T1 — Triage residual uncommitted
- **Fase:** F1
- **Status:** done
- **Deps:** —
- **Descrição:** Revisar e decidir destino dos arquivos locais:
  - `.planning/phases/128-evaluation-and-release-gate/128-{BASELINE,EVIDENCE,VERIFICATION}.*`
  - `.planning/ops/beta-feedback-daily/2026-07-08.md`
- **Arquivos:** paths acima
- **Output:** decisão explícita: commit único de hygiene **ou** leave uncommitted / discard
- **Testes:** n/a (docs only)
- **Checkpoint:** `git status` limpo **ou** residual conscientemente ignorado
- **Resultado:** `commit_hygiene` — ver `decision-log.md`. Inclui também `.cursor/features/2026-07-08-ship-sequence/` no mesmo commit.

### T2 — Commit hygiene (se T1 = commit)
- **Fase:** F1
- **Status:** done
- **Deps:** T1
- **Descrição:** Se T1 escolheu commit: um commit docs/ops só com esses arquivos. Mensagem focada em “why” (evidence refresh / daily beta).
- **Arquivos:** mesmos de T1
- **Output:** commit local; working tree limpa para o ship
- **Testes:** n/a
- **Checkpoint:** `git status -sb` sem M/?? desses paths
- **Skip se:** T1 = não commitar
- **Resultado:** `921a8313` — working tree limpa; F1 completa

---

## F2 — Publicar commits

### T3 — Preparar PR (ou push)
- **Fase:** F2
- **Status:** pending
- **Deps:** T1 (e T2 se aplicável)
- **Descrição:** Confirmar branch tracking, diff vs `origin/main`, e se o fluxo é PR ou push direto em `main`. Default recomendado: **PR** com body em duas seções (dual-engine + workspace UX).
- **Arquivos:** n/a (git/gh)
- **Output:** decisão PR vs push + draft do summary
- **Testes:** opcional — `cd app && npm test` nos packs tocados se CI for exigir
- **Checkpoint:** usuário confirma “PR” ou “push main”

### T4 — Push + criar PR (ou push main)
- **Fase:** F2
- **Status:** pending
- **Deps:** T3
- **Descrição:** `git push -u` e `gh pr create` (ou push direto se T3 = push). Incluir test plan: migrate staging, smoke rate 0, smoke UX.
- **Arquivos:** n/a
- **Output:** URL do PR **ou** `main` atualizado no remote
- **Testes:** CI do PR (se houver)
- **Checkpoint:** remote contém os 20 (+ hygiene) commits

---

## F3 — Staging migrate + env

### T5 — Aplicar migration 0073 no staging
- **Fase:** F3
- **Status:** pending
- **Deps:** T4 (código no remote / deploy staging)
- **Descrição:** Rodar `db:migrate` no staging. Verificar que `derivations.candidates` existe (SQL introspect ou query simples).
- **Arquivos:** `app/drizzle/` (já no repo); ops staging
- **Output:** evidência de migrate OK (log ou screenshot/query)
- **Testes:** query `candidates` nullable jsonb presente
- **Checkpoint:** coluna existe; jobs de derivation não erroam por schema

### T6 — Configurar env Seedream (rate 0 primeiro)
- **Fase:** F3
- **Status:** pending
- **Deps:** T5
- **Descrição:** Setar vars BytePlus/Seedream no staging se ainda não estiverem. Manter `SEEDREAM_SAMPLE_RATE=0` no primeiro ciclo. Documentar que mudança de rate exige **restart dos workers**.
- **Arquivos:** Render env / `.env` staging (não commitar secrets)
- **Output:** env presente; rate=0; workers reiniciados se necessário
- **Testes:** job de imagem com rate 0 usa só OpenAI
- **Checkpoint:** geração staging OK sem chamar Seedream

---

## F4 — Smoke

### T7 — Smoke dual-engine (staging)
- **Fase:** F4
- **Status:** pending
- **Deps:** T6
- **Descrição:**
  1. Rate `0`: 1 generation → OpenAI only, job success.
  2. (Opcional neste ciclo) Rate baixo + restart workers: Seedream pode falhar sem derrubar o job; winner continua OpenAI.
- **Arquivos:** n/a (ops)
- **Output:** notas de smoke (pass/fail) no PR ou em `.planning/ops/` se quiser registrar
- **Testes:** smoke manual
- **Checkpoint:** path derivation estável com rate 0

### T8 — Smoke workspace UX (staging ou local apontando staging)
- **Fase:** F4
- **Status:** pending
- **Deps:** T4 (código UX deployado)
- **Descrição:** Happy path:
  1. Sign-in → Campanhas
  2. Nova campanha / upload base
  3. Gerar com 1 clique (strategy adjust opcional)
  4. Derivação: Preparar → Gerar → Entregar (uma primary action por stage)
  5. Shell: Campanhas como path principal; sem ruído de nav reintroduzido
- **Arquivos:** n/a
- **Output:** pass/fail por passo
- **Testes:** smoke manual (+ regressões unit já no commit)
- **Checkpoint:** UX aceitável para merge/prod; se falhar, abrir hotfix separado sem reverter dual-engine

---

## F5 — Enfileirar debt (sem implementar)

### T9 — Registrar follow-ups dual-engine
- **Fase:** F5
- **Status:** pending
- **Deps:** T7
- **Descrição:** Criar itens explícitos (issue/backlog/GSD todo) na ordem:
  1. Task 13 — winner por `creative-score`
  2. Task 14 — telemetry campaign/workspace/jobType
  3. Task 15 — `costCredits`
  4. Task 16 — retry policies
  5. Persist `candidates` no creative-work
  6. Playwright both-fail
  7. Alinhar docs rollback
- **Arquivos:** issue tracker ou `.planning` backlog — **não** código de feature
- **Output:** links/IDs dos follow-ups
- **Testes:** n/a
- **Checkpoint:** debt não está “só no audit”; está acionável

### T10 — Decidir próximo produto (pós-ship)
- **Fase:** F5
- **Status:** pending
- **Deps:** T8, T9
- **Descrição:** Escolher **um** próximo foco:
  - A) Continuar UI simplification (`2026-07-02-ui-simplification`)
  - B) Dual-engine Task 13 (score winner)
  - C) Novo milestone GSD (`/gsd-new-milestone`)
- **Arquivos:** n/a
- **Output:** escolha única + comando/skill de entrada
- **Testes:** n/a
- **Checkpoint:** sequência de ship encerrada; próximo trabalho nomeado

---

## Ordem estrita

```
T1 → (T2?) → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10
```

T8 pode rodar em paralelo com T7 depois de T4/T6, mas o default “um por um” é T7 depois T8.

## Fora desta lista

- Implementar Task 13+
- Fechar plano UI simplification inteiro
- Arquivar v13.9 / abrir milestone novo (só em T10 se escolhido)
