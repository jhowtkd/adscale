# Fluxo 0 · valores de ambiente do lançamento

Este runbook registra **o que configurar** para abrir o fluxo 0 (conta grátis, conversa com a mesa, leitura da marca, diagnóstico grátis) e **em que ordem**. Ele não autoriza deploy nem a abertura para todos: cada passo abaixo é uma decisão do dono, com confirmação.

## Variáveis

| Variável | Valor de lançamento | Observação |
| --- | --- | --- |
| `EQUIPE_ENABLED` | `true` | Chave geral. Com `false` (padrão) tudo fica como antes: home antiga, barra antiga, sem conta grátis |
| `EQUIPE_PILOT_WORKSPACES` | UUIDs dos workspaces do piloto, separados por vírgula | Vazio = ninguém. `*` (todos) **só depois do ticket 11** (telas do staff e parada global com muitas contas grátis) |
| `ANTHROPIC_API_KEY` | chave do Render | Estrategista e a visão da leitura (Opus). Sem ela o app não sobe com o piloto ligado |
| `META_MODEL_API_KEY` | chave do Render | Pesquisa (`muse-spark-1.3-contributor`), que escreve o diagnóstico. Sem ela o app não sobe com o piloto ligado |
| `SITE_READER_PROVIDER` | `firecrawl` | Com `FIRECRAWL_API_KEY`. Sem chave o leitor falha fechado, com mensagem clara, sem derrubar o app |
| `FIRECRAWL_API_KEY` | chave do Render | |
| `INSTAGRAM_READER_PROVIDER` | `apify` | Com `APIFY_TOKEN`. Sem token a leitura do Instagram falha fechada |
| `APIFY_TOKEN` | token do Render | |
| `EQUIPE_FREE_AI_BUDGET_USD_CENTS` | `100` (padrão) | Teto de IA da conta grátis, vitalício e estrito: US$ 1 |
| `EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS` | **`10`** | Reserva do 1º diagnóstico dentro do teto. Medida no ticket 08: um diagnóstico liquida em 1 centavo, são até 6 tentativas por leitura (1 automática de 2 tentativas + 2 pedidos de "Tentar de novo"), ou seja 6 centavos no pior caso, mais 4 de folga para pequenas mudanças de preço. **Sem a variável a reserva é o teto inteiro**: a conversa livre só abre depois do diagnóstico, o que é seguro mas fecha o chat durante a geração |
| `EQUIPE_FREE_STRATEGIST_MAX_TOKENS` | `2048` (padrão) | Saída máxima de cada resposta do Estrategista grátis |

Os modelos (`EQUIPE_MODEL_STRATEGIST`, `EQUIPE_MODEL_RESEARCH`, `EQUIPE_MODEL_REVIEWER`) e o esforço por papel têm padrão no código; só mexa se a tabela de preços do ledger mudar.

**Recalcular a reserva** quando mudar o modelo de Pesquisa ou a tabela de preços (`agents/ledger.ts`): `reserva >= 6 × maximumCallCostUsdCents(modelo, bound, maxTokens)`. Se a Muse passar para a camada Standard o custo máximo sobe e a reserva precisaria de cerca de 24 centavos.

## Ordem de abertura

1. Migrações do fluxo 0 (`0130` a `0133`: conta grátis, estado do handoff, Biblioteca por marca e o preenchimento das marcas antigas) aplicadas em produção. Este ticket não cria migração.
2. Chaves no Render: `ANTHROPIC_API_KEY`, `META_MODEL_API_KEY`, `FIRECRAWL_API_KEY`, `APIFY_TOKEN`; provedores `firecrawl` e `apify`.
3. `EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS=10`.
4. Dados antigos apagados (tarefa operacional separada, com confirmação do dono: o app não foi lançado, não há migração nem convivência).
5. `EQUIPE_ENABLED=true` e `EQUIPE_PILOT_WORKSPACES=<UUIDs do piloto>`. Abrir `/` no workspace e conferir: a conversa abre com a mesa e o cartão da fonte.
6. Só então ampliar a lista. `*` somente depois do ticket 11.

**Desligar:** `EQUIPE_ENABLED=false` (ou esvaziar a lista) devolve a home e a barra de antes. As contas grátis ficam preservadas.

## O que o produto diz sobre tempo

O texto de abertura **não promete tempo** ("uns 3 minutos" saiu): o tempo até o diagnóstico não foi medido com os fornecedores reais, e a maior parte dele é a geração do diagnóstico (até 240 s por chamada) e os passos de confirmação da pessoa. A medição possível sem ensaio pago (leitores falsos mais os tempos do ensaio de 30/09) está nas notas de implementação do ticket 09. Para recolocar uma promessa é preciso um ensaio pago autorizado, medindo cada etapa (leitura do site, visão, Instagram, diagnóstico) com as chaves reais.

## Validação no piloto: diagnóstico só com Instagram

O diagnóstico foi desenhado para fonte única, mas só o **site** tem a qualidade avaliada; o caso "só Instagram" (a pessoa sem site) **continua em avaliação no piloto** e não deve ser tratado como validado. Para avaliar:

- Os documentos gerados só a partir do Instagram são os de `equipe_brand_documents` (`kind = 'diagnosis'`) com `content->'meta'->'inputSources' = '["instagram"]'`.
- Para cada um, conferir a mesma lista do ticket 08: toda afirmação tem trecho literal da bio ou das legendas; de 1 a 3 oportunidades, sem enchimento; o que faltou (por exemplo "Site (não informado)") está em "Não encontrado"; nenhum concorrente; nada inventado.
- Registrar o veredito por conta (útil, vazio demais, inventou algo) antes de ampliar a lista do piloto. Documento marcado `insufficient` é o comportamento esperado quando a bio e as legendas têm pouco texto, e não conta como falha.

