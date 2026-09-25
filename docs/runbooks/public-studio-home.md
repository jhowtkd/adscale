# Runbook — home pública unificada: ativação, reversão e retirada do serviço antigo

**Situação (2026-09-25):** ativação A em produção e verificada; serviço antigo suspenso e pós-verificado
(falta build subsequente); ativação B aguarda os gates do §4.4. Registros na #447.
Evidências S8: `.planning/public-studio-home/qa-evidence.md`.

## 1. Destino e limites

`/hi` é servida pelo Next.js em `app/`, no **mesmo serviço `adscale-app` no Render** que serve o
Estúdio. Origem pública preservada: `https://adscale.jhonatansoares.com` (cookies e IndexedDB
intactos). Não tocar em worker de imagens, banco, domínio ou grupos compartilhados.

## 2. Estados de flags (mesmo serviço)

| Estado | HOME | IMPORT | ATTACHMENTS |
|---|---|---|---|
| Contenção total | false | false | false |
| Ativação A | true | true | false |
| Ativação B | true | true | true |
| Reversão visual com drenagem | false | true | conforme segurança |

`render.yaml` declara as três como `"false"` (padrão seguro). Ativação = virar flags no dashboard
do Render com rebuild/redeploy; nunca publicar `preview=true` nem depender de autodeploy parcial
(`autoDeployTrigger: checksPass` — merge só após gates).
`MARKETING_URL` aponta para a própria origem `/hi` (destino de navegação, não hospedagem).
Não existe `MARKETING_UPSTREAM_URL` em código, config ou Blueprint (verificado).

## 3. Ensaio executado (local, build de produção)

- Rollback rehearsal `HOME=false/IMPORT=true`: `/hi` 200 fallback, `/hi/` 308→`/hi` sem loop,
  pedido pendente concluído via escolha explícita de texto (fase `rollback` do spec
  `guest-home-flags`, perfil persistente).
- Contenção total: recuperação com copiar/descartar, zero mutações, nada apagado (fase `contain`).
- Independência do serviço antigo: jornada pública 100% same-origin (assertion E2E); grep mostra
  zero hosts remotos; nenhum serviço separado no Blueprint — todo o ensaio ocorreu sem nenhum
  servidor antigo acessível.

## 4. Publicação da ativação A (humano aprova e executa o deploy)

1. Mergear o PR da branch `feat/public-studio-home` após CI verde.
2. No Render (`adscale-app`): `PUBLIC_STUDIO_HOME_ENABLED=true`,
   `PUBLIC_STUDIO_IMPORT_ENABLED=true`, `ATTACHMENTS=false`; rebuild/redeploy.
3. Verificar: `/hi` interativa, `/hi/`, assets, login→retomada→Trabalho sem outputs gerados,
   multi-marcas, fallback. Medir erros de auth/importação e disponibilidade.
4. Ativação B somente após: teste nativo de 3 arquivos + falha parcial em ambiente com
   R2/Inngest reais, Safari/iOS físico, aprovações V05 do dono e revisão manual V03.

**Executado:** ativação A live no deploy `dep-daqpd6flot8c73amos40` (`a74bfb12`, 2026-09-24 21:38 UTC);
pós-verificação em 2026-09-25 — home, assets same-origin, handoff → login → retomada → Trabalho sem
geração, sem duplicação ao reabrir o rascunho, logs sem erro.

## 5. Reversão sem reativar servidor separado

- Problema visual: `HOME=false` + `IMPORT=true` (+ATTACHMENTS conforme segurança),
  rebuild/redeploy, conferir fallback + pedido pendente.
- Problema de importação: três flags `false`; recuperação/cópia local preservada.
- Rollback de código: **somente build já unificado** compatível com snapshots em circulação.
  Referência de recuperação aprovada: commit `0a60036b` (série S8, testado). Rebuild do commit
  unificado se o artefato não estiver disponível; conferir vars/grupos/autodeploys depois.
  Commit anterior à migração que reintroduza upstream NÃO é elegível após a retirada.
- Nunca reativar o serviço antigo para corrigir a home.

## 6. Desativação do serviço antigo (humano executa, após §4 estável)

Pré-condição: zero dependência comprovada (§3 + pós-verificação §4).
O Blueprint não contém serviço separado de marketing — a retirada é operação de dashboard:

1. Identificar o recurso dedicado exato (ID no Render) e confirmar ausência de outros consumidores.
2. Preservar assets/configs úteis; desabilitar hooks/pipelines exclusivos do recurso.
3. Desativar/excluir o recurso por operação explícita do responsável. Registrar ID, horário e
   resultado na issue #447 (sem segredos).
4. Pós-verificação: repetir `/hi`, `/hi/`, assets, login/cadastro, retomada, fallback e um build
   subsequente; confirmar nenhum fetch ao serviço desativado.
5. Limpar variáveis/credenciais exclusivas do recurso retirado (conferir grupos compartilhados).

Se outro consumidor bloquear: registrar migração pendente, não concluir.

**Executado:** `adscale-marketing` (`srv-d8k06j57vvec73e75fr0`, static site de `site-adscale`) suspenso
em 2026-09-25 11:47 UTC; Custom Domains vazio; `MARKETING_ALLOWED_ORIGINS` sem o host antigo.
Pós-verificação OK; build subsequente pendente. Exclusão definitiva após período de observação.

## 7. Sinais de interrupção

Dependência do servidor antigo, alvo errado, vazamento entre workspaces, loop de auth, geração
automática, perda de snapshot, duplicação de Trabalho, coleta indevida, falha de build/deploy.
Interromper e corrigir antes de avançar.

Fontes: `https://render.com/docs/infrastructure-as-code`,
`https://render.com/docs/blueprint-spec`, `https://render.com/docs/rollbacks`,
`https://render.com/docs/configure-environment-variables`.
