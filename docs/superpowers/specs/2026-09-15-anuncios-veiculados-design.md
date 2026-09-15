# Anúncios veiculados — extração e análise de criativos da conta própria

Data: 2026-09-15 (rev. 2). Especificação de implementação proposta; nenhuma
alteração de aplicação, migração ou publicação foi executada nesta etapa.

Mapa: [#343](https://github.com/jhowtkd/adscale/issues/343).
Decisões: [#344](https://github.com/jhowtkd/adscale/issues/344) (API),
[#345](https://github.com/jhowtkd/adscale/issues/345) (vínculo/termos),
[#346](https://github.com/jhowtkd/adscale/issues/346) (relatório),
[#347](https://github.com/jhowtkd/adscale/issues/347) (sync/mídia/token).
Protótipo [#349](https://github.com/jhowtkd/adscale/issues/349) pulado —
fidelidade de UI fica nesta execução. Tarefa de app:
[#348](https://github.com/jhowtkd/adscale/issues/348)
(runbook: `docs/runbooks/meta-ads-dev-read.md`).

## Resultado e recorte

Operador com marca ativa abre **Anúncios veiculados** (5º destino da
navegação principal, rota `/served-ads`) e vê, em números, o que performa
agora entre os criativos veiculados nas Contas de anúncios vinculadas
àquela marca. Uma linha = um Anúncio veiculado. Sort padrão por CTR com
piso de evidência. Sem índice composto, sem padrões nomeados, sem
comparação com período anterior.

Fora desta spec: nomear padrões (hooks, cor, composição); alimentar
geração (vencedores virando Referência visual, repertório ou Direção
inferida); exportar/publicar Peças no Meta Ads Manager — o card mock de
`app/src/components/settings/IntegrationsTab.tsx` ("Export derivations
directly to Meta Ads Manager") promete isso e é **substituído** pelo fluxo
de Conexão Meta desta spec; Ad Library / criativos de concorrentes.

## Fontes e precedência

- `CONTEXT.md`: Conexão Meta, Conta de anúncios, Anúncio veiculado,
  Anúncios veiculados. `docs/agents/source-of-truth.md`: isolamento de
  workspace.
- Pesquisa #344: Graph v26.0; escopos `ads_read` + `ads_management` +
  `business_management`; token de integração = business integration
  system user via Facebook Login for Business; mídia com URL temporária
  (copiar na ingestão); sem `level=creative`; ADScale é Tech Provider
  (isolar por anunciante, apagar a pedido/revogação, sem perfil/cross-mix).
- Código inspecionado no checkout `main` HEAD `78a7378b`: navegação em
  `app/src/components/layout/AppSidebar.tsx` (`/`, `/campaigns`,
  `/library`, `/brand-kit`); storage em `app/src/server/storage/`
  (`ObjectStorage.put/get/delete`, `r2-object-storage.ts`); cron Inngest
  existente (`app/src/server/jobs/trial-notifications.ts`,
  `learning-proposal-aggregator.ts`); papéis `owner|admin|member` em
  `app/src/server/auth/workspace.ts`; nenhuma tabela de conexão externa.

## Modelo

- **Conexão Meta** pertence ao **workspace**. Campos: id, workspace_id,
  token cifrado (ver § Token), status (`ativa`, `expirada`, `revogada`,
  `com_erro`), timestamps. Um token por conexão.
- **Conta de anúncios** exposta pela Conexão; vinculada a **no máximo uma
  marca**; uma marca pode ter **várias** contas. Campos: id, conexão_id,
  `ad_account_id` (Meta), marca_id (nullable), timestamps.
- **Anúncio veiculado** pertence à **Conta** (não à marca): re-vincular a
  conta a outra marca leva os anúncios junto, nada é copiado. Identidade:
  `anuncio_veiculado_id = ad_account_id + ':' + creative_id`.
  - Ads que reutilizam a mesma spec (`creative_id`) **somam**.
  - `creative_id` distintos **nunca** fundem — sem fingerprint de
    texto/hash. Mesma mídia com copy diferente = linhas distintas.
  - Carrossel = uma linha (card não explode). Criativo dinâmico = uma
    linha (combinação de asset não explode). Ambos têm um `creative_id`.
  - Ad sem `creative.id` **não entra**.
- Métricas por Anúncio veiculado + janela (gasto, impressões, CTR, CPC,
  resultados/CPA quando houver conversão). Mídia copiada referencia a
  chave do `ObjectStorage`, nunca URL da Meta como canônica.

## Superfície `/served-ads`

- Contexto da **marca ativa**. Lista os Anúncios veiculados de **todas**
  as Contas vinculadas a ela. Gestão da Conexão Meta fica em
  Configurações → Integrações, não aqui.
- Colunas sempre: preview + trecho do texto, gasto, impressões, CTR, CPC.
  Resultados/CPA só quando a conta teve conversão no período. Fora:
  frequência, reach.
- Sort padrão: **CTR**, só entre linhas com ≥ **1.000 impressões** na
  janela; abaixo disso a linha permanece listada, fora da briga, marcada
  "sem evidência suficiente".
- Período: abertura em **30 dias**; presets **7 / 30 / 90**; teto 90 dias.
  Sem intervalo livre, sem `maximum` (37 meses), sem comparação anterior.
  Atribuição herda o default da Insights API (`7d_click` + `1d_view`); a
  v1 não expõe o knob.
- Recorte: só **formato** (imagem, vídeo, carrossel). Posicionamento e
  objetivo fora.
- Quem vê: `member` lê seguindo o acesso que já tem à marca;
  `owner`/`admin` conectam, vinculam e desfazem.
- PT-BR na superfície; strings novas em `app/messages/pt-BR.json` e
  `app/messages/en.json`.

## Sincronização

- Gatilhos: **na conexão** + job a cada **6 h** (cron Inngest, padrão
  existente) + botão **"atualizar agora"** na superfície. Insights não
  têm webhook útil (refresh ~15 min); 6 h cabe no BUC.
- Sync **não cobra crédito** e não passa pelo Generation Settlement.
- Sem #348 (sem Meta App), a superfície roda com **fixture**: mesmos
  componentes, mesmos aceites de agregação/ordenação, dados locais.

## Mídia

- Cópia no `ObjectStorage` (R2) **na ingestão**. Imagem: arquivo
  completo. Vídeo: thumbnail + arquivo. Nunca persistir URL da Meta como
  fonte canônica (imagem `url` é temporária, `permalink_url` permanente
  mas não canônica; vídeo `source` com TTL não documentado).

## Retenção e delete

- TTL **90 dias** após a última entrega: o job apaga mídia + métricas.
- Desconectar, revogar ou data-deletion: delete **imediato e completo**
  de token, mídia e métricas **daquela conexão**. Isolamento por
  workspace/Conta. Nada alimenta geração.

## Token

- Business integration system user (Facebook Login for Business),
  assets = ad accounts. Persistido **cifrado na Conexão Meta** (coluna).
- Cifra: **AES-GCM** com `META_TOKEN_ENCRYPTION_KEY` no env do Render;
  ciphertext na coluna. Sem KMS nesta spec.
- Re-auth pelo `owner`/`admin` quando `expirada`, `revogada` ou
  `com_erro`.

## Gate de entrega

- **PR de snapshot em `main` antes do PR de rotas.** O snapshot
  (modelo + fixture + agregação) prova a unidade e o sort sem depender
  da API; as rotas de ingestão vêm depois.
- Fechar #348 (Development + role-users + leitura) **≠ produção**.
  Produção multi-tenant exige Advanced Access, Business Verification,
  screencast e Live — esforço próprio, fora desta spec.

## Aceites (testes 1–5 da unidade + superfície)

1. Dois ads com o mesmo `creative_id` na mesma conta somam numa linha.
2. Mesmo `creative_id` em contas diferentes = linhas distintas
   (chave inclui `ad_account_id`).
3. Mesma mídia com copy diferente (`creative_id` distintos) = linhas
   distintas, sem fusão.
4. Carrossel e dinâmico aparecem como uma linha cada; ad sem
   `creative.id` não aparece.
5. Sort CTR ignora linhas < 1.000 impressões (marcadas, não removidas);
   presets 7/30/90 trocam a janela; recorte por formato filtra.
6. Desconectar a Conexão apaga token, mídia e métricas daquela conexão;
   outras conexões do workspace intactas.
7. Fixture: superfície completa e ordenada sem nenhuma chamada à Meta.
