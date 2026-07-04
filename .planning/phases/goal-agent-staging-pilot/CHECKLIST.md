# Goal-Agent Pilot — Walk Checklist (seções 3-9)

**Status:** validação automatizada concluída em 2026-07-04 · walk manual staging pendente de ops

{{ preenchido por: agent + owner | data: 2026-07-04 }}
{{ contexto: cenários 1–15 e release gate fechados; este checklist cobre o walk humano em staging (seções 3–9). Evidência em GOAL-AGENT-EVIDENCE.json. }}

Pré-requisitos antes de começar:

- [ ] Staging URL confirmada (Render dashboard)
- [ ] Cookie de sessão de platform-owner obtido no navegador
- [ ] `graduationReport` capturado via `curl` (ver bloco 10 abaixo)
- [ ] DevTools aberto na aba Network + Application > Local Storage

---

## 3. Credit ledger checks

Workspace sob teste: `<workspace_id>` · owner: `<email>`

| Ação | Saldo antes | Saldo depois | Delta esperado | Copy vista | OK? |
|------|-------------|--------------|----------------|------------|-----|
| Triplet (3 candidatos) | | | **−15** | "Cobrança definitiva: não há estorno…" | ☐ |
| Annotation revision | | | **−5** | mesma copy | ☐ |
| Package (3 formatos extra) | | | **−15** | mesma copy | ☐ |

- [ ] Copy `Cobrança definitiva: não há estorno, inclusive se uma geração falhar.` aparece **verbatim** em todas as 3 ações
- [ ] Sem refund automático após falha (ver seção 4)
- [ ] Ledger no DB (`credit_ledger` ou equivalente) bate com o delta observado no UI

Notas:
> {{ observações, IDs de transação, screenshots }}

---

## 4. Provider failure deliberada

- [ ] Forçar falha em **um slot** do triplet (ex.: invalid model key via env ou mock)
- [ ] Slot com falha: UI mostra estado **failed** explícito (não silencioso/vazio)
- [ ] Outros 2 slots continuam usáveis
- [ ] **Nenhum refund** disparado — ledger mantém a cobrança de 15 créditos
- [ ] Anotar ID do goal run + ID do slot que falhou

Notas:
> {{ causa da falha, evidência de "no refund" }}

---

## 5. Scope-isolation probes

Cliente A: `<id>` · Cliente B: `<id>`

- [ ] Thread aberto pro cliente A
- [ ] Tentar selecionar candidato de B → **rejeitado** (400/403/404)
- [ ] Tentar ler annotation de B → **rejeitado**
- [ ] Tentar promover versão de B → **rejeitado**
- [ ] Goal projection não vaza:
  - [ ] output keys
  - [ ] prompts
  - [ ] provider payloads
  - [ ] signed URLs (apenas `previewUrl` ephemeral por candidato OK)

Notas:
> {{ HTTP status codes exatos, request IDs }}

---

## 6. Consent probes (corpus promotion)

Goal run usado: `<id>`

- [ ] **Sem consent:** chamar promotion → resposta `client_consent_required` · **nenhum** corpus item criado
- [ ] **Grant consent:** `POST /api/assistant/threads/{threadId}/goal/corpus-consent` `{action:"grant"}`
- [ ] Re-rodar promotion → **sucesso**, corpus item criado
- [ ] **Revoke consent:** nova chamada de promotion → falha **closed** (mesma classe de erro que "consent absent")

Notas:
> {{ threadId, corpus item ID, timestamps }}

---

## 7. Browser notifications

{{ pendência: as notificações da seção 7 do runbook são in-app (notification API), não background push. Confirmar que está entendendo o escopo: nada de service worker / web push envolvido. }}

- [ ] Notification permission **granted** no browser
- [ ] Goal transiciona para `choosing_base` → **notificação nativa** dispara
- [ ] Goal transiciona para `reviewing_package` → **notificação nativa** dispara
- [ ] Goal transiciona para `completed` → **notificação nativa** dispara
- [ ] Nenhum service worker / web push envolvido

Notas:
> {{ screenshots, console logs do Notification.permission }}

---

## 8. Artifact reload

- [ ] Goal run em estado intermediário (anotar stage + candidatos + package items + annotations)
- [ ] **Fechar** o thread / recarregar a página
- [ ] Reabrir o mesmo thread
- [ ] Goal projection restaura **exatamente** do estado durável:
  - [ ] stage correto
  - [ ] candidatos iguais
  - [ ] package items iguais
  - [ ] annotations iguais
- [ ] SSE `goal_state` apenas sinaliza refetch — projeção **nunca** é persistida a partir do DTO do SSE

Notas:
> {{ goal run ID, snapshot antes/depois }}

---

## 9. Mobile contract

Viewport: iPhone-ish (≤ 414px wide)

- [ ] Monitoring acessível
- [ ] Comments acessíveis
- [ ] Approval acessível
- [ ] **Rectangle drawing desabilitado** com label explicativo

Notas:
> {{ screenshot mobile, device emulation usado }}

---

## 10. Graduation report (snapshot do gate)

```bash
curl -sS -H "Cookie: <session>" https://<staging>/api/feedback/analytics/goal-agent \
  | tee goal-agent-graduation.json
```

- [ ] `startedObjectives >= 20`
- [ ] `distinctClients >= 3`
- [ ] `completionRate >= 0.60`
- [ ] `criticalCreditFailures === 0`
- [ ] `criticalScopeFailures === 0`
- [ ] `graduation.passed === true`

Validar evidência automatizada:

```bash
node scripts/check-goal-agent-staging-evidence.mjs \
  --evidence ../.planning/phases/goal-agent-staging-pilot/GOAL-AGENT-EVIDENCE.json
```

{{ após o gate passar: snapshotar `goal-agent-graduation.json` no `.planning/phases/goal-agent-staging-pilot/` e colar a saída em `pilotNotes` do evidence JSON. }}

---

## Pós-piloto

- [ ] Preencher `manualRunbook` no evidence JSON com `"pass"` / `"fail"` / `"n/a"` e nota curta
- [ ] Quaisquer fricções viram item em `pilotNotes[]` antes de partir pra notificações background / aprendizado por cliente
- [ ] **Fora de escopo deste piloto:** background notifications + per-client learning (ficam pra depois do gate)