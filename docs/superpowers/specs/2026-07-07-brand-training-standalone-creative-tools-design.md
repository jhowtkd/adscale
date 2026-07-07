# Brand Training e trabalhos criativos independentes

**Data:** 2026-07-07

**Status:** aprovado para planejamento

**Escopo inicial:** Brand Training reutilizável + Quick Tool “Criar post”

## 1. Objetivo

Transformar o Brand Training em uma fonte independente e reutilizável da identidade de cada marca. Quick Tools, anúncios, campanhas e futuros agentes podem consultar essa identidade, mas o treinamento não depende de nenhum desses consumidores.

A primeira função consumidora será a Quick Tool “Criar post”. Ela gera três propostas visuais sem criar uma campanha técnica, sem poluir o histórico de campanhas e sem acoplar futuras Quick Tools ao modelo de campanha atual.

“Treinar” não significa ajustar um modelo fundacional. Significa estruturar materiais, regras e referências visuais, submetê-los à validação humana e disponibilizar somente a versão aprovada para geração.

## 2. Princípios aprovados

- O Brand Training pertence ao perfil da marca (`clientProfileId`), não a uma campanha.
- A dependência é unilateral: consumidores leem a identidade; não são requisitos para mantê-la.
- O uso da identidade é opcional fora do Brand Training.
- Materiais só entram em produção após aprovação humana.
- Assets literais, referências visuais e regras extraídas têm comportamentos distintos.
- Trabalhos de Quick Tools são entidades próprias e nunca criam campanhas invisíveis.
- A V1 reutiliza armazenamento, geração, cobrança e validação existentes, sem duplicar bibliotecas.
- Nenhum resultado é publicado automaticamente.

## 3. Arquitetura

### 3.1 Identidade treinada

Fonte estável da identidade visual de um perfil de marca. Reúne:

- Brand Kit existente: cores, fontes, tom, elementos obrigatórios e proibidos;
- arquivos persistidos em `workspaceAssets`;
- vínculo do arquivo com a marca por meio de `clientReferences`;
- categoria, comportamento, análise visual e estado de aprovação;
- memória aprendida como contexto auxiliar, nunca como fonte operacional de verdade.

### 3.2 Trabalho criativo

Entidade genérica e independente de campanha. Contém:

- workspace e perfil da marca;
- tipo da ferramenta, inicialmente `social_post`;
- briefing curto;
- formato escolhido;
- copy gerada e confirmada;
- snapshot dos assets e regras confirmados;
- estado do processamento;
- três saídas independentes.

O núcleo deve admitir novos tipos, como carrossel e story, sem exigir alteração no Brand Training. Não será criada uma interface abstrata ou registro de plugins na V1; `toolKind` apenas discrimina os fluxos realmente existentes.

### 3.3 Gerador compartilhado

O processamento reutiliza as funções existentes de prompt, geração de imagem, armazenamento, créditos e validação de qualidade. Ele recebe um trabalho criativo confirmado e produz três variações com o mesmo conteúdo, formato e conjunto de assets:

- `conservative`;
- `balanced`;
- `bold`.

Somente a ousadia visual varia. Estratégia, oferta, copy, formato, regras e assets permanecem iguais.

### 3.4 Campanhas

Campanhas continuam sendo um fluxo separado. A identidade treinada será compatível com três comportamentos futuros na interface de campanha:

- usar a identidade;
- adaptar à identidade;
- não usar a identidade.

A criação dessa nova escolha explícita em campanhas não faz parte da V1. O comportamento atual de campanhas não será alterado durante esta entrega.

## 4. Modelo de dados

### 4.1 Assets treinados

Não será criada uma segunda biblioteca. `workspaceAssets` continua armazenando o arquivo e seus metadados gerais. `clientReferences` continua vinculando o asset ao perfil da marca e será ampliado para representar treinamento.

Campos conceituais adicionais no vínculo treinado:

- `trainingCategory`: `logo | graphic | character | visual_reference`;
- `usageMode`: `exact | reference | rule`;
- `analysis`: JSON com descrição visual, atributos extraídos e recomendações;
- `reviewStatus`: `pending_analysis | pending_approval | approved | archived`;
- `reviewedAt` e `reviewedByUserId` para auditoria da aprovação.

Referências antigas continuam válidas. Registros sem esses campos são referências legadas e não são tratados como assets treinados até serem revisados.

### 4.2 Trabalhos e saídas

Serão necessárias duas estruturas persistentes:

**Trabalho criativo**

- identificadores de workspace e perfil;
- `toolKind`;
- `status`: `draft | ready | generating | partial | completed | failed`;
- briefing estruturado;
- formato;
- copy confirmada;
- snapshot da identidade selecionada;
- timestamps e usuário criador.

**Saída criativa**

- vínculo com o trabalho;
- nível criativo;
- `status`: `queued | processing | completed | failed`;
- chave do arquivo gerado;
- custo;
- diagnóstico de falha e metadados de qualidade.

Uma restrição única por trabalho e nível criativo impede resultados duplicados durante retries.

O snapshot registra as versões efetivamente usadas: asset key, categoria, comportamento, análise aprovada e regras. Mudanças posteriores no Brand Training não alteram trabalhos antigos.

## 5. Fluxo do Brand Training

1. O usuário abre o Brand Training e escolhe um perfil de marca.
2. Envia um ou mais arquivos como logo, grafismo, personagem ou referência visual.
3. O arquivo é validado e persistido na biblioteca existente.
4. A IA propõe categoria, comportamento, descrição, atributos e regras.
5. O item fica em `pending_approval`.
6. O usuário revisa, corrige e aprova ou arquiva.
7. Somente itens `approved` ficam disponíveis para consumidores.

Cada item aprovado apresenta de forma explícita:

- o que é;
- como deve ser usado;
- quais propriedades são relevantes;
- o que não pode ser alterado;
- quem aprovou e quando.

Quick Tools e campanhas não alteram esses dados. No futuro, um resultado aprovado poderá ser sugerido para inclusão, mas a inclusão sempre exigirá confirmação humana.

## 6. Comportamentos dos assets

### 6.1 Aplicar exatamente (`exact`)

O sistema preserva o arquivo e o compõe de forma determinística depois da geração. O modelo de imagem não recebe a responsabilidade de redesenhar logo, grafismo ou personagem oficial.

Na V1, esse modo exige PNG ou WebP com transparência, ou SVG válido. Arquivos sem transparência ou incompatíveis podem ser cadastrados, mas devem usar `reference` até existir um recorte apropriado. A interface deve explicar essa limitação antes da aprovação.

### 6.2 Usar como referência (`reference`)

O arquivo orienta fotografia, composição, ilustração ou estilo. Ele é contexto auxiliar e não substitui copy, formato ou restrições explícitas.

### 6.3 Extrair como regra (`rule`)

Os atributos aprovados são convertidos em instruções obrigatórias: paleta, tipografia, proporções, restrições e padrões recorrentes. O arquivo pode continuar armazenado como evidência da regra.

## 7. Quick Tool “Criar post”

### 7.1 Etapa 1 — Marca e briefing

O usuário seleciona a marca e informa:

- tema;
- objetivo;
- público;
- oferta ou informação principal;
- formato: `1:1`, `4:5` ou `9:16`.

Um trabalho usa somente um formato por geração.

### 7.2 Etapa 2 — Copy

A IA cria a copy com base no briefing e na voz aprovada da marca. O usuário pode editar antes de continuar. A copy confirmada entra no snapshot do trabalho.

### 7.3 Etapa 3 — Assets

A IA recomenda um conjunto pequeno de assets aprovados e mostra o motivo e o comportamento de cada um. O usuário confirma, remove ou troca os itens antes de qualquer geração de imagem.

Assets não aprovados nunca são recomendados nem aceitos no snapshot.

### 7.4 Etapa 4 — Propostas

Após a confirmação e a apresentação do custo, o sistema cria as três saídas. A interface mostra as propostas lado a lado, de forma neutra, identificadas como conservadora, equilibrada e ousada.

O usuário pode selecionar uma proposta, salvá-la na biblioteca e baixá-la. Selecionar uma proposta não publica nem cria campanha.

## 8. Fluxo de processamento

1. Validar workspace, perfil, briefing, formato e propriedade dos assets.
2. Confirmar que todos os assets do snapshot estão aprovados.
3. Calcular e apresentar o custo antes da geração.
4. Persistir o snapshot imutável.
5. Criar exatamente uma saída por nível criativo.
6. Gerar cada base visual com regras e referências aprovadas.
7. Aplicar assets `exact` por composição determinística.
8. Executar validações de formato, presença dos assets exatos e qualidade mínima.
9. Persistir cada saída concluída no armazenamento e no registro do trabalho.
10. Registrar somente a proposta escolhida em `workspaceAssets` quando o usuário mandar salvá-la.
11. Marcar o trabalho como `completed` ou `partial` conforme os resultados.

## 9. Erros, retries e cobrança

- Falha em uma saída não invalida as outras duas.
- Retry atua somente sobre a saída falha e respeita a restrição de idempotência.
- O trabalho permanece salvo e retomável.
- Créditos são cobrados somente pelas gerações realmente iniciadas, conforme o contrato de billing existente.
- Uma tentativa não pode cobrar novamente nem criar uma segunda saída para o mesmo nível.
- Falhas de validação anteriores à geração não consomem créditos.
- Se um asset `exact` não puder ser composto com segurança, essa saída falha de forma explícita; o sistema não o converte silenciosamente em referência.
- Mensagens de erro indicam a etapa falha e a ação possível: corrigir entrada, trocar asset ou repetir saída.

## 10. Segurança e isolamento

- Toda leitura e escrita é delimitada por `workspaceId` e `clientProfileId`.
- O servidor valida a propriedade de cada asset; IDs fornecidos pelo cliente não são confiáveis.
- Um perfil nunca consulta identidade, referências ou memória de outro perfil.
- Uploads preservam validação de tipo permitido, tamanho e magic bytes existente.
- SVGs usados em composição devem passar por sanitização antes de renderização.
- Estados de aprovação e snapshots são definidos no servidor.

## 11. Critérios de aceite

- É possível treinar e manter uma marca sem criar Quick Tool ou campanha.
- Existem somente quatro categorias na V1: logo, grafismo, personagem e referência visual.
- Existem somente três comportamentos: exato, referência e regra.
- A análise da IA nunca publica um item sem aprovação humana.
- Quick Tool cria trabalho independente e nenhum registro de campanha.
- O usuário escolhe marca, briefing e um formato.
- A copy é gerada e editável antes da geração visual.
- Assets são recomendados, exibidos e confirmados antes da cobrança.
- Três propostas compartilham o mesmo snapshot e variam somente em ousadia visual.
- Assets exatos permanecem visualmente inalterados.
- Uma falha parcial pode ser repetida sem duplicar saída ou cobrança.
- A proposta escolhida pode ser salva e baixada, sem publicação automática.

## 12. Estratégia de testes

### Unidade

- transições válidas de estado;
- seleção apenas de assets aprovados;
- criação do snapshot;
- idempotência por trabalho e nível;
- decisão entre composição exata, referência e regra;
- cálculo do estado agregado `partial` e `completed`.

### Integração

- isolamento por workspace e perfil;
- upload, análise, aprovação e listagem;
- criação de trabalho sem campanha;
- cobrança e retry parcial;
- persistência das três saídas;
- bloqueio de asset arquivado ou pertencente a outra marca.

### Ponta a ponta

Executar o caminho principal:

1. treinar e aprovar materiais;
2. abrir “Criar post”;
3. escolher marca, briefing e formato;
4. revisar copy;
5. confirmar assets recomendados;
6. gerar três propostas;
7. selecionar, salvar e baixar uma saída;
8. confirmar que nenhuma campanha foi criada.

### Fidelidade visual

Uma fixture determinística deve comparar a região composta com o resultado esperado para a mesma escala, comprovando que assets `exact` preservam conteúdo, proporção e cor sem redesenho generativo. As três propostas também devem preservar copy, formato e conjunto de assets.

## 13. Fora do escopo da V1

- carrossel e outras Quick Tools;
- editor visual livre;
- publicação em redes sociais;
- categorias criadas pelo usuário;
- aprendizado automático a partir de resultados;
- aprovação automática de análises;
- múltiplos formatos no mesmo trabalho;
- nova interface de identidade dentro de campanhas;
- migração geral do pipeline atual de campanhas para trabalhos criativos.

## 14. Sequência recomendada

1. Evoluir o vínculo de referências para representar treinamento aprovado.
2. Finalizar o fluxo independente do Brand Training.
3. Introduzir trabalhos criativos e saídas independentes de campanha.
4. Integrar o gerador e a composição determinística.
5. Construir a Quick Tool “Criar post”.
6. Fechar billing, retries, qualidade e teste ponta a ponta.
