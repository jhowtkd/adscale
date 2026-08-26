# Design: Cadastro publico, trial por creditos e Stripe live

**Data:** 2026-08-26

**Status:** Aprovado pelo usuario em 2026-08-26

**Repositorios:** `ADScale_2` (app, dados e billing) e `site-adscale` (landing)

## 1. Objetivo

Abrir o ADScale para cadastro publico, substituir a waitlist por um trial unico de 500 creditos e corrigir o corte de producao do Stripe. O trial nao exige cartao, nao expira e pertence ao workspace. Assinaturas pagas cobram imediatamente e renovam creditos mensalmente.

O trabalho tambem muda a denominacao dos creditos em 10x sem alterar o poder de compra existente.

## 2. Estado atual confirmado

- A landing publica em `/hi` envia os CTAs principais para o modal de waitlist.
- `/signup` ja cria usuario e workspace, mas nao concede entitlement nem creditos.
- Producao exige verificacao de email.
- O checkout Stripe ainda envia `trial_period_days: 14`.
- Os grants mensais atuais sao 30, 120 e 360 creditos.
- O Stripe live possui precos mensais ativos de R$ 47, R$ 147 e R$ 397.
- O webhook live existente aponta para `/api/billing/webhook`, esta habilitado e escuta os seis eventos esperados.
- A configuracao efetiva do Render nao expoe `APP_URL` nem `STRIPE_WEBHOOK_SECRET` para o servico `adscale-app`.
- A conta Stripe live nao possui configuracao ativa de Billing Portal.
- `site-adscale` tem alteracoes locais nao relacionadas em `render.yaml` e `src/components/Navbar.tsx`; a implementacao deve preserva-las e reconciliar apenas os trechos de CTA necessarios.

## 3. Decisoes de produto

| Tema | Decisao |
|---|---|
| Cadastro | Publico em `/signup` |
| Trial | 500 creditos, sem cartao e sem validade |
| Titularidade | Uma concessao por workspace novo |
| Ativacao | Somente depois da verificacao do email |
| Contas existentes | Sem concessao retroativa do trial |
| Waitlist existente | Dados preservados; novos registros recusados |
| Beta por codigo | Dados e grants existentes preservados; novos resgates recusados |
| Escala | Todos os valores de credito passam para 10x |
| Assinaturas | Starter 300, Growth 1.200 e Scale 3.600 creditos/mes |
| Precos | R$ 47, R$ 147 e R$ 397 por mes |
| Trial Stripe | Removido; primeira cobranca imediata |
| Trial ao assinar | Saldo remanescente continua disponivel |
| Teste pago | Nenhuma cobranca live sem autorizacao separada de R$ 47 |

## 4. Arquitetura escolhida

O trial ganha um entitlement proprio. Nao sera representado como beta e saldo isolado nao passara a significar acesso.

```text
Landing -> /signup -> usuario + workspace + trial pendente
                              |
                              v
                    verificacao de email
                              |
                              v
                entitlement trial ativo + grant 500
                              |
                              v
                         dashboard
```

### 4.1 Responsabilidades

`site-adscale`:

- Trocar CTAs de waitlist por links para `siteConfig.signupUrl`.
- Remover modal, provider e copy de waitlist, beta e trial de 14 dias.
- Exibir trial de 500 creditos e os valores pagos vigentes.

`ADScale_2`:

- Criar e ativar o entitlement de trial.
- Conceder creditos de forma transacional e idempotente.
- Aplicar a nova escala de custos, grants e historicos.
- Encerrar novas entradas de waitlist e beta.
- Remover o trial temporal do checkout.
- Alinhar planos e billing aos precos live.

Stripe e Render:

- Completar as variaveis ausentes.
- Configurar Billing Portal.
- Validar checkout, portal e webhook depois do deploy.

## 5. Ciclo de vida do trial

### 5.1 Criacao pendente

O hook de criacao de usuario continua criando o workspace e a membership de owner. Para usuarios comuns criados depois do corte, a mesma operacao cria:

```text
workspace_entitlements.kind = "trial"
workspace_entitlements.status = "pending_verification"
workspace_entitlements.expires_at = null
workspace_entitlements.redeemed_by_user_id = novo usuario
```

Workspace, membership e entitlement pendente devem ser gravados na mesma transacao. O dev admin e usuarios preexistentes nao recebem esse marcador.

O indice unico existente em `(workspace_id, kind)` define uma unica instancia de trial por workspace.

### 5.2 Ativacao apos email verificado

`emailVerification.afterEmailVerification` chama um servico idempotente com o usuario verificado. O servico:

1. Localiza o workspace em que o usuario e owner.
2. Abre uma transacao e bloqueia a linha do entitlement pendente.
3. Se o entitlement ja estiver ativo, retorna o grant existente.
4. Cria um grant com `source = "signup_trial"`, `source_id = entitlement.id`, `amount = 500` e `expires_at = null`.
5. Muda o entitlement para `active`.
6. Confirma grant e ativacao juntos.

Uma segunda execucao nao concede saldo adicional.

### 5.3 Recuperacao

Se o callback falhar por indisponibilidade transitoria, o entitlement permanece pendente e nenhum grant parcial e persistido. `GET /api/billing/status` apenas informa o estado pendente; o bootstrap autenticado chama `POST /api/billing/trial/activate`, que executa o mesmo servico idempotente.

Esse reparo nao afeta contas antigas: sem o entitlement `pending_verification`, nao existe elegibilidade retroativa.

Se a segunda tentativa tambem falhar, o status de billing retorna erro temporario observavel. A interface nao deve apresentar saldo zero como se o trial tivesse sido consumido.

### 5.4 Trial esgotado e assinatura

- Entitlement de trial permanece registrado para auditoria.
- `WorkspaceAccessKind` passa a reconhecer `trial`; assinatura paga continua tendo precedencia.
- Trial ativo com saldo zero continua identificado como trial, mas `canSpend` retorna `insufficient_credits`.
- Com saldo zero, novas operacoes retornam `insufficient_credits` e mostram upgrade.
- Projetos, biblioteca e historico permanecem acessiveis.
- Ao assinar, o grant mensal e somado ao saldo.
- Grants mensais com vencimento sao consumidos antes do grant de trial sem validade.

## 6. Nova unidade de credito

A escala 10x sera a unidade canonica do backend, nao uma mascara de apresentacao.

### 6.1 Custos

| Acao | Antes | Depois |
|---|---:|---:|
| Plano criativo | 1 | 10 |
| Derivacao de imagem | 5 | 50 |
| Regeneracao | 5 | 50 |
| Restilizacao | 5 | 50 |
| Filho de pacote de entrega | 5 | 50 |
| Landing page | 10 | 100 |
| QA criativo | 1 | 10 |
| Geracao de copy | 2 | 20 |
| Simulacao de persona | 3 | 30 |

Os custos canonicos de geracao tambem mudam para 50 por saida, 150 por triplet e 150 por goal package.

Para evitar nova divergencia, os mapas `CREDIT_COSTS` e `GENERATION_CREDIT_COSTS` devem derivar de constantes compartilhadas seguras para client e server. Nao sera criada uma camada de conversao em runtime.

### 6.2 Grants e apresentacao

| Oferta | Creditos | Capacidade aproximada a 50 creditos/imagem |
|---|---:|---:|
| Trial unico | 500 | 10 imagens |
| Starter mensal | 300 | 6 imagens |
| Growth mensal | 1.200 | 24 imagens |
| Scale mensal | 3.600 | 72 imagens |

`creditsToRemainingAds` usa 50 como custo unitario. Estimativas, contratos de acao, alertas, notificacoes e copy devem ler os valores canonicos.

No app, `BillingTab` deve reutilizar o modelo de precos vigente em vez de manter o mapa antigo de R$ 29, R$ 79 e R$ 199. A landing separada mantem os mesmos numeros de forma explicita e coberta por verificacao de build.

## 7. Migracao de dados 10x

A migracao e unica e executada pelo migrador Drizzle durante o deploy.

### 7.1 Colunas canonicas

- Multiplicar `credit_grants.amount` por 10.
- Multiplicar `credit_grants.remaining` por 10.
- Multiplicar `credit_transactions.amount` por 10.
- Multiplicar `usage_events.amount` por 10 somente quando `type` for uma acao cobrada por creditos.

`usage_events` tambem armazena cotas tecnicas e acknowledgements. Tipos como quotas do layer editor, `generation_dispatch_ack` e eventos de derivacao nao podem ser multiplicados. O filtro da migracao deve listar explicitamente os tipos de `CreditAction` persistidos por `recordUsage`.

### 7.2 Telemetria

Eventos de analytics `credit_spend` e `credit_blocked` guardam `estimateCredits`, `actualCredits` e `creditDelta` em JSON. A migracao multiplica esses tres campos numericos por 10 apenas nesses eventos. Outros metadados permanecem inalterados.

O schema de telemetria passa a aceitar `creditUnitVersion`. A migracao marca os eventos de credito ajustados com `creditUnitVersion: 2`, e todos os novos eventos `credit_spend` e `credit_blocked` gravam a mesma versao.

### 7.3 Seguranca operacional

Antes do deploy:

1. Gerar backup logico da base de producao.
2. Registrar contagens e somas das colunas afetadas.
3. Verificar que os produtos por 10 permanecem dentro de `integer`.

Depois da migracao:

1. As contagens de linhas devem permanecer iguais.
2. As somas afetadas devem ser exatamente 10x.
3. Tipos de `usage_events` fora da lista de credito devem manter os valores anteriores.
4. Uma amostra de workspaces deve manter exatamente o mesmo numero aproximado de imagens disponiveis.

Se qualquer invariante falhar, o deploy nao prossegue para smoke de checkout. A restauracao usa o backup logico e o deploy anterior conhecido como saudavel.

## 8. Encerramento da waitlist e do beta

### 8.1 Waitlist

- Remover os entrypoints visuais do `site-adscale`.
- `POST /api/waitlist` passa a responder `410 Gone` com estado estavel `waitlist_closed`.
- `OPTIONS` e headers CORS permanecem validos para clientes antigos receberem a resposta corretamente.
- Nao apagar `waitlist_signups`, contatos do Resend, repositorio ou schema nesta entrega.
- Nao enviar comunicacao automatica para a base existente.

### 8.2 Beta

- Remover campo e CTA de codigo beta de onboarding, `AccessGatePanel` e `BillingTab`.
- `POST /api/billing/beta/redeem` passa a responder `410 Gone` com `beta_closed`.
- O onboarding deixa de aceitar `betaCode`.
- Entitlements, redemptions e grants beta existentes continuam sendo reconhecidos ate o saldo acabar.
- `BETA_ACCESS_CODES` pode permanecer configurado durante o corte; nao existe rota ativa que o consuma.

## 9. UX de cadastro

O formulario de `/signup` nao redireciona imediatamente para `/` em producao. Depois do sucesso, exibe um estado de confirmacao com:

- Titulo: `Confirme seu email`.
- Explicacao de que os 500 creditos entram depois da confirmacao.
- Endereco mascarado ou escapado, sem expor credenciais.
- Acao de reenviar email usando a API oficial ja configurada.
- Link para login caso o usuario ja tenha confirmado.

O link de verificacao usa callback para `/`. `autoSignInAfterVerification` permanece ativo. Ao entrar, o trial ja deve estar ativo; se o reparo estiver em andamento, a interface mostra estado temporario em vez de paywall definitivo.

Mensagens de 14 dias, `trial termina em breve`, beta e waitlist saem das superficies de produto e marketing. O trial e sempre descrito como `500 creditos`, nunca como duracao em dias.

## 10. Stripe live

### 10.1 Checkout e grants

- Remover `subscription_data.trial_period_days` de `createCheckoutSession`.
- Manter `mode: "subscription"`, promotion codes, metadata e idempotencia de customer.
- A primeira fatura e cobrada no checkout.
- `invoice.paid` continua sendo a unica fonte de grant mensal.
- `planCreditGrants` passa para 300, 1.200 e 3.600.
- O processamento continua idempotente por `invoice.id`.

### 10.2 Render

Garantir no servico `adscale-app`:

- `APP_URL=https://adscale.jhonatansoares.com`
- `STRIPE_WEBHOOK_SECRET=whsec_...` do endpoint live atual ou substituto
- Os seis valores Stripe ja presentes continuam no mesmo modo live: secret key, tres price IDs e as URLs de sucesso/cancelamento.

Segredos nunca entram em commit, logs ou especificacao.

### 10.3 Webhook

O endpoint live atual ja possui URL e eventos corretos:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Preferencia: revelar o signing secret existente no Dashboard e coloca-lo no Render. Se nao for possivel, criar endpoint substituto com a mesma URL e eventos, guardar o novo secret imediatamente, validar entrega assinada e somente entao desativar o endpoint antigo.

### 10.4 Billing Portal

Criar uma configuracao live ativa com:

- Atualizacao de metodo de pagamento.
- Historico de faturas.
- Cancelamento de assinatura ao fim do periodo.
- Return URL no mesmo origin de `APP_URL`.

## 11. Testes automatizados

### 11.1 Trial e autenticacao

- Workspace novo recebe entitlement pendente, sem grant.
- Email verificado ativa entitlement e concede 500.
- Segunda ativacao nao duplica grant.
- Duas ativacoes concorrentes nao duplicam grant.
- Conta antiga sem entitlement pendente nao recebe trial.
- Falha transitoria preserva estado pendente e reparo posterior ativa uma vez.
- `POST /api/billing/trial/activate` exige sessao, owner verificado e entitlement pendente.
- Trial esgotado bloqueia nova geracao com upgrade.

### 11.2 Escala e migracao

- Todos os custos canonicos estao em 10x.
- Custos de billing e geracao permanecem sincronizados.
- Planos concedem 300, 1.200 e 3.600.
- Fixture de migracao comprova 10x em grants, ledger e usage de credito.
- Fixture comprova que quotas tecnicas em `usage_events` nao mudam.
- Analytics de credito tem os tres campos numericos ajustados.

### 11.3 Stripe e encerramentos

- Checkout nao contem `trial_period_days`.
- `invoice.paid` concede o valor correto uma unica vez.
- Waitlist retorna 410 sem persistir nem enviar email.
- Beta retorna 410 sem criar entitlement ou grant.
- Billing Portal retorna sessao quando customer existe.

### 11.4 UI e repositorios

- Signup mostra confirmacao de email.
- Planos exibem 500, 300, 1.200 e 3.600 conforme o contexto.
- Todos os precos exibidos sao R$ 47, R$ 147 e R$ 397.
- Nenhuma copy publica contem waitlist, codigo beta ou trial de 14 dias.
- Testes, lint, typecheck e build passam em `ADScale_2/app` e `site-adscale`.

## 12. Validacao de producao

Ordem do corte:

1. Backup e baseline dos dados.
2. Configurar `APP_URL`, signing secret e Billing Portal.
3. Publicar primeiro o app com migracao e billing corrigidos.
4. Confirmar `/api/health` e invariantes 10x.
5. Fazer cadastro com email novo e confirmar grant de 500.
6. Confirmar bloqueio de waitlist e beta.
7. Validar criacao de Checkout Session sem concluir pagamento.
8. Validar abertura e retorno do Billing Portal com customer controlado.
9. Confirmar webhook assinado e resposta 200.
10. Publicar a landing com CTAs para `/signup` somente depois do app estar pronto.
11. Reabrir `/hi` e testar todos os CTAs em desktop e mobile.

O smoke de cobranca live de R$ 47 e opcional e exige autorizacao explicita separada. Sem essa autorizacao, a entrega registra checkout criado, portal funcional e webhook assinado, mas nao afirma pagamento end-to-end.

## 13. Rollback

- Landing: restaurar o deploy anterior se CTAs ou assets falharem.
- App: restaurar o deploy anterior e manter novos cadastros fechados na landing durante recuperacao.
- Stripe: nao desativar o webhook antigo antes da validacao do substituto.
- Dados: usar o backup logico se a migracao violar as invariantes; nao aplicar uma divisao cega em producao.
- Cobrancas: qualquer cobranca live indevida deve ser reembolsada pelo Dashboard Stripe e registrada como incidente.

## 14. Fora do escopo

- Enviar campanha para contatos da waitlist.
- Conceder trial retroativo.
- Alterar precos ou produtos live do Stripe.
- Criar compra avulsa de creditos.
- Criar expiracao do trial.
- Reestruturar tiers alem da escala 10x.
- Expor signup social novo.
- Apagar tabelas, contatos ou historicos beta/waitlist.

## 15. Criterios de aceite

1. Visitante entra pela landing, cria conta, confirma email e ve 500 creditos sem cadastrar cartao.
2. Cada workspace novo recebe no maximo um trial.
3. Contas antigas nao recebem trial automaticamente.
4. Uma imagem custa aproximadamente 50 creditos e o poder de compra anterior e preservado.
5. Starter, Growth e Scale exibem e concedem 300, 1.200 e 3.600 creditos pelos precos live corretos.
6. Checkout cobra imediatamente e o webhook concede creditos por fatura paga sem duplicacao.
7. Billing Portal permite atualizar pagamento, ver faturas e cancelar ao fim do periodo.
8. Waitlist e beta nao aceitam novas entradas, sem apagar dados existentes.
9. Nenhum segredo e persistido no repositorio ou nos logs.
10. WIP local nao relacionado nos dois repositorios permanece intacto.
