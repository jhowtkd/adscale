# Spec: Anúncios veiculados

Data: 2026-09-15 (rev. 2). Handoff executável. O trabalho desta spec é o **rollup**; o resto é CRUD em volta.

Mapa: [Wayfinder: Meta Ads, voz no pedido e MCP/skills](https://github.com/jhowtkd/adscale/issues/343).
Pesquisa: `docs/research/2026-09-14-meta-marketing-api-creatives-insights.md` (branch `research/meta-marketing-api`).
Bloqueio Graph em Development: [#348](https://github.com/jhowtkd/adscale/issues/348). **Fechar #348 não libera produção** — ver “Development vs produção”.

## Resultado

O operador abre **Anúncios veiculados** (nome visível), rota **`/served-ads`**, no contexto da marca ativa, e lê o que performou nas Contas vinculadas. Não gera.

## Chave de identidade (aceite, não detalhe)

Insights não têm `level=creative`. A linha do ADScale é um Anúncio veiculado. Dois implementadores não podem inventar hashes diferentes.

**Chave canônica (única na v1):**

```text
anuncio_veiculado_id = ad_account_id + ":" + creative_id
```

- `ad_account_id` = id da Conta de anúncios (Meta `act_*` sem prefixo ou com — **um** formato, persistido como a Graph devolve em `account_id`).
- `creative_id` = `ad.creative.id` (AdCreative da Meta). Reutilizar o criativo = o mesmo `creative_id`. Copy diferente = AdCreative novo = outra linha.
- Ads (`ad_id`) com o mesmo `creative_id` na mesma conta **somam** na mesma linha.
- Dois `creative_id` distintos **nunca** se fundem, mesmo com a mesma imagem, o mesmo texto ou o mesmo CTA. Sem fingerprint paralelo na v1.
- Ad sem `creative.id`: **não entra** na lista nem no ranking. Log de ingestão; não inventar chave.

**O que a chave não é.** Não é `image_hash`, `video_id`, body, title, CTA, card de carrossel, asset de criativo dinâmico, UTM, nem texto normalizado. Esses campos são **atributos** da linha (preview, recorte, coluna de texto).

**Carrossel.** Um `creative_id` = uma linha, independentemente de `child_attachments` / cards. Cards não são linhas. Recorte “carrossel” usa o tipo do AdCreative, não explode cards.

**Criativo dinâmico.** Um `creative_id` (`asset_feed_spec`) = uma linha. Combinações `image_asset` / `title_asset` não explodem.

**CTA.** Atributo `call_to_action_type` (enum da Meta, ex. `SHOP_NOW`). Não é a string de botão. Não entra na chave.

**Texto.** Atributos `body` e `title` do AdCreative, como a Graph devolve. Sem normalização na chave (não há chave de texto).

**Métricas da linha (janela escolhida).** Somar nos ads do grupo: `spend`, `impressions`, `clicks`, `actions` (por `action_type` quando houver). Derivados: `ctr = clicks/impressions` (0 se impressions=0); `cpc = spend/clicks` (vazio se clicks=0). Não média de CTRs dos ads.

**Testes de identidade (obrigatórios no aceite):**

1. Dois `ad_id`, mesmo `creative_id`, copies idênticas → 1 linha; spend/impressions somados.
2. Mesmo `image_hash`, `body` diferente, `creative_id` diferente → 2 linhas.
3. Carrossel com N cards → 1 linha.
4. `asset_feed_spec` com vários assets → 1 linha.
5. Ad sem `creative.id` → 0 linhas para esse ad.

## Comportamento da lista

- Abertura: 30 dias. Sort CTR. Ranking só com ≥ 1.000 impressões na janela; abaixo = “sem evidência suficiente”, listado, fora da briga.
- Presets 7 / 30 / 90. Teto 90 dias. Sem comparação, sem intervalo livre.
- Colunas: preview + trecho de `body`/`title`, gasto, impressões, CTR, CPC. Resultados/CPA só com conversão na janela. Sem frequência, reach, score.
- Recorte v1: formato imagem | vídeo | carrossel (tipo do AdCreative).
- Atribuição: default Insights `7d_click` + `1d_view`. Sem knob.

## Sync, mídia, token, retenção

**Sync.** Na conexão + job 6 h + “atualizar agora”. Graph **v26.0**. Escopos `ads_read` + `ads_management` + `business_management`. Insights `level=ad`.

**Mídia.** Cópia no R2 na ingestão (imagem completa; vídeo thumbnail + arquivo). Não persistir URL da Meta.

**Retenção de mídia e métricas.** Acompanham o teto de leitura: **90 dias após a última entrega observada** daquele Anúncio veiculado. O job de 6 h apaga mídia + linhas de insight fora dessa janela. Não cresce para sempre. Desconectar / revogar / data-deletion **apaga imediatamente** token, mídia e métricas da conexão (não parcelar).

**Token.** System User de integração, ciphertext na coluna da Conexão Meta. Chave: env `META_TOKEN_ENCRYPTION_KEY` no Render (AES-GCM). Sem KMS nesta spec. Role-users / Development. Rotação de chave = fora.

**Custo.** Sync sem crédito. Fora do Generation Settlement.

## Development vs produção

| Estágio | O que é | O que não é |
| --- | --- | --- |
| Fixture | UI + rollup com JSON no shape da pesquisa | Graph |
| [#348](https://github.com/jhowtkd/adscale/issues/348) | App em **Development**, role-users, leitura real numa conta de teste | App Review, Live, SaaS |
| Produção multi-tenant | Advanced Access + Business Verification + screencast + Live | Consequência de fechar #348 |

Fechar #348 **não** autoriza apontar produção para a Graph de clientes. Spec de App Review é esforço próprio.

## Fixture

Não inventar shapes. Fixture = recortes dos objetos documentados na pesquisa (§5 Ad/AdCreative, §6 Insights `level=ad`): `ad_id`, `account_id`, `creative.id`, `image_hash`, `video_id`, `body`, `title`, `call_to_action_type`, `object_story_spec.child_attachments`, `asset_feed_spec`, `impressions`, `spend`, `clicks`, `actions`. Os cinco testes de identidade rodam contra essa fixture **antes** de #348.

## Superfície

- Nome visível: **Anúncios veiculados**. Slug EN: **`/served-ads`** (convenção `/library`, `/brand-kit`, `/campaigns`).
- Desktop: 5º `IconNavItem`. Hoje o grid é `grid-cols-4` e o comentário diz “four primary destinations” em `AppSidebar.tsx` — viram `grid-cols-5` e o comentário.
- Mobile: a barra já é `grid-cols-5` (4 destinos + Mais). **Não** virar 6 ícones. Entrada em **Mais**.
- Marca ativa; várias Contas da marca = uma lista.
- Conexão Meta em Configurações → Integrações (substitui o mock de export).
- Vazios: sem conexão; expirada/revogada/erro; marca sem Conta; sync; janela sem entrega.
- PT-BR + `en`. Código desta feature **fora** de `src/server/ai/`.

## Freeze — dois PRs, senão o gate vermelho

`check-primary-destinations.mjs` compara o working tree com o **`snapshots` do base ref** (`origin/main`), **não** com o JSON do próprio PR. Atualizar o manifesto no mesmo PR que cria `/served-ads` **não passa**.

**PR 1 (só exceção, merge em main primeiro):** editar `docs/decisions/allowed-primary-destinations.json`:

1. Entrada `supporting_module` `served_ads` (não `primary_destination`).
2. Incluir no **`snapshots`** (arquivos ainda inexistentes, de propósito): grupo `served-ads`, página `served-ads/page.tsx`, árvore API `served-ads`, rotas API que a implementação vai criar. `diff` é “current ∉ snapshot”; antecipar no snapshot **não** quebra o PR 1.
3. Apontar esta spec + [`docs/decisions/2026-09-15-anuncios-veiculados-supporting-surface.md`](../../decisions/2026-09-15-anuncios-veiculados-supporting-surface.md).

**PR 2 (implementação):** cria as rotas já listadas no snapshot de main. Não adiciona arquivos em `src/server/ai/`. Não descongela Landing/Persona.

Não existe env de bypass além do bootstrap one-time (`PRIMARY_DESTINATIONS_ALLOW_BOOTSTRAP`), que **não** se usa aqui.

## Aceite

1. Os cinco testes de identidade passam na fixture (shapes da pesquisa).
2. Owner conecta e vincula; member lê a marca e não conecta.
3. Abertura 30d / CTR / piso 1.000 / colunas combinadas / recorte formato.
4. Mídia+métricas com mais de 90 dias sem entrega são apagadas pelo job; desconectar apaga token+mídia+métricas na hora.
5. Nenhuma geração a partir desta superfície.
6. Token ciphertext; decrypt só com `META_TOKEN_ENCRYPTION_KEY`.
7. PR 2 verde no `convergence:check-destinations` **depois** do PR 1 em main.

## Fora

Nomear padrões. Alimentar geração. Ads Manager write. Ad Library. App Review. KMS. Fingerprint além de `creative_id`.
