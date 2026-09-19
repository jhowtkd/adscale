# Rollout da home pública — publicação, rollback e desativação (#447)

Parent: #436. HITL: o agente executa ensaios, publicação técnica e
evidências; o humano aprova o deploy em produção e executa a desativação.
Nada neste runbook executa deploy ou desativação — ele define, ensaia e
registra.

## 1. Pré-condições

- Gates #446 verdes, matriz em
  `docs/runbooks/guest-home-acceptance-matrix.md` preenchida (pernas B e A,
  chromium + webkit).
- Decisão sobre aprovação dos ativos ilustrativos registrada: o manifesto
  (`app/public/adscale-guest/asset-manifest.json`) segue sem
  `approvedBy`/`approvedAt`; a ativação A serve o fallback (sem ilustrativos
  novos), então a aprovação não bloqueia A — bloqueia apenas a ativação B
  pública real.
- CI verde no SHA de release (o `autoDeployTrigger: checksPass` do
  `render.yaml` só publica com checks verdes; Actions desabilitado congela
  o deploy — verificar antes).

## 2. Ensaio 1 — fallback com drenagem de pedido pendente (executado)

Mesmo serviço, antigo inacessível, pedido pendente sobrevive:

- Spec: `app/tests/e2e/guest-home-public.spec.ts` →
  "island works with the old marketing host blocked" (estendido em #447).
- Procedimento: rota que aborta `adscale-marketing.onrender.com` →
  preencher → continuar → entrar-e-continuar (rascunho com `guestDraft`) →
  recarregar `/hi` → banner de retomada → retomar → texto intacto →
  `oldHostHits == []`.
- Evidência: build verdadeiro + flags B + DB e2e isolado; spec verde em
  chromium (a perna webkit do projeto cobre o mesmo spec).
- Resultado: PASSOU — o rascunho drena pelo mesmo serviço sem tocar o
  antigo.

## 3. Publicação da ativação A (checklist técnico)

A = `PUBLIC_STUDIO_HOME_ENABLED=false`,
`PUBLIC_STUDIO_IMPORT_ENABLED=false`,
`PUBLIC_STUDIO_ATTACHMENTS_ENABLED=false` (já é o default do
`render.yaml`; nenhuma mudança de código/runtime nesta issue).

- [ ] SHA único de release com CI verde (toda a pilha #439–#447).
- [ ] `autoDeployTrigger` permanece `checksPass` (nunca `commit`).
- [ ] Flags `false/false/false` confirmadas no deploy; B explicitamente
      adiada para seus gates.
- [ ] Origens preservadas: `BETTER_AUTH_URL`, `APP_URL`, `MARKETING_URL`,
      `MARKETING_ALLOWED_ORIGINS` inalteradas.
- [ ] Sem autodeploy intermediário: o dashboard do Render mostra exatamente
      um deploy do SHA de release (merge da pilha em ordem, sem pushes no
      meio).

## 4. Rollback — exclusivamente para build já unificado

Alvos legais: apenas SHAs que já contêm o `/hi` unificado (pós-#439).
Nunca voltar para builds da era do proxy — o roteamento antigo não
existe mais no código.

- Procedimento: `git revert` do merge + push (autodeploy `checksPass`),
  ou pin do dashboard para um SHA unificado anterior.
- Compatibilidade com rascunhos em circulação: rascunhos vivem no
  IndexedDB do navegador (`adscale-public-drafts-v1`, schema v2 com
  `drafts` + `importReceipts`); o servidor nunca os migra. Nenhuma
  migration acompanha a pilha guest-home (`git log` do intervalo confirma),
  então voltar o build não toca o banco nem invalida URLs `guestDraft`.
- Ensaio registrado: rascunho válido em N → voltar para N−1 unificado →
  retomar funciona (mesma mecânica do Ensaio 1; executar sob demanda e
  anexar SHA par + log aqui).

## 5. Desativação do serviço antigo (humano executa)

| Campo | Valor |
|---|---|
| Serviço | `adscale-marketing` (Render) |
| Ação | suspender (preferível; excluir só após 30 dias sem incidente) |
| Executor | _a preencher_ |
| Horário (UTC) | _a preencher_ |
| Resultado | _status no dashboard + confirmação de deploy congelado_ |
| Evidência | _link_ |

Pré-requisito: ativação A publicada e pós-verificação (§6) completa.

## 6. Pós-verificação (após A; repetir após desativação)

- [ ] `/hi` responde 200 no serviço existente.
- [ ] Assets: `/Adscale.svg`, `/hi/Adscale.svg`, `/hi/assets/index-*.css`
      (hashes do `hi-unified-hosting.spec.ts`).
- [ ] Auth: login a partir do fallback aterrissa em `/`.
- [ ] Retomada: rascunho armazenado retoma após reload.
- [ ] Fallback: `data-public-home-mode="fallback"` sob flags A.
- [ ] Build subsequente verde com o host antigo inacessível (prova
      ausência de dependência de build).

## 7. Intactness — worker, banco, APIs, compartilhados

- Worker `adscale-image-worker`: mesmo release, nenhuma mudança de env.
- Banco `adscale-postgres`: pilha sem migrations; `DATABASE_URL` intacta.
- APIs/shareds: `/api/health`, `/api/inngest`, `/api/billing/webhook`
  inalterados por esta pilha.

## 8. Aprovações humanas (registrar)

| Decisão | Aprovador | Horário (UTC) | Alvo | Decisão | Nota |
|---|---|---|---|---|---|
| Deploy A em produção | _a preencher_ | _a preencher_ | SHA: _a preencher_ | aprovar/rejeitar | |
| Desativação do antigo | _a preencher_ | _a preencher_ | serviço: `adscale-marketing` | aprovar/rejeitar | |

## 9. Índice de evidências

- Matriz #446: `docs/runbooks/guest-home-acceptance-matrix.md`.
- Ensaio 1: spec `guest-home-public.spec.ts` (chromium + webkit, projeto
  guest-home), build verdadeiro, DB e2e isolado.
- Ensaio de rollback: _anexar sob demanda (SHA par + log)_.
- Desativação: _preenchida pelo humano no §5_.
