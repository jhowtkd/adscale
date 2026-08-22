# Editor nativo de camadas para Creative Work

**Data:** 2026-08-21

**Status:** aprovado para plano de implementação

**Escopo:** Creative Work / Peça aprovada / Layerize
**Referência visual:** editor full-screen em overlay, com canvas central e painel de camadas à direita

## Resumo

O ADScale já separa uma Peça aprovada em camadas raster privadas, mede a fidelidade da recomposição e entrega PSD/ZIP. A experiência atual termina em botões de download. Este design transforma o resultado do Layerize em um documento editável dentro do próprio fluxo de Resultados.

A V1 oferece composição essencial: visibilidade, ordem, nome, posição, tamanho, undo/redo de sessão, autosave, exportação e publicação como nova versão da Peça. Também permite regenerar uma única camada por IA, mantendo todas as demais camadas inalteradas por construção.

O editor é aberto em um overlay full-screen sobre o Trabalho atual. Não cria página, destino de navegação, gerador paralelo nem dependência de canvas. Todos os membros autorizados podem usar a função quando o workspace possui o entitlement da V1; cota é exigida somente antes de operações com provedor externo.

Este design reabre somente o item “editor de camadas no produto” que estava fora do escopo original de `#227`. As decisões de segurança, armazenamento privado, idempotência, ausência de fallback, separação de gates e imutabilidade do original continuam válidas.

## Decisões aprovadas

- Experiência: editor completo de composição, não somente inspeção.
- Ferramentas: visibilidade, ordem, nome, mover, redimensionar, undo/redo, salvar e exportar.
- Regeneração: substituir somente a camada selecionada por um asset RGBA isolado.
- Acesso: todos os membros de um workspace com entitlement ativo.
- Cobrança V1: sem débito de créditos; uso protegido por cota configurável por workspace.
- Persistência: um rascunho atual por versão da Peça, com fonte imutável e restauração.
- Concorrência: um editor por vez; demais membros ficam em leitura até o lease expirar.
- Publicação: cria nova versão da Peça e exige nova aprovação.
- Candidata de IA: uma candidata por chamada, pré-visualizada antes de aceitar.
- Dispositivos: edição completa em desktop e tablet; celular em inspeção/exportação.
- Layout: overlay full-screen dentro de Resultados.
- Provedor de regeneração: asset RGBA isolado; nenhuma edição do composto por máscara e nenhum relayerize automático.

## Objetivos

1. Permitir que um membro ajuste a composição retornada pelo Layerize sem sair do ADScale.
2. Preservar a Peça aprovada, as camadas originais e todas as versões publicadas.
3. Tornar a edição colaborativamente segura sem implementar coedição em tempo real.
4. Regenerar uma camada sem alterar os bytes das outras camadas.
5. Publicar o resultado como nova versão dentro do versionamento e da aprovação existentes.
6. Controlar gasto externo mesmo sem debitar créditos do usuário.
7. Manter chaves privadas, URLs do provedor e metadados operacionais fora do browser.

## Fora de escopo

- Coedição em tempo real, cursores compartilhados ou merge de mudanças.
- Histórico nomeado ou comparação de rascunhos.
- Rotação, opacidade, blend modes, duplicação ou exclusão de camadas.
- Texto vetorial/editável, fontes, máscaras, recorte, pintura ou efeitos.
- Edição completa em celular.
- Figma, Canva ou outro formato nativo além de PSD e PNG.
- Provider routing, fallback automático ou regeneração com outro modelo.
- Cobrança em créditos, settlement financeiro ou reembolso monetário na V1.
- Retry automático de chamadas potencialmente faturadas.
- Deploy, liberação geral, smoke paga ou mudança de segredo como consequência automática da implementação.

## Experiência do usuário

### Entrada

Uma Peça concluída e aprovada exibe uma das ações:

- `Separar em camadas`, quando ainda não existe Layerize concluído;
- `Editar camadas`, quando existe um documento editável ou Layerize concluído;
- estado de fila/processamento/reconciliação, enquanto a separação está ativa;
- erro tipado, quando a operação falhou;
- reconciliação bloqueada, quando a submissão pode ter sido faturada e não pode ser repetida automaticamente.

Antes de Layerize ou regeneração, o produto mostra a cota restante e pede confirmação. A confirmação não apresenta preço em créditos; informa que a operação usa processamento externo e consome uma unidade da cota do workspace.

### Overlay

O editor abre sobre Resultados e preserva o contexto ao fundo. O cabeçalho contém:

- voltar/fechar;
- nome, formato e número de camadas;
- estado de autosave;
- undo/redo;
- restaurar original;
- exportar;
- criar nova versão.

O corpo contém:

- barra estreita de seleção, movimento e redimensionamento;
- canvas central com checkerboard, zoom e bounding box da camada selecionada;
- painel direito rolável com miniatura, nome, dimensões, ordem e visibilidade;
- painel de regeneração contextual da camada selecionada.

### Ferramentas

A V1 permite:

- selecionar pelo canvas ou painel;
- ligar/desligar camada;
- arrastar para reordenar;
- renomear inline, de 1 a 128 caracteres;
- mover dentro do canvas;
- redimensionar pelos handles ou teclado;
- zoom no canvas sem alterar o documento;
- undo/redo dos últimos 50 comandos da sessão;
- restaurar uma camada ao estado-fonte daquela versão;
- restaurar todas as camadas ao estado-fonte daquela versão.

O documento mantém de 2 a 17 camadas. A V1 não cria nem remove camadas.

`order` é uma permutação contígua de `0..n-1`; `0` é a camada mais à frente e aparece no topo do painel. Restaurar a ordem de uma camada a reinsere no índice-fonte e desloca as camadas intermediárias. Posição e dimensões são pixels inteiros, dimensões são positivas e o bounding box inteiro permanece dentro do canvas.

### Dispositivos

- Desktop: edição completa com mouse e teclado.
- Tablet: edição completa com Pointer Events e controles touch de pelo menos 44 px.
- Celular: lista, visibilidade temporária de inspeção, zoom, visualização de candidata existente, download/exportação da revisão salva e status.

Alterações de visibilidade em celular são apenas de inspeção e não entram no autosave. Celular não inicia Layerize/regeneração, não aceita ou descarta candidata, não publica e não persiste qualquer mutação.

## Modelo de domínio

### Estados separados

Cada `creative_work_output` mantém contratos distintos:

1. `layerization`: fonte Layerize imutável e evidência operacional existente.
2. `layerEditor`: rascunho editável e estado da operação de regeneração.
3. `outputKey`: PNG publicado e imutável daquela versão.

O editor nunca modifica `layerization.layers`, `layerization.psdKey`, o `outputKey` atual nem artefatos de versões anteriores.

### `layerEditor` JSONB

Adicionar um campo JSONB nullable a `creative_work_outputs`. O contrato persistido possui:

```ts
type LayerEditorStateV1 = {
  schemaVersion: 1;
  revision: number;
  sourceLayerizationAttemptId: string;
  canvas: { width: number; height: number };
  layers: Array<{
    id: string;
    source: {
      order: number;
      name: string;
      visible: boolean;
      x: number;
      y: number;
      width: number;
      height: number;
      key: string;
    };
    order: number;
    name: string;
    visible: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    currentKey: string;
    currentKind: "source" | "regenerated";
    restorableKey: string | null;
  }>;
  lease: null | {
    id: string;
    userId: string;
    acquiredAt: string;
    expiresAt: string;
  };
  regeneration: null | {
    id: string;
    status:
      | "reserved"
      | "processing"
      | "submission_unknown"
      | "ready"
      | "failed";
    layerId: string;
    instruction: string;
    requestedByUserId: string;
    usageKey: string;
    candidateKey: string | null;
    providerRequestId: string | null;
    failureCode: string | null;
    createdAt: string;
    updatedAt: string;
  };
  publishedPsdKey: string | null;
  updatedAt: string;
};
```

`source.key`, `currentKey`, `restorableKey`, `candidateKey`, `publishedPsdKey` e metadados do provedor nunca entram no DTO público. Os demais campos de `source` e URLs assinadas de source/current entram no DTO porque são necessários para a restauração local segura.

### Inicialização

No primeiro `openLayerEditor` em modo `edit` — ou em `inspect` quando o documento ainda não existe:

1. validar workspace, Trabalho, Peça concluída e Layerize concluído;
2. criar ids aleatórios estáveis para as camadas;
3. copiar canvas, nomes, ordem, bounding boxes e chaves para `layerEditor`;
4. copiar todos os campos imutáveis de origem para `source`, definir `source.key === currentKey`, `currentKind = source` e `restorableKey = null`;
5. em `edit`, adquirir o lease no mesmo compare-and-set; em `inspect`, manter `lease = null`.

Repetir o comando devolve o documento existente; não cria outro rascunho. O modo `inspect` devolve o mesmo DTO seguro sem adquirir lease.

### Publicação e rebase

`Criar nova versão` cria uma filha concluída, `isSelected = false`, com `parentOutputId` apontando para a versão editada e próximo `versionNumber` do mesmo formato/direção.

O `layerEditor` copiado para a filha é rebased:

- cada `currentKey` aceito torna-se `source.key` da filha;
- posição, tamanho, nome, ordem e visibilidade atuais substituem o snapshot `source` da filha;
- `currentKind` volta para `source`;
- `restorableKey` volta para `null`;
- `lease` e `regeneration` voltam para `null`;
- `revision` volta para `1`;
- `publishedPsdKey` aponta para o PSD imutável da nova versão.

Assim, restaurar a filha retorna ao estado publicado da própria filha, não ao Layerize inicial.

## Componentes de interface

### `LayerEditorDialog`

Responsável por foco, portal, cabeçalho, responsividade e modo leitura. Reutiliza o primitive `Dialog` existente com dimensões full-screen, preservando focus trap e retorno ao gatilho.

### `LayerCanvas`

Renderiza uma `<img>` por camada em posicionamento absoluto. Usa CSS transforms, Pointer Events e handlers de teclado nativos. Não adiciona Konva, Fabric, Pixi ou outra biblioteca de canvas.

O canvas recebe somente URLs assinadas e metadados públicos. Reordenação altera z-order local; visibilidade altera renderização local; posição/tamanho persistem como pixels do canvas-fonte.

### `LayerPanel`

Lista, seleciona, renomeia, reordena e liga/desliga camadas. Além de drag, oferece controles de mover para frente/trás operáveis por teclado. Miniaturas são URLs assinadas das mesmas fontes privadas. O item selecionado é compartilhado com `LayerCanvas`.

### `LayerRegenerationPanel`

Coleta instrução, mostra cota, confirmação, progresso, erro e candidata. Só permite uma regeneração ativa/candidata por documento.

### `useLayerEditor`

Carrega o DTO, mantém seleção e undo/redo locais, aplica comandos locais, faz autosave após 750 ms sem nova mudança, renova lease e invalida a query enquanto regeneração está ativa.

## API e comandos

Preservar a superfície canônica de Creative Work. Estender `PATCH /api/creative-work/[id]` com ações estritamente tipadas:

- `openLayerEditor`;
- `heartbeatLayerEditor`;
- `saveLayerEditor`;
- `releaseLayerEditor`;
- `regenerateLayer`;
- `acceptLayerCandidate`;
- `discardLayerCandidate`;
- `publishLayerEditor`.

Cada ação recebe `outputId`; `openLayerEditor` recebe `mode: "inspect" | "edit"`. Heartbeat/release exigem `leaseId`. Save, aceite, descarte e publicação exigem `leaseId + expectedRevision`. Regeneração também exige esses dois campos. `regenerateLayer` e `publishLayerEditor` exigem ainda um `operationId` UUID criado pelo cliente e reutilizado em todo replay da mesma intenção.

Na regeneração, `operationId` torna-se `regeneration.id` e chave de idempotência da claim. Na publicação, ele forma o `operationKey = layer-editor-publish:<operationId>` da filha, aproveitando a unicidade já existente em Creative Work. Um replay devolve a mesma operação/filha somente quando pai e revisão coincidem; reutilizar a chave com outro comando é conflito.

O GET de detalhe continua sendo a fonte dos estados resumidos. Abrir o editor usa o comando `openLayerEditor`, que devolve o DTO completo e URLs assinadas; o GET comum não carrega miniaturas nem documento completo.

Estender o download existente de Peça com formatos escopados:

- `layer`, exigindo `layerId`;
- `layer-candidate`;
- `draft-png`;
- `draft-psd`;
- `psd` publicado.

O ZIP diagnóstico permanece owner/ops-only e oculto para membros comuns; ele não é necessário para operar o editor.

Não criar árvore de API top-level, endpoint de provider ou rota pública de storage.

## Acesso e projeção pública

Todos os comandos chamam `requireWorkspaceAccess`. Toda consulta usa simultaneamente `workspaceId`, `workItemId` e `outputId`; `layerId` é resolvido somente dentro do documento encontrado.

Remover o requisito de Dono da plataforma das ações de Layerize e dos artefatos de produto necessários ao editor, substituindo-o por:

- workspace membership;
- entitlement `layer_editor_v1` ativo;
- elegibilidade da Peça.

Cota disponível é requisito apenas para iniciar Layerize ou regeneração. Cota esgotada não bloqueia inspeção, edição local do rascunho salvo, exportação ou publicação sem nova chamada externa.

O DTO público de Layerize/editor inclui somente:

- status;
- canvas;
- ids públicos de camada;
- nome, ordem, visibilidade e bounding box;
- contagem;
- URLs assinadas de curta duração;
- estado seguro de cota, lease, candidata e falha.

Ele exclui:

- storage keys;
- callback token/hash;
- endpoint e resposta do provedor;
- URLs temporárias do provedor;
- segredos;
- metadados de billing ou logs.

## Lease e concorrência

O lease dura 90 segundos e é renovado a cada 30 segundos enquanto a aba está ativa.

- Primeiro editor elegível adquire o lease por compare-and-set.
- Mesmo `leaseId` pode renovar somente `lease.expiresAt`, sem incrementar a revisão do documento.
- Heartbeat pode devolver URLs assinadas renovadas na projeção, mas persiste somente a nova expiração do lease.
- Outro usuário recebe modo leitura e identidade de exibição do editor atual.
- O servidor nunca devolve email ou identificador técnico do editor atual.
- Após expiração, outro membro pode adquirir um novo lease.
- `releaseLayerEditor` é best effort; expiração é o mecanismo de correção.
- Save com lease inválido ou `expectedRevision` obsoleto retorna `409` com DTO atualizado.
- O cliente não faz last-write-wins nem merge automático.
- Ao perder o lease, o editor preserva o undo local apenas para copiar valores, entra em leitura e oferece recarregar.

## Autosave, undo e restauração

O cliente agrupa cada gesto completo em um comando de undo. Movimento contínuo não cria um passo por pixel. Undo/redo mantém no máximo 50 passos e existe apenas durante a sessão.

Autosave persiste o snapshot completo validado do documento. O servidor:

1. valida Zod estrito;
2. confirma lease e revisão;
3. garante ids e chaves de camada idênticos ao estado persistido;
4. aceita somente nome, ordem, visibilidade, bounding box e `useSource` booleano;
5. incrementa `revision` em um;
6. devolve o documento canônico.

O browser não pode escolher storage keys ou inserir/remover camadas. Ao salvar `useSource = true`, o servidor move a chave regenerada atual para `restorableKey` e ativa `source.key`; saves seguintes já na origem preservam essa alternativa. Ao desfazer na mesma sessão com `useSource = false`, o servidor só pode reativar a própria `restorableKey`; saves seguintes já na regenerada não fazem nova troca. Aceitar outra candidata limpa essa alternativa. Assim, restore/undo atravessa autosave sem criar histórico persistente de rascunhos.

Restaurar camada repõe imagem, nome, visibilidade, posição, tamanho e ordem daquela camada ao estado-fonte da versão. Restaurar documento repõe todas as camadas ao estado-fonte. Ambas entram no undo/redo e são reversíveis durante a sessão mesmo depois do autosave. Após recarregar, não há histórico persistente; o usuário pode restaurar novamente a fonte.

## Cotas sem débito de créditos

### Configuração

Reutilizar `workspace_entitlements` com `kind = layer_editor_v1`. O metadata validado exige:

```ts
{
  layerizeMonthlyLimit: number;
  regenerationMonthlyLimit: number;
}
```

O período é o mês civil em UTC. Entitlement ausente, inativo, expirado ou com metadata inválido deixa Layerize/regeneração desabilitados, nunca ilimitados.

O entitlement e seus limites são provisionados pela operação interna já existente. A V1 não adiciona tela de configuração de cota para o cliente.

### Contagem

Reutilizar `usage_events` com tipos:

- `layerize_v1`;
- `layer_regeneration_v1`.

Uma função transacional específica:

1. adquire advisory lock por `workspaceId + type + YYYY-MM`;
2. verifica idempotency key;
3. soma `amount` do período;
4. bloqueia se o limite foi atingido;
5. insere `amount = 1` antes do dispatch.

Falha comprovadamente anterior ao provedor insere no mesmo tipo um release idempotente com `amount = -1` e `metadata.operation = "release"`. Resultado inválido, falha terminal do provedor, timeout ambíguo, descarte ou rejeição humana não liberam cota porque a chamada externa ocorreu ou pode ter ocorrido.

Abrir um editor existente ou concluído não consome cota. Layerize só faz claim para uma nova tentativa real de provider; regeneração usa o `operationId` como `regeneration.id` e idempotency key. Replay do mesmo comando devolve seu estado sem nova unidade.

O rate limiter existente bloqueia rajadas, mas não é a fonte de verdade da cota.

## Regeneração isolada

### Contrato

A operação substitui uma única camada raster. As demais camadas mantêm os mesmos `currentKey` e metadados. A garantia vem do compare-and-set do documento, não da precisão do modelo.

### Provedor

V1 usa `gpt-image-2` fixo, o SDK OpenAI já instalado e a chave server-only existente. Não há fallback ou provider routing.

A documentação oficial consultada em 2026-08-21 informa que:

- o Image API aceita edição de imagens;
- `gpt-image-2` processa todos os inputs automaticamente em alta fidelidade e exige omitir `input_fidelity`;
- background transparente está disponível em preview;
- máscaras são orientação e podem não seguir a forma com precisão total.

Fonte: [OpenAI Image generation guide](https://developers.openai.com/api/docs/guides/image-generation).

Revalidar essas capacidades antes da implementação e antes de qualquer smoke paga. Mudança na documentação não autoriza substituição silenciosa do modelo.

### Entrada

O job recebe somente ids e chaves duráveis. Ele carrega:

1. PNG RGBA atual da camada selecionada;
2. recomposição achatada do rascunho salvo, apenas como contexto;
3. instrução do usuário;
4. canvas e bounding box originais.

A chamada pede uma única imagem, qualidade `medium`, PNG e background transparente. O prompt exige somente o elemento revisado, sem fundo, moldura, texto adicional ou composição completa.

Não usar máscara para prometer isolamento. Não enviar camadas não selecionadas separadamente.

### Normalização

Ao receber o PNG:

1. validar MIME e magic bytes;
2. aplicar limites de bytes e pixels;
3. exigir canal alpha;
4. rejeitar alpha totalmente vazio;
5. remover padding transparente;
6. encaixar proporcionalmente dentro do bounding box original;
7. centralizar no mesmo bounding box;
8. armazenar em chave privada determinística da operação;
9. confirmar por compare-and-set que a operação ainda é a ativa;
10. marcar candidata como `ready`.

O encaixe nunca estica de forma não proporcional e nunca muda automaticamente o bounding box do documento. Conclusão tardia de uma operação substituída não pode publicar nem sobrescrever candidata mais nova.

### Aceite e descarte

- `Aceitar`: valida lease/revisão/candidata, copia o asset para chave imutável da revisão, altera somente `currentKey/currentKind/restorableKey` da camada, limpa candidata e incrementa revisão.
- `Descartar`: limpa candidata sem alterar camadas; a cota permanece consumida.
- Nova regeneração só pode começar após aceitar ou descartar a anterior.

Aceite e descarte removem o asset temporário em best effort depois do commit. Uma regra de lifecycle do prefixo temporário elimina candidatas órfãs; assets aceitos e publicados ficam fora desse prefixo.

### Ambiguidade

SDK retries ficam em zero. Timeout depois de possível submissão marca `submission_unknown`, mantém rascunho e cota, e bloqueia retry automático. Uma nova tentativa exige ação explícita, nova confirmação e nova unidade de cota.

## Exportação e publicação

### Exportar rascunho

O servidor recompõe a revisão salva, não o estado ainda não salvo do browser.

- PNG: somente camadas visíveis, recortado ao canvas.
- PSD: todas as camadas, preservando nome, ordem, posição, tamanho e visibilidade.

Artefatos são materializados sob chave privada determinística por `outputId + revision` e devolvidos por URL assinada. URLs assinadas nunca são persistidas.

### Criar nova versão

O comando é permitido somente quando:

- lease pertence ao chamador;
- revisão esperada é atual;
- não existe regeneração ativa ou candidata pendente;
- todas as chaves privadas existem;
- o documento recompõe dentro dos limites;
- PNG e PSD foram escritos com sucesso.

Depois dos artefatos, uma transação:

1. adquire o advisory lock de versionamento já usado em Creative Work;
2. calcula o próximo `versionNumber` do mesmo formato/direção;
3. insere uma saída concluída, filha da atual e não selecionada;
4. grava `operationKey = layer-editor-publish:<operationId>`, `outputKey`, PSD e `layerEditor` rebased;
5. não seleciona nem aprova automaticamente.

Falha antes ou dentro da transação não cria versão visível. Artefatos privados sem linha associada podem ser sobrescritos com segurança pelo replay idempotente do mesmo comando.

## Falhas e mensagens

| Código | Comportamento |
|---|---|
| `layer_editor_not_available` | Entitlement/configuração ausente; editor não inicia operação paga. |
| `layer_editor_quota_exhausted` | Mostra limite e início do próximo mês UTC. |
| `layer_editor_locked` | Abre leitura e mostra editor atual + expiração aproximada. |
| `layer_editor_revision_conflict` | Retorna `409`, entra em leitura e oferece recarregar. |
| `layer_regeneration_dispatch_failed` | Libera reserva se comprovadamente pré-provedor. |
| `layer_regeneration_provider_failed` | Mantém camada atual; retry explícito usa nova cota. |
| `layer_regeneration_invalid_asset` | Mantém camada atual; cota consumida. |
| `layer_regeneration_submission_unknown` | Mantém camada atual e bloqueia retry automático. |
| `layer_editor_artifact_missing` | Bloqueia exportação/publicação; não altera versão. |
| `layer_editor_publish_conflict` | Mantém overlay e retorna estado atualizado. |

Mudanças de status usam uma live region. Após conclusão ou erro, foco volta ao painel de regeneração/publicação correspondente. Nenhuma mensagem depende apenas de cor.

## Segurança e privacidade

- Workspace scope obrigatório em toda consulta e mutação.
- Entitlement e cota validados no servidor.
- Chaves privadas nunca aceitas do cliente.
- URLs assinadas curtas e response-only.
- Sem provider URL ou resposta persistida no DTO.
- Limites de request, nome, pixels, dimensões e bytes.
- PNG validado por MIME e magic bytes.
- Prompt limitado e tratado como dado do usuário; nunca interpolado em logs completos.
- Provider request id pode ser persistido para suporte, mas não é público.
- Metadata de `usage_events` inclui ids internos e usuário solicitante, nunca prompt, URL assinada ou imagem.
- Prefixos temporários de candidata têm lifecycle definido no storage; chaves aceitas/publicadas não expiram por essa regra.
- Assets de cliente só podem ser liberados após revisão aplicável dos contratos/retention dos provedores. Até lá, testes externos usam material sintético ou próprio.

## Estratégia de testes

### Contratos e funções puras

- parse/rejeição de todas as variantes de `layerEditor`;
- projeção pública sem storage keys/provider data;
- comandos não podem trocar ids/chaves ou adicionar/remover camada;
- reorder, visibilidade, rename e bounding box;
- alpha ausente/vazio, magic bytes, limites e trim;
- contain proporcional dentro do bounding box;
- rebase de documento publicado;
- PSD/PNG compartilham a mesma composição.

### Repositório e concorrência

- dois opens concorrentes produzem um lease;
- heartbeat do dono e rejeição de outro lease;
- takeover somente após expiração;
- save com revisão obsoleta retorna conflito;
- duas claims de cota no limite produzem uma vencedora;
- idempotency replay não consome duas unidades;
- release pré-provedor é idempotente;
- publicação concorrente cria uma versão;
- replay de publicação devolve a mesma filha e não incrementa versão;
- rollback em cada falha composta preserva outputs anteriores.

### Provider fake

- recebe camada + composto na ordem esperada;
- uma chamada e zero retries;
- background transparente e qualidade medium;
- PNG válido vira candidata;
- falta de alpha, alpha vazio, payload grande e erro do provedor nunca alteram camada;
- timeout ambíguo vira `submission_unknown`.
- conclusão tardia não substitui candidata de uma operação mais nova.

### Jornada HTTP

Uma jornada autenticada com provider fake e storage controlado prova:

1. membro abre documento e adquire lease;
2. outro membro abre em leitura;
3. primeiro move, redimensiona, renomeia, reordena e salva;
4. regeneração reserva cota e produz candidata;
5. candidata sobrepõe somente a camada escolhida;
6. aceite muda somente a chave daquela camada;
7. publicação cria filha não selecionada;
8. aprovação existente seleciona a filha;
9. hashes do original e das outras camadas permanecem iguais;
10. PSD e PNG privados abrem e correspondem.

### Componentes e acessibilidade

- diálogo devolve foco ao botão de origem;
- focus trap e escape respeitam estado pendente;
- canvas operável por teclado;
- touch targets de 44 px no tablet;
- lista e canvas mantêm seleção sincronizada;
- live region anuncia save, quota, job, candidata e falha;
- conflito move foco para alerta;
- celular não persiste transforms.

### Browser visual

Playwright cobre desktop e tablet com screenshots e interação real:

- overlay full-screen;
- canvas útil e painel rolável;
- seleção e handles;
- layer visibility/reorder;
- candidata antes de aplicar;
- modo leitura por lease;
- cota esgotada;
- erro e `submission_unknown`;
- publicação e retorno a Resultados.

## Critérios de aceite

1. Reabrir reproduz exatamente a revisão salva.
2. Um segundo membro não sobrescreve o editor ativo.
3. Takeover só ocorre após expiração do lease.
4. Regeneração aceita muda somente `currentKey/currentKind/restorableKey` da camada selecionada.
5. Descartar candidata não altera nenhuma camada.
6. Cota não é ultrapassada por concorrência ou replay.
7. PNG e PSD exportados representam a mesma revisão.
8. Publicação cria nova versão não selecionada e exige aprovação.
9. Original, fonte Layerize e versões anteriores mantêm hashes.
10. Browser não recebe storage keys, provider endpoint, token ou segredo.
11. Desktop e tablet editam; celular permanece seguro em leitura.
12. Todas as falhas mantêm o último rascunho salvo.

## Gates de entrega

Relatar separadamente:

1. validação local e testes focados;
2. suíte ampla, registrando falhas não relacionadas sem escondê-las;
3. `graphify update .` após implementação;
4. browser visual autenticado em desktop e tablet;
5. deploy/health;
6. smoke autenticado da aplicação sem inferência paga, quando possível;
7. uma smoke paga de regeneração com asset próprio, uma chamada, zero retries e teto explicitamente autorizado;
8. custo efetivamente observado, não preço de catálogo;
9. inspeção humana de isolamento, bordas, posicionamento, PSD e aprovação da nova versão;
10. liberação para workspaces reais somente após revisão de provider/retention e definição das cotas.

Implementação aprovada não autoriza paid smoke, deploy, mudança de segredo, ativação de entitlement ou liberação geral.

## Impacto esperado em arquivos

O plano de implementação deve buscar o menor conjunto compatível com estes limites:

- contrato/migration do JSONB em `creative_work_outputs`;
- repositório/application services de editor, cota, regeneração e publicação;
- extensão dos adapters HTTP existentes de Creative Work e download;
- job pesado de regeneração registrado nas topologias web/worker existentes;
- componentes e hook do editor;
- traduções pt-BR/en;
- testes focados, jornada e browser visual;
- atualização do runbook Layerize/editor.

Não adicionar pacote de canvas, nova árvore de API, nova página de dashboard, provider router ou histórico de rascunhos.
