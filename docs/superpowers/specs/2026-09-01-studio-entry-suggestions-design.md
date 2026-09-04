# Design: Entrevista inteligente na entrada do Estúdio

> **Data:** 2026-09-01
>
> **Status:** Aguardando revisão do documento
>
> **Escopo:** Primeira tela do Estúdio progressivo — campo “O que você quer criar?”, chips de lacuna e redação do pedido
>
> **Abordagem:** Lacunas determinísticas a partir da marca ativa + últimos Trabalhos dessa marca; LLM só redige a frase; template se a redação falhar
>
> **Decisor:** Jhonatan Soares
>
> **Precedência:** Estende [Estúdio progressivo (2026-08-30)](2026-08-30-progressive-studio-flow-design.md) na seção de entrada. Não cria roteador silencioso de Protocolo, persistência paralela nem recomendador de inspirações.

## 1. Resumo

A pessoa não encara um textarea vazio. Uma entrevista curta pergunta só o que ainda falta. As respostas, juntas com o que a marca e os Trabalhos dela já sustentam, **escrevem** o pedido no campo. Ela edita o texto se quiser e segue o fluxo progressivo.

O sucesso não é preencher o campo. É concluir o primeiro Trabalho (preparou o plano / gerou a peça).

## 2. Problema

No Estúdio progressivo o bloco inicial pede texto ou anexo e só depois o tipo de criação. O composer clássico tem placeholder; o textarea progressivo não. Inspirações são visuais e ficam abaixo. Chips de direção existem só em Variações, depois que o Trabalho já começou.

Quem não sabe o que escrever trava. Chips fixos pioram: perguntam o que a marca já tem, ignoram o anexo e não entram no pedido — informação perdida.

## 3. Objetivos

1. Destravar a primeira tela sem segundo formulário: chips escrevem o pedido.
2. Perguntar só lacunas. Fato já conhecido entra no pedido sem chip.
3. Manter o tipo de criação explícito: chip quando o histórico não tem protocolo único; confirmação pré-marcada no passo seguinte quando o histórico tem.
4. Não inventar oferta, preço, benefício nem público.
5. Não bloquear texto livre nem anexo se o contexto ou a redação falharem.
6. Medir conclusão do primeiro Trabalho, não o preenchimento do campo.

## 4. Não objetivos

- Composer clássico (`rolloutVariant === "control"`), assistente, direções de Variações.
- Inferir Protocolo em silêncio, sem chip nem confirmação pré-marcada.
- Mem0, histórico de outras marcas ou do workspace inteiro.
- Novo mural ou recomendador de inspirações.
- Persistência própria da entrevista (chips não viram tabela).
- Alterar prepare, settlement, cotação ou geração.

## 5. Superfície e modelo mental

Vive só na primeira tela do Estúdio progressivo — o bloco “O que você quer criar?” acima da escolha de tipo. A faixa Continuar, Nova campanha, seletor de marca e anexo permanecem.

O textarea continua sendo o pedido. Chips não são um formulário paralelo: são a entrevista que o preenche. Anexo tem o mesmo peso de sempre. Referência visual não sustenta fato de campanha.

No máximo **3 chips** por vez, nesta prioridade:

1. `protocol` — tipo de criação, só se os últimos Trabalhos desta marca não tiverem um protocolo único.
2. `offer` — produto/oferta (um slot só).
3. `audience` — público.
4. `tone` — tom, só se ainda houver vaga.

Marca sem Trabalhos: fallback fixo `protocol` + `offer` + `audience`, com catálogo genérico (seção 8).

### 5.1 Tipo de criação e o passo seguinte

O tipo nunca é escolhido em silêncio.

- Histórico com protocolo único → sem chip de tipo. O passo **Escolha o tipo** aparece com essa opção já sugerida; a pessoa confirma ou troca.
- Chip de tipo respondido nesta tela → o chip guarda a resposta **sem** chamar `selectIntent`. A chamada acontece quando a pessoa avança, e o passo seguinte não pergunta de novo.
- Protocolos mistos ou nenhum Trabalho → chip de tipo na primeira tela, opções só as que existem no histórico (ou o catálogo completo no fallback).

Duas restrições vêm da entrada progressiva atual, onde o bloco de texto só existe enquanto `objectiveSelected` é falso e as tool cards aparecem assim que `hasEntry` fica verdadeiro:

- `selectIntent` desmonta o textarea. Chamá-lo no clique do chip encerra a entrevista antes de a frase existir — daí o chip de tipo apenas registrar a resposta.
- Escrever o pedido torna `hasEntry` verdadeiro e revela as tool cards. Enquanto houver chip de tipo pendente, o bloco de objetivos fica oculto; a escolha de tipo não aparece duas vezes na mesma tela.

“Sugerida” é estado próprio, não pressionado: a card diz que a sugestão vem do histórico e mantém `aria-pressed="false"` até o acionamento. `composer.intent` continua nulo antes de `selectIntent`.

Carrossel entra nas opções do chip somente quando a criação de carrossel está habilitada no workspace, a mesma regra das tool cards. Com o gate desligado, `carousel` também não sai como `facts.protocol` nem como candidato: o histórico é lido, mas esse valor vira lacuna em vez de sugerir uma card desabilitada. `social_post` existe em `tool_kind` e não é `ComposerIntent`; sai da leitura.

## 6. Arquitetura

Três unidades. Pedido e Protocolo continuam no composer (`setRequest`, `selectIntent`). Não há agregado novo.

### 6.1 Contexto de entrada (servidor)

`GET /api/creative-work/entry-context?clientProfileId=`

Autenticado, escopo do workspace, só a marca ativa. Recusa `clientProfileId` de outra marca do workspace.

Lê, no máximo, os **8** Trabalhos mais recentes dessa marca (origens `creative_work` e `campaign` que tenham `clientProfileId` correspondente e protocolo ou briefing preenchido). Junta o kit da marca (tom, produto/descrição quando existirem).

Resposta:

```text
{
  facts: {
    protocol: "single" | "variations" | "format_adaptation" | "restyle" | "carousel" | null,
    offer: string | null,
    audience: string | null,
    tone: string | null
  },
  protocolCandidates: string[],
  offerCandidates: string[],
  audienceCandidates: string[],
  toneCandidates: string[],
  workCount: number
}
```

`protocol` usa os mesmos ids de `ComposerIntent`. `null` em um fato significa “sem consenso”, não “pergunte sempre”. A lista canônica da home **não** ganha briefing; esse GET é o único lugar que projeta esses campos para a entrada.

### 6.1.1 Origem de cada fato

As duas origens não guardam briefing do mesmo jeito, e a diferença muda o rendimento real da janela:

| Fato | `campaign` | `creative_work` |
| --- | --- | --- |
| `protocol` | não se aplica | `toolKind` |
| `offer` | coluna `offer`, com `product` como candidato secundário | `inferredBriefing.offer` ou `brief.offer` |
| `audience` | coluna `audience` | `inferredBriefing.audience` |
| `tone` | coluna `tone` | `inferredBriefing.tone` |

Campanha tem colunas de briefing; Trabalho só tem `inferredBriefing` depois que um prepare rodou. Marca cujos Trabalhos nunca chegaram ao plano cai no catálogo genérico mesmo com `workCount` alto — comportamento correto, não bug.

Campo de `inferredBriefing` só vale como fato quando `state === "sourced"`, ou quando é `inferred` com `confidence === "high"`. `unknown`, `low` e `medium` viram candidato de chip, nunca fato. Sem essa regra a entrada infere sobre inferência: uma oferta que o prepare adivinhou num Trabalho antigo voltaria como fato sustentado da marca, exatamente o que o objetivo 4 proíbe. `briefingOverrides` — edição explícita do operador — tem precedência sobre o valor inferido.

### 6.1.2 Consulta

Nenhum repositório filtra por marca hoje: `listCreativeWorks(workspaceId, limit)` e `CampaignListQuery` recortam só o workspace. Este GET exige filtro por `clientProfileId` com limite nas duas origens; ler a lista do workspace inteiro para filtrar em memória contradiz o teto de 8 desta seção. A projeção canônica de summary não carrega briefing (só o detalhe carrega), então a leitura é de repositório, não de `listCanonicalWorks`.

### 6.2 Detector de lacunas (função pura)

Entrada: fatos + candidatos do GET, texto atual do campo, presença de anexo, `carouselEnabled`.

Saída: 0 a 3 chips `{ slot, options[] }`. Sem I/O.

Regras:

- Anexo sozinho não fecha `offer`, `audience` nem `tone`.
- Texto livre que já cobre um slot (ex.: “para dentistas”) fecha esse chip.
- Opções de um chip = candidatos do histórico/kit. Catálogo genérico de `offer`/`audience` quando esses candidatos estão vazios; catálogo completo de `protocol` só quando `workCount === 0`.
- Troca de marca descarta fatos e chips anteriores; o cliente chama o GET de novo.

### 6.3 Redator do pedido (servidor)

`POST /api/creative-work/entry-request`

Corpo: fatos sustentados, respostas dos chips, locale. Só isso. Sem histórico bruto, sem anexo como fato, sem memória de workspace.

Esse corpo vem do cliente e não é evidência de marca: as strings têm teto de tamanho, `locale` é validado contra os locales suportados e nada disso é persistido como fato. A frase volta para o textarea do próprio operador — é pedido, não conhecimento da marca.

Escreve **uma frase** no idioma do locale, pronta para o textarea. Proibido inventar oferta, preço, benefício, público ou tom ausentes. Slot desconhecido é omitido, não preenchido com genérico de campanha.

Cada mudança de chip dispara uma chamada de modelo na primeira tela, antes de existir Trabalho. Por isso: debounce, uma chamada em voo por vez (a nova cancela a anterior), teto por workspace e sem retry automático. A redação não debita créditos nem entra na cotação; é custo de plataforma na entrada, limitado por esse teto.

Timeout ou erro: o cliente aplica o template da seção 9 na hora. Se a frase chegar depois e o usuário **não** tiver editado o campo desde esse POST, substitui o template. Se tiver editado, descarta a frase.

## 7. Consenso do histórico

Janela: até 8 Trabalhos da marca ativa, mais recentes primeiro.

| Slot | Conhecido (`facts.*` preenchido) | Chip |
| --- | --- | --- |
| `protocol` | `workCount >= 1` e todos na janela compartilham o mesmo protocolo | se mistos: opções = protocolos distintos da janela; se `workCount === 0`: catálogo genérico |
| `offer` | o mesmo valor não vazio na **maioria** dos Trabalhos da janela que têm produto ou oferta (ou um único valor no kit) | se valores divergem: opções = esses valores; se nenhum valor: opções do catálogo genérico de `offer` (categorias, não fato da marca) |
| `audience` | mesma regra da maioria | idem, com catálogo genérico de `audience` quando não há candidatos |
| `tone` | kit.toneOfVoice / toneNotes **ou** maioria nos Trabalhos | candidatos do kit/histórico; se vazio, omite o chip em vez de inventar tom; só entra se ainda houver vaga entre os 3 chips |

“Maioria” = mais da metade dos Trabalhos da janela que têm aquele campo não vazio. Empate ou valores únicos espalhados → sem consenso, candidatos viram opções.

Um único Trabalho basta para protocolo conhecido. Zero Trabalhos → seção 8.

## 8. Fallback de marca nova

`workCount === 0`. Sempre os três chips, nesta ordem:

| Slot | Opções (pt-BR; chaves i18n no en) |
| --- | --- |
| `protocol` | Peça única, Variações, Adaptar formatos, Mudar estilo, e Carrossel se habilitado |
| `offer` | Lançamento, Captação, Turma/imersão, Promoção |
| `audience` | Quem ainda não conhece, Quem já comprou, Empresas / times |

Essas opções são categorias, não fatos da marca. Não entram no briefing inferido como oferta real até a pessoa seguir e o prepare projetar o pedido.

GET de contexto falho usa **este mesmo fallback**, para a tela não ficar em branco sem chips.

## 9. Template de pedido

Usado na primeira pintura quando já há fatos e a redação ainda não voltou, e em qualquer falha do POST.

Padrão, omitindo partes `null`:

```text
{protocolLabel}{offer? " de " + offer}{audience? " para " + audience}{tone? ", tom " + tone}.
```

Exemplos:

- Fatos Cenbrap, sem lacuna de tipo: `Peça única de imersão NR-1, tom institucional.`
- Só fallback, chips ainda vazios: o campo permanece vazio até o primeiro chip; não inventar “campanha incrível”.

Sem lacunas, o template (depois a frase do redator) **preenche o campo mesmo assim**. A tela não volta ao branco.

## 10. Sincronização chips ↔ textarea

| Evento | Efeito |
| --- | --- |
| GET chegou | detector pinta chips; se há fatos, dispara redação (template imediato) |
| Chip mudou | reescreve o pedido (template + POST) |
| Pessoa digitando | cancela POST em voo; o texto dela manda; detector só esconde chip do slot que o texto já cobriu |
| Pedido gerado e depois editado à mão | permanece até ela mudar um chip |
| Troca de marca | zera chips e o pedido desta entrevista; novo GET |
| Anexo adicionado/removido | não reescreve o texto; não fecha fatos |

A entrevista não é obrigatória. Texto ou anexo sozinhos seguem o fluxo progressivo. Chips existem para não deixar a tela muda quando a pessoa não escreve.

## 11. Dados e autorização

Contexto autorizado para **gerar** a peça não muda: pedido do operador (o texto que ficou no campo), marca ativa, fontes ligadas ao Trabalho.

Exceção deliberada só na **entrada**: últimos 8 Trabalhos da marca ativa alimentam lacunas e candidatos. Esse recorte não entra no prompt de geração a menos que o material esteja ligado ao Trabalho.

O texto que permanece no textarea, depois de gerado ou editado, **é** o pedido do operador. Não fica marcado como fato de marca.

## 12. Instrumentação

Reusa `studioSessionId` e a lista permitida do Estúdio progressivo. Eventos UI-only novos:

- `studio_entry_chips_shown` — propriedades: `workCount`, `slots`, `usedFallback`
- `studio_entry_chip_selected` — `slot`
- `studio_entry_request_written` — `requestSource`: `template` \| `model`
- `studio_entry_request_preserved` — redação descartada porque a pessoa editou

“Reusa a lista permitida” não basta. A validação de propriedades é `z.strictObject` sobre `ALLOWED_PROPERTY_KEYS`: chave fora da lista faz o evento **inteiro** falhar como `validation_error`, não é descartada em silêncio. Esta entrega estende as duas listas em `app/src/server/beta-analytics/types.ts`:

- `STUDIO_BETA_EVENT_KEYS` com os quatro eventos acima;
- `ALLOWED_PROPERTY_KEYS` com `workCount`, `slots`, `usedFallback`, `slot` e `requestSource`.

`slots` é uma string curta e determinística (os slots visíveis unidos por vírgula), porque o payload aceita só escalares. `requestSource` evita ambiguidade com `sourceRole`, que já significa papel de material. `studio_entry_started` continua carregando `inputMode`; a entrevista acrescenta o valor `interview` quando o pedido nasceu de chips.

Não entram no funil canônico. Métrica de sucesso: taxa de primeiro Trabalho que chega a prepare confirmado / geração iniciada, comparada ao controle da seção 18.

## 13. Tratamento de erro

| Falha | Comportamento |
| --- | --- |
| GET 4xx/5xx ou timeout | fallback de marca nova; textarea e anexo livres |
| Sem marca ativa | sem chips; copy já existente de selecionar marca |
| POST timeout/erro | template; sem retry obrigatório |
| Marca trocada no meio do POST | resposta ignorada |
| Kit ausente com Trabalhos existentes | fatos só do histórico; tom pode ser lacuna |

## 14. Testes

**Detector (unitário, sem rede)**

- `workCount === 0` → 3 chips genéricos.
- Histórico só de `single` → sem chip `protocol`.
- Protocolos mistos → chip `protocol` com exatamente esses valores.
- Texto contendo público → some chip `audience`.
- Anexo sozinho → não fecha `offer`.
- Máximo 3 chips; `tone` só se houver vaga.
- Troca de marca não reutiliza fatos anteriores (teste do hook/orquestração).
- `social_post` no histórico não vira opção de tipo.
- Gate de carrossel desligado → `carousel` não aparece como fato nem como opção.
- `inferredBriefing` com `state === "inferred"` e `confidence` média ou baixa → candidato de chip, não fato.

**Redator**

- Fixture: `offer`/`audience`/`tone` nulos não aparecem na frase como valores inventados.
- Corpo do POST não inclui lista bruta de Trabalhos.
- Timeout → cliente aplica template; frase tardia substitui só se o campo não foi editado.

**Entrada progressiva**

- Chips visíveis sem esperar o POST.
- GET falho → fallback + campo editável.
- Chip `protocol` pendente → bloco de objetivos não renderiza.
- Chip `protocol` respondido → não chama `selectIntent` antes de a pessoa avançar, e o passo de tipo não pergunta de novo.
- Protocolo conhecido → tool card correspondente aparece como sugerida, com `aria-pressed="false"` até o acionamento.
- Digitar durante o POST preserva o texto e cancela a substituição.
- Os quatro eventos novos atravessam `sanitizeBetaEventProperties` sem `validation_error`.

Fora desta malha: E2E de geração, composer clássico, assistente.

## 15. Impacto no Estúdio progressivo

Substitui, só na entrada:

- o textarea sem ajuda;
- a leitura de “objetivo só depois da primeira entrada” quando `protocol` é lacuna — o chip na primeira tela **é** a escolha explícita.

Não substitui prepare, plano, resultados, retomada, campanha nem o mural/gaveta de referências.

## 16. Unidades e dependências

| Unidade | Faz | Usa | Não faz |
| --- | --- | --- | --- |
| `entry-context` GET | projeta fatos e candidatos | kit + últimos 8 Trabalhos da marca | redação, persistência |
| `detectEntryGaps` | escolhe até 3 chips | fatos, texto, anexo, flag de carrossel | I/O, copy longo |
| `entry-request` POST | uma frase | fatos + chips + locale | escolher Protocolo, ler Mem0 |
| UI no `DashboardHomeActions` progressivo | pinta chips, chama `setRequest` / `selectIntent` | os três acima, composer atual | novo aggregate |

Arquivos prováveis (orientação, não checklist de implementação): `app/src/server/creative-work/entry-context.ts`, `app/src/lib/studio/detect-entry-gaps.ts`, rota irmã de `/api/creative-work`, trecho progressivo de `DashboardHomeActions.tsx`.

## 17. Acessibilidade

- Chips são botões reais, com `aria-pressed` refletindo a resposta e rótulo que nomeia o slot.
- Reescrita programática do textarea é anunciada pelo `aria-live` que o bloco de entrada já tem. Sem anúncio, quem usa leitor de tela não percebe que o campo mudou sozinho.
- A reescrita nunca rouba foco nem move o cursor: campo com foco descarta a substituição, a mesma regra da seção 10.
- Chips e textarea são operáveis por teclado na ordem visual; nenhum chip depende de hover.
- Em mobile os até 3 chips quebram em linha, sem scroll horizontal como única saída.

## 18. Rollout e medição

O Estúdio progressivo já está em 100% em produção, então não existe braço de controle sobrando. Duas saídas:

1. novo percentual determinístico por workspace, reusando o mesmo bucket do Estúdio;
2. antes/depois com baseline congelado.

Esta entrega propõe a primeira, começando em zero, para haver controle concorrente dentro do progressivo. O baseline congelado fica como referência secundária. Denominador mínimo por braço antes de avançar: 30 sessões elegíveis e 20 gerações confirmadas — os mesmos números do estágio de 10% do Estúdio progressivo.

Rollback imediato se a entrevista derrubar conclusão em mais de cinco pontos percentuais, aumentar abandono antes da geração em mais de cinco pontos, ou se a redação virar erro visível na entrada.

## 19. Riscos aceitos

- **Campo escrito sem ação humana.** Assim que o GET traz fatos, o template preenche o textarea e `hasEntry` revela os objetivos. A pessoa pode avançar sobre um pedido que não leu. Mitigação: frase curta e editável, tipo sempre confirmado, e `studio_entry_request_written` para separar conclusão com pedido escrito à mão de conclusão com pedido herdado.
- **Categoria confundida com fato.** As opções genéricas da seção 8 são categorias, entram no texto do pedido e o prepare pode promovê-las a briefing. Risco aceito: o texto é editável e o prepare continua sendo a única autoridade de briefing.
- **Custo antes de existir Trabalho.** Redigir na entrada gasta modelo em sessões que nunca geram. Contido por debounce, chamada única em voo e teto por workspace.
- **Janela de 8 Trabalhos.** Marca com histórico heterogêneo cai em “sem consenso” com frequência e a entrevista fica parecida com o fallback. Aceito: perguntar é melhor que afirmar.
