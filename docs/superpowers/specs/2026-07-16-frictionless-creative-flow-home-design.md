# Design: Home operacional e fluxo criativo sem fricção

> **Data:** 2026-07-16
> **Status:** Aprovado no brainstorming
> **Escopo:** Home, navegação, contexto de marca e jornada de criação
> **Abordagem:** Convergência enxuta sobre o trabalho criativo canônico existente
> **Decisor:** Jhonatan Soares

---

## 1. Objetivo

Reduzir a jornada entre uma intenção criativa e o início da geração ao contrato:

```text
um pedido + uma confirmação de geração
```

O usuário pode começar pelo campo livre, por um card de ferramenta ou por uma inspiração. As três entradas alimentam o mesmo trabalho criativo canônico. Marca, cliente, nome, copy e referências não voltam a ser solicitados durante o fluxo.

Esta especificação itera sobre a convergência aprovada no [ADR 0013](../../adr/0013-trabalho-criativo-first.md). Nos pontos em que houver conflito de UX, ela substitui as decisões da [simplificação de interface de 2026-07-02](2026-07-02-ui-simplification-design.md), em especial:

- “Trabalhos” substitui “Campanhas” como conceito principal de navegação;
- a geração exibe uma confirmação única com quantidade e créditos;
- chat e campanha deixam de ser pré-requisitos para iniciar uma criação;
- Quick Tools passam a ser presets de entrada, não jornadas independentes.

## 2. Evidência no produto atual

O fluxo atual repete decisões em superfícies diferentes:

- a home abre um seletor de intenção antes de encaminhar o usuário;
- `NewCampaignModal` solicita nome, perfil e cliente;
- o workspace pode voltar a solicitar vínculo de perfil quando a campanha não ficou associada a um `clientProfileId`;
- `CreatePostWizard` possui quatro telas: briefing, copy, referências e propostas;
- a marca é selecionada dentro do wizard, mesmo quando o usuário trabalha repetidamente para o mesmo cliente;
- as três propostas exigem ações de seleção/salvamento que não fazem parte da intenção criativa.

O repositório já possui os elementos que evitam uma nova arquitetura:

- projeção e lista canônica de campanhas e `creative_work_items`;
- geração, retry, cobrança e pós-processamento canônicos;
- Brand Kit e Brand Training delimitados por `clientProfileId`;
- upload e análise de imagens;
- templates, biblioteca e resultados aprovados;
- persistência local do shell via Zustand.

## 3. Princípios obrigatórios

1. Um comportamento de negócio continua com uma implementação canônica.
2. Campo livre, cards e inspirações são adapters do mesmo compositor.
3. A marca ativa reduz repetição, mas nunca altera um trabalho existente.
4. Configuração de marca melhora qualidade; sua ausência não bloqueia a primeira geração.
5. Toda ação que consome créditos mostra uma confirmação explícita e única.
6. Trabalho pronto já está salvo; seleção não é requisito de persistência.
7. Resultado parcial é resultado: uma saída com falha não bloqueia as demais.
8. Campanha é agrupamento opcional, não requisito técnico.
9. Não criar pipeline, persistência ou wizard paralelo.

## 4. Arquitetura da informação

### 4.1 Sidebar

A navegação do usuário final fica limitada a:

```text
ADScale
[Marca ativa]

Início
Trabalhos
Biblioteca

Marca
Configurações
[Conta]
```

- **Início** abre a home operacional.
- **Trabalhos** usa a lista canônica que já combina campanhas e trabalhos avulsos.
- **Biblioteca** preserva assets e peças salvas.
- **Marca** abre Brand Kit/Brand Training para a marca ativa.
- Ferramentas não são duplicadas na sidebar; vivem na home.
- “Campanhas” deixa de ser destino principal visível e passa a ser filtro/agrupamento em Trabalhos.

Rotas administrativas continuam separadas por papel e não fazem parte desta simplificação.

### 4.2 Marca ativa global

O shell possui um único `activeClientProfileId`:

- com uma marca disponível, ela é selecionada automaticamente;
- com várias marcas, o app restaura a última seleção válida;
- com várias marcas e sem seleção anterior válida, o shell exige uma escolha inicial uma única vez; nenhum trabalho é criado até essa escolha;
- a seleção é persistida no mesmo armazenamento local já usado pelo shell;
- o Assistente, a home e os presets passam a consumir esse mesmo contexto, removendo estados locais concorrentes;
- APIs continuam recebendo `clientProfileId` explicitamente; a seleção global nunca substitui validação server-side de workspace.

Ao criar um trabalho, o `clientProfileId` ativo é copiado para o registro. Trocar a marca global afeta apenas novas criações. Ao abrir um trabalho existente, a UI mostra a marca vinculada ao trabalho sem reatribuição silenciosa.

Se a marca não possuir Brand Training completo ou referências aprovadas, a geração prossegue com os sinais disponíveis e mostra um aviso não bloqueante para completar a marca depois.

## 5. Home operacional

A home segue a hierarquia aprovada no wireframe:

1. compositor inteligente no topo;
2. destaque contextual;
3. quatro ferramentas;
4. inspirações da marca ativa.

### 5.1 Compositor inteligente

O campo principal pergunta: **“O que você quer criar?”** e aceita texto, drag-and-drop e seletor de arquivos.

O sistema infere:

- intenção;
- tema/produto;
- objetivo;
- público;
- oferta;
- copy base;
- formato;
- referências mais adequadas da marca.

Esses dados não viram uma etapa de revisão. Permanecem em **Ajustes opcionais**, acessíveis no próprio compositor.

### 5.2 Destaque contextual

O maior bloco da home nunca é promocional:

- se há rascunho ou trabalho acionável, mostra “Continue de onde parou”, preview e estado;
- sem trabalho acionável, sugere a primeira criação apropriada para a marca ativa;
- a ação abre diretamente o ponto retomável.

### 5.3 Cards de ferramenta

Os cards não abrem modais ou wizards. Eles definem a intenção e focam/expandem o mesmo compositor:

| Card | Preset |
| --- | --- |
| Criar variações | três saídas: conservadora, equilibrada e ousada |
| Criar peça única | uma saída |
| Variar formato | adaptação da arte anexada para os formatos inferidos ou escolhidos em ajustes |
| Reestilizar | nova versão orientada por uma arte de referência |

O campo livre pode inferir qualquer um desses presets. O card existe para usuários que preferem tornar a intenção explícita.

### 5.4 Inspirações

A primeira versão reutiliza somente:

- templates existentes;
- peças aprovadas da marca ativa.

Não há feed externo nem novo recomendador. Ao clicar numa inspiração, o app a anexa ao compositor e pede como ela deve ser usada. A origem da inspiração permanece visível.

## 6. Arte anexada e extração

Cada arte anexada recebe, inline, uma escolha obrigatória de uso:

- **Conteúdo:** extrai produto, oferta, textos, CTA, datas, público sugerido e formato.
- **Estilo:** usa composição, paleta, tipografia, hierarquia e linguagem visual como referência.
- **Ambos:** combina conteúdo e estilo.

Mesmo quando “Estilo” ou “Ambos” é escolhido, elementos obrigatórios e proibidos da marca ativa continuam prevalecendo.

A análise acontece dentro do compositor:

- cada arquivo possui estado independente de upload/análise;
- o resumo extraído aparece recolhido em chips;
- “Revisar dados” permite corrigir a extração, mas é opcional;
- múltiplos arquivos podem ter usos diferentes;
- erro em um arquivo oferece retry ou remoção sem invalidar os demais;
- tipos, tamanho e acesso ao arquivo são validados no trust boundary existente.

## 7. Rascunho, título e campanha

O trabalho é criado como rascunho canônico quando existe a primeira entrada significativa: texto não vazio ou primeiro anexo aceito.

O autosave persiste:

- marca vinculada;
- preset/intenção;
- pedido;
- anexos;
- finalidade de cada anexo;
- extrações;
- ajustes opcionais.

O título é gerado automaticamente a partir da primeira frase significativa e pode ser refinado após a extração. Não há chamada de modelo exclusiva para nomear o trabalho.

O rascunho aparece em Trabalhos e pode alimentar o destaque “Continue de onde parou”. Campanha é uma associação opcional posterior. Criar ou selecionar uma campanha nunca volta a pedir cliente/marca, pois o trabalho já possui `clientProfileId`.

## 8. Confirmação e geração

O único CTA obrigatório depois do pedido mostra quantidade e custo reais:

```text
Gerar 3 variações · 15 créditos
```

Para outros presets, o rótulo reflete a quantidade e o custo calculados pelo contrato canônico.

Ao confirmar:

1. o autosave mais recente é validado;
2. a identidade disponível da marca é congelada no snapshot do trabalho;
3. referências são escolhidas automaticamente conforme pedido e usos dos anexos;
4. o executor canônico recebe uma requisição idempotente;
5. cada saída progride e persiste independentemente.

Duplo clique ou retry de rede não pode criar trabalho, job ou cobrança duplicada.

## 9. Resultados e edição

As propostas aparecem assim que cada saída fica pronta. Não existe seleção obrigatória:

- todas as saídas ficam salvas no trabalho;
- o usuário pode aprovar, baixar ou editar qualquer uma;
- “Aprovar” marca preferência, mas não controla persistência;
- o grid apresenta conservadora, equilibrada e ousada de forma neutra;
- progresso e falha pertencem à saída, não ao lote inteiro.

**Editar** expande um controle curto na própria proposta:

```text
O que você quer mudar?
[texto] [anexo opcional] [marcação opcional]
[Gerar nova versão · custo]
```

A nova geração cria uma versão ligada à saída original. A versão anterior nunca é sobrescrita.

## 10. Estados e recuperação

O ciclo visível é:

```text
preparando → analisando → pronto para gerar → gerando → resultados
```

Regras de erro:

| Falha | Comportamento |
| --- | --- |
| Análise de anexo | mantém pedido e arquivo; oferece retry ou remoção |
| Créditos insuficientes | não dispara job; preserva o rascunho e mostra ação para obter créditos |
| Uma saída falha | mostra as prontas, tenta a falha mais uma vez e depois oferece retry manual nela |
| Rede ou aba fechada | job continua no servidor; reabrir reconstrói o estado persistido |
| Marca global mudou | trabalho retomado permanece na marca original |

Retry é sempre por saída e nunca apaga uma versão pronta. Cobrança, refund e pós-processamento continuam seguindo a política do executor canônico existente.

## 11. Compatibilidade e remoção de fricção legada

Não é necessário criar um novo destino primário para a primeira entrega:

- `/` contém o compositor e aceita presets por query string;
- `/campaigns` continua sendo a rota técnica inicial da lista canônica, mas a UI a nomeia “Trabalhos”;
- `/quick-tools/create-post` redireciona para `/?intent=create-variations` quando não há `workId`;
- links de retomada com `workId` continuam funcionando durante a migração;
- `/campaigns?new=1` redireciona para `/?compose=1`, que abre o compositor genérico focado e não cria campanha antecipadamente;
- templates materializam ou preenchem o compositor canônico, sem solicitar nome/cliente antes da criação.

Após todos os `resumeHref` deixarem de depender do wizard, o código de `CreatePostWizard`, o modal de nova campanha e os controles duplicados de vínculo deixam de fazer parte do happy path e podem ser removidos. A remoção deve seguir evidência de ausência de callers, sem manter uma segunda experiência escondida.

## 12. Acessibilidade e responsividade

- Marca ativa possui nome acessível e não depende apenas de cor.
- Compositor suporta teclado, colar e drag-and-drop com alternativa por botão.
- Enter não inicia uma geração paga; ele apenas insere/envia o pedido para preparação. O CTA de crédito exige ativação explícita.
- Estados de upload, análise e geração usam `aria-live` sem anunciar progresso excessivamente.
- Cards e propostas possuem ordem lógica de foco e ações nomeadas por proposta.
- Em mobile, a sidebar vira navegação recolhida; compositor, destaque, ferramentas e inspirações permanecem nessa ordem.
- Resultados usam uma coluna no mobile e não escondem ações essenciais em hover.

## 13. Testes e critérios de aceite

### 13.1 Testes focados

1. **Marca ativa:** auto-seleção com uma marca, restauração da última válida e isolamento de trabalhos existentes.
2. **Entradas equivalentes:** campo, card e inspiração criam o mesmo contrato canônico com presets diferentes.
3. **Anexos:** conteúdo, estilo e ambos produzem snapshots distintos; arquivos falham de forma independente.
4. **Autosave:** pedido, anexos e extrações reaparecem após reload e na lista de Trabalhos.
5. **Geração:** uma confirmação, idempotência de duplo clique, custo correto e snapshot de identidade.
6. **Resultados parciais:** duas saídas prontas aparecem enquanto a terceira processa ou falha.
7. **Versão:** editar cria nova versão sem sobrescrever a anterior.
8. **Compatibilidade:** rotas antigas chegam ao preset ou trabalho correto.
9. **Acessibilidade:** teclado, foco, nomes acessíveis e anúncios de estado.
10. **Visual responsivo:** home e resultados em mobile e desktop.

### 13.2 Aceite de produto

- Da home ao início da geração há um pedido e uma confirmação explícita.
- Nenhum happy path pede novamente marca, cliente, nome, copy ou seleção de referências.
- Campo, cards e inspirações persistem o mesmo tipo canônico de trabalho.
- Fechar a aba não perde preparação nem geração.
- Duplo clique não duplica trabalho, job ou cobrança.
- Uma saída com falha não bloqueia as prontas.
- Todas as propostas prontas já estão salvas.
- Campanha permanece opcional e Brand Training permanece independente.

## 14. Fora de escopo

- novo pipeline de geração ou persistência paralela;
- novo motor de recomendação de inspirações;
- feed externo ou scraping de referências;
- reformulação do Brand Training;
- migração de trabalho entre marcas;
- formulário completo alternativo para “usuário avançado”;
- edição de pixels/canvas;
- mudança da política canônica de billing, refund ou quality gate.
