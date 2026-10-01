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
| `EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS` | **`10`** | Reserva do 1º diagnóstico dentro do teto. Medida no ticket 08 e confirmada no teste real (ticket 12): um diagnóstico liquida em 1 centavo, são até 6 tentativas por leitura (1 automática de 2 tentativas + 2 pedidos de "Tentar de novo"), ou seja 6 centavos no pior caso, mais 4 de folga para pequenas mudanças de preço. **Sem a variável vale 10, em todos os lugares** (antes do ticket 13 eram dois padrões: o teto inteiro no ledger e 10 na checagem do saldo, D-7). Mesmo assim, defina explicitamente em produção |
| `EQUIPE_FREE_STRATEGIST_MAX_TOKENS` | `2048` (padrão) | Saída máxima de cada resposta do Estrategista grátis |

Os modelos (`EQUIPE_MODEL_STRATEGIST`, `EQUIPE_MODEL_RESEARCH`, `EQUIPE_MODEL_REVIEWER`) e o esforço por papel têm padrão no código; só mexa se a tabela de preços do ledger mudar.

**Recalcular a reserva** quando mudar o modelo de Pesquisa, a tabela de preços (`agents/ledger.ts`) ou o limite de saída do diagnóstico: `reserva >= 6 × maximumCallCostUsdCents(modelo, bound, maxTokens)`. Se a Muse passar para a camada Standard, o máximo de uma tentativa sobe para cerca de 12 centavos (entrada de 20 a 28 mil tokens, 20.000 de saída) e as 6 tentativas pedem cerca de 72: isso não cabe com folga no teto de US$ 1, então a conta e o desenho do teto precisam ser refeitos antes de trocar de camada. (A conta antiga de "cerca de 24 centavos" não fechava.)

## O teto de US$ 1 na prática (ledger)

- **Cada chamada reserva o máximo antes de rodar e liquida pelo uso real, arredondado para cima ao centavo** (D-6). Uma chamada que custa 0,17 centavo conta 1 centavo no teto, e a reserva de admissão é de 7 a 9 vezes o custo real da visão (12 e 17 centavos contra 1,3 e 2,3). **Decisão: fica assim**, sem mudar o formato do ledger. No fluxo 0 com a visão funcionando isso é folga; quem sente é o chat e a correção da fonte, que exigem saldo de reserva + máximo da leitura (27 a 30 centavos) mesmo quando o gasto real é de uns 3. Mudar isso é decisão de produto e de formato do ledger, fora do ticket 13.
- **Chamada que o provedor recusa sem ter rodado devolve a reserva por ZERO** (D-2). Só com prova de que nada rodou: falta de chave ou schema não suportado (a chamada nem sai), 401/403/404/413 de qualquer provedor, e 400/422 **somente** da Anthropic e **somente** quando a mensagem abre com o caminho de um parâmetro da requisição (`output_config.format.schema: …`). O resto (408/409/429/5xx, sem status, abortada, 400/422 da Meta ou da OpenAI, bloqueio de conteúdo, "prompt muito longo", falta de crédito) mantém o máximo reservado. Cada conta pode ter **no máximo 5 devoluções por zero** na vida; passando disso o máximo fica e o evento diz `give_back_limit`.
- **O que aparece quando uma chamada é recusada:** o evento `agent.model_call_rejected` e uma linha de log, só com campos estruturados (status, tipo do erro, código, `request-id`, caminho do parâmetro, motivo de um vocabulário fixo e o nome do schema), nunca com o texto do provedor.
- **Reservas que ficaram no máximo ANTES dessa correção continuam contando** (o reconciliador de órfãs só preenche `settled_at` e mantém o custo no máximo). Não há migração: os dados antigos são apagados antes do lançamento (passo 4 da ordem de abertura).
- **Diagnóstico que não cabe no crédito** (D-12): a falha `budget_exceeded` é final. O card diz que o crédito grátis acabou e oferece "Falar com uma pessoa" (o mesmo pedido de plano do card do plano, aceito nesse estado mesmo sem diagnóstico gravado); a conversa responde sem modelo, com o card do plano uma vez.

## Teto de saída do diagnóstico

`DIAGNOSIS_MAX_TOKENS` passou de 16.000 para **20.000** tokens (D-14): no teste real um diagnóstico usou 14.850 de 16.000 (93%), e um site maior poderia ser cortado (`model_truncated`, nova tentativa, nova cobrança). O raciocínio da Muse conta como saída (6.900 a 14.400 tokens por diagnóstico). A 20.000 sobra 35% sobre o pior caso medido, o pior tempo estimado (20.000 a ~95 tokens/s, cerca de 210 s) cabe no `DIAGNOSIS_TIMEOUT_MS` de 240 s, e o máximo de uma tentativa continua em 1 centavo, então a reserva de 10 centavos não muda.

**O teste real pago precisa conferir que a Muse aceita 20.000 tokens de saída** (só 16.000 foi exercitado até hoje). Se o provedor recusar, o diagnóstico falha em todas as tentativas (provavelmente como `provider_error`, com o "Tentar de novo" no card): nesse caso volte a 16.000 e abra uma correção. Conferir também o tempo do diagnóstico (antes: 77 a 156 s).

## Ordem de abertura

1. Migrações do fluxo 0 (`0130` a `0133`: conta grátis, estado do handoff, Biblioteca por marca e o preenchimento das marcas antigas) aplicadas em produção. Este ticket não cria migração.
2. Chaves no Render: `ANTHROPIC_API_KEY`, `META_MODEL_API_KEY`, `FIRECRAWL_API_KEY`, `APIFY_TOKEN`; provedores `firecrawl` e `apify`.
3. `EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS=10`.
4. Dados antigos apagados (tarefa operacional separada, com confirmação do dono: o app não foi lançado, não há migração nem convivência).
5. `EQUIPE_ENABLED=true` e `EQUIPE_PILOT_WORKSPACES=<UUIDs do piloto>`. Abrir `/` no workspace e conferir: a conversa abre com a mesa e o cartão da fonte.
6. Só então ampliar a lista. `*` somente depois do ticket 11.

**Desligar:** `EQUIPE_ENABLED=false` (ou esvaziar a lista) devolve a home e a barra de antes. As contas grátis ficam preservadas.

## O que o produto diz sobre tempo

A abertura do Estrategista diz **"Leva de 3 a 5 minutos."** (en: "It takes 3 to 5 minutes."), decisão do dono em 01/10/2026 com base no teste real: a máquina leva 139 a 200 s do clique ao diagnóstico (leitura do site 30 a 50 s, mais 46 s se houver Instagram depois do site, diagnóstico 77 a 156 s) e a pessoa leva mais 1 a 2 minutos lendo e confirmando os 4 cards. "Uns 3 minutos" valia só para a máquina. A faixa é uma só, escrita em dois lugares que os testes mantêm iguais (`lib/equipe/handoff-copy.ts`, que é o que a conversa guarda, e `assistant.handoff.introText` nas mensagens, que é o que a tela mostra). O aviso de que dá para sair e que a pessoa será avisada continua na linha "Montando o diagnóstico…".

O número cai com a correção do D-4 (a leitura do Instagram deixa de esperar 10,8 s pelo custo) e se o esforço da Pesquisa baixar (`EQUIPE_EFFORT_RESEARCH`, ainda não medido). **Reavaliar a faixa** no teste real depois das correções do ticket 13.

## Validação no piloto: diagnóstico só com Instagram

O diagnóstico foi desenhado para fonte única, mas só o **site** tem a qualidade avaliada; o caso "só Instagram" (a pessoa sem site) **continua em avaliação no piloto** e não deve ser tratado como validado. Para avaliar:

- Os documentos gerados só a partir do Instagram são os de `equipe_brand_documents` (`kind = 'diagnosis'`) com `content->'meta'->'inputSources' = '["instagram"]'`.
- Para cada um, conferir a mesma lista do ticket 08: toda afirmação tem trecho literal da bio ou das legendas; de 1 a 3 oportunidades, sem enchimento; o que faltou (por exemplo "Site (não informado)") está em "Não encontrado"; nenhum concorrente; nada inventado.
- Registrar o veredito por conta (útil, vazio demais, inventou algo) antes de ampliar a lista do piloto. Documento marcado `insufficient` é o comportamento esperado quando a bio e as legendas têm pouco texto, e não conta como falha.

## Rodar o fluxo 0 localmente

**Sem fornecedores (leitores de mentira).** O roteiro `app/scripts/pilot-states.ts` e o passo a passo em `docs/design/verification/fluxo0-09/README.md` levam cada passo do handoff e do diagnóstico direto para um banco `_test`, sem Inngest, leitor nem modelo.

**Com fornecedores reais (Firecrawl, Apify, Anthropic, Meta).** Três fatos do ambiente local que não são óbvios (D-13):

1. **A leitura das cores (visão) só aceita imagens por URL `https` pública** (`normalizedImagePart`, em `agents/free-budget.ts`). Precisa de armazenamento real, o R2 de desenvolvimento: o armazenamento local (`e2e-storage://`) não serve, e a visão simplesmente não roda.
2. **`E2E_CONTROLLED_PROVIDER=true` faz duas coisas juntas:** força o armazenamento local e, junto com `INNGEST_BASE_URL`, põe o cliente do Inngest em modo dev (`inngest-runtime.ts`). Ele é a única forma de o build de produção falar com o `inngest dev`, que não assina as chamadas. Por isso ele e a visão são excludentes. **Com o flag desligado** (para usar o R2) o app valida a assinatura e o `inngest dev` responde 401 a toda chamada ("No x-inngest-signature provided"): o evento chega, **nenhuma leitura roda e nada aparece como erro**.
3. **A saída é o `inngest start`**, que assina, com um par de chaves descartáveis (hex, nunca `local`: o build de produção recusa) igual nos dois lados:

```bash
cd app
export INNGEST_EVENT_KEY=$(openssl rand -hex 16) INNGEST_SIGNING_KEY=$(openssl rand -hex 32)
npx inngest-cli@latest start --event-key "$INNGEST_EVENT_KEY" --signing-key "$INNGEST_SIGNING_KEY" \
  --sdk-url http://127.0.0.1:3000/api/inngest --poll-interval 5
# em outro terminal, o app (build de produção) com o mesmo par, SEM E2E_CONTROLLED_PROVIDER:
INNGEST_BASE_URL=http://127.0.0.1:8288 EQUIPE_ENABLED=true EQUIPE_PILOT_WORKSPACES='*' \
  SITE_READER_PROVIDER=firecrawl INSTAGRAM_READER_PROVIDER=apify npx next start -p 3000
```

Mais o que o app precisa: `FIRECRAWL_API_KEY`, `APIFY_TOKEN`, `ANTHROPIC_API_KEY`, `META_MODEL_API_KEY` e as cinco `R2_*` (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`) do bucket de **desenvolvimento**. Passe as chaves só pelo ambiente do processo (por um script que lê um arquivo fora do repositório e faz `spawn`), nunca em argumentos, arquivo do repositório ou log.

- **Banco:** um banco só para a rodada, migrado (`DATABASE_URL=… node scripts/migrate-with-retry.mjs`). O fuso do Postgres não importa mais (D-3: a hora das mensagens vem do relógio do app); se algo ainda parecer atrasado, `ALTER DATABASE <banco> SET timezone TO 'UTC'` e reinicie o app.
- **Disco:** o build de produção precisa de cerca de 3 GB livres (`.next/cache/webpack` chega a 2,2 GB: apague depois do build). Sem espaço o build falha com ENOSPC.
- **R2:** os objetos do teste ficam em `workspaces/<workspace do teste>/`. Liste o bucket antes e depois e apague só as chaves que o teste criou.
- **Custo de uma rodada de 3 marcas:** cerca de US$ 0,08 em modelos, 2 créditos do Firecrawl e US$ 0,005 no Apify.
- **Se a visão falhar,** o motivo está no evento `agent.model_call_rejected` e no log do servidor (campos estruturados, sem texto do provedor), e as cores aparecem como "não encontrado", não como falha da leitura.
