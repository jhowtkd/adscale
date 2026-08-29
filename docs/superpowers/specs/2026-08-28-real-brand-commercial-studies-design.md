# Design: Estudos comerciais com marcas reais

**Data:** 2026-08-28

**Status:** Aprovado pelo usuário em 2026-08-28

**Substitui:** `docs/superpowers/specs/2026-08-27-real-brand-commercial-studies-design.md`

**Diferença central:** o anúncio original entra no Brand Training. A peça gerada pela ferramenta é a prova. Fixture não substitui original nem resultado.

**Primeira leva:** Nike, MTV e Absolut

**Destino deste ciclo:** kit interno de laboratório. Sem publicação, sem 16:9/4:5/9:16, sem deploy.

## 1. Objetivo

Montar um laboratório editorial reutilizável no ADScale, usando marcas consolidadas como objeto de estudo. Cada caso mostra a passagem pesquisa → treino de marca → briefing → geração → decisão, e produz telas que servem em site, apresentação e redes depois — mas neste ciclo o kit fica interno.

O laboratório combina estados reproduzíveis da interface com gerações reais. Não transforma as marcas estudadas em clientes, parceiros ou patrocinadores.

Aviso canônico, visível na tela de contexto de cada estudo:

> Estudo independente produzido no ADScale. Sem afiliação, patrocínio ou aprovação da marca analisada.

## 2. O que muda em relação a 2026-08-27

O spec anterior citava campanhas reais e preenchia treino e telas com fixtures sintéticos. Isso produz pastelão: Nike no nome, blob no arquivo.

Neste desenho:

- O original entra no Brand Training como arquivo, com fonte e data no manifesto.
- A ferramenta gera duas peças por marca: recriação reconhecível do sistema e peça nova no mesmo idioma.
- O print comercial mostra o que a ferramenta fez. O original aparece na tela de treino.
- Fixture cobre só loading, erro e galeria vazia. O manifesto marca cada um.
- Lote pago: 4 gerações por marca, escolhe 2. Sem retry automático.
- Derivações 16:9/4:5/9:16 e revisão jurídica ficam para um ciclo futuro de publicação. Este ciclo não publica.

## 3. Casos e originais de treino

Pesquisa pontual. Sem raspar anúncio. Uma campanha por marca. Se o original não tiver fonte, arquivo utilizável ou direito de uso interno de laboratório, a marca não entra no kit.

Arquivos originais ficam em diretório local de desenvolvimento, fora do git. O manifesto guarda hash, fonte, data de acesso e finalidade. Credenciais não entram no manifesto.

### 3.1 Nike — `Just Do It`, 1988

**Original:** comercial de Walt Stack (Wieden+Kennedy, 1988) e o print do corredor na ponte.

**Hipótese:** uma ideia verbal curta sustenta atletas, produtos e décadas sem depender de uma única composição.

**No treino entram:** o spot (voz, ritmo, “Just Do It”) e o print (composição da ponte). Não entra a cara do Walt como identidade a preservar.

**Recriação:** o sistema — ponte, 17 milhas, “Just Do It” — sem retratar Walt Stack.

**Peça nova:** o mesmo idioma verbal e visual, outro motivo.

**Fontes de partida:**

- Smithsonian, objeto da campanha: <https://americanhistory.si.edu/it/collections/object/nmah_881602>
- Recorte histórico da campanha: <https://medium.com/@scott_10846/happy-birthday-just-do-it-fc37c6ec4862>
- Spot: <https://youtu.be/0yO7xLAGugQ>

### 3.2 MTV — network IDs, 1981–83

**Original:** IDs de Manhattan Design / Fred Seibert. Esqueleto fixo, pele muda.

**Hipótese:** uma estrutura reconhecível troca textura e atitude sem perder identidade.

**No treino entram:** 2 ou 3 stills de IDs, o M com TV pichado, e a regra “esqueleto fixo, pele muda”. Sem clipe com música.

**Recriação:** um ID, não um logo estático.

**Peça nova:** o mesmo esqueleto, outra pele.

**Fonte de partida:**

- Arquivo do Seibert: <https://fredseibert.com/post/68726321/the-mtv-network-ids>

### 3.3 Absolut — `Absolut Perfection`, 1980

**Original:** anúncio TBWA. Garrafa, holofote, halo, duas palavras.

**Hipótese:** um objeto proprietário ancora uma série longa sem transformar consistência em repetição.

**No treino entram:** o anúncio e a regra `Absolut ______`.

**Recriação:** o anúncio de 1980, reconhecível como aquele sistema.

**Peça nova:** o mesmo sistema `Absolut ______`. Não copia o halo; copia a regra.

**Fonte de partida:**

- Série histórica: <https://www.businessinsider.com/the-21-best-absolut-ads-2013-12>

Volkswagen `Think Small` e Old Spice `The Man Your Man Could Smell Like` ficam na segunda leva. Não entram neste ciclo.

## 4. Arquitetura

O laboratório é uma camada editorial em torno do produto que já existe. Não é feature nova.

```text
Originais + manifesto
        |
        v
Conta de laboratório -> 3 clientProfiles isolados
        |                      |
        |                      v
        |              original no Brand Training
        |              briefing + 1 Trabalho
        |              4 gerações reais -> 2 escolhidas
        |
        +-----> captura das telas (script atual + manifesto)
                      |
                      v
               kit interno 15 + 9 + 6
```

### 4.1 Conta e isolamento

- Conta `estudos@example.test`, workspace `ADScale — Estudos Editoriais`.
- Dono comum. Se precisar de admin, usa o dev-admin que já existe. Sem papel novo de superuser.
- Três `clientProfile` isolados. Sem cliente real, sem crédito de billing na conta de estudo.
- Seed só em development, idempotente. Apaga somente os três perfis desse workspace.

### 4.2 O que será reutilizado

- Conta dev-admin e autorização de dono da plataforma.
- `clientProfileId`, Brand Kit, Brand Training, Trabalho, Peça e galeria.
- Provider E2E controlado para loading, erro e galeria vazia.
- Fluxos atuais de geração para as provas reais.
- Playwright e o capturador de telas existente.
- Armazenamento e manifestos de evidência já usados pelos testes.

### 4.3 O que será adicionado

- Manifesto versionado dos três casos.
- Seed dev-only e idempotente.
- Modo de captura orientado pelo manifesto no capturador existente.
- Dossiês editoriais e os arquivos finais do kit interno.

### 4.4 O que não será criado

- Novo papel de superusuário.
- Nova tabela, CMS, dashboard ou feature flag.
- Pipeline próprio de geração.
- Novo capturador.

## 5. Manifesto

Um único manifesto é a trilha de verdade. Contém:

- versão e ambiente (`development`);
- aviso editorial canônico;
- marca, campanha, hipótese;
- fontes com autoria, URL, data de acesso e finalidade;
- hash e caminho local de cada original (arquivo fora do git);
- o que entrou no treino, o que foi gerado, o que é fixture;
- perfil, Trabalho e Peças associados;
- chamadas, custo verificável e erros da prova real;
- rota e dimensão de cada print;
- estado de revisão técnica, visual e editorial.

O manifesto não armazena credenciais. IDs de runtime podem ser preenchidos pelo seed, separados por marca.

## 6. Fluxo por marca

Cinco estágios visíveis:

1. **Contexto** — campanha, hipótese, fonte do original, aviso de estudo.
2. **Treino** — o anúncio original visível no Brand Training.
3. **Direção** — briefing extraído do original.
4. **Resultados** — recriação e peça nova lado a lado.
5. **Decisão** — as duas escolhidas e o que o treino acertou ou errou.

Regra do print:

- Se o original não aparece no treino, a tela não serve.
- Se a peça gerada não é lida como aquele sistema, a peça não entra no kit.
- Fixture no lugar do original ou no lugar da prova real é reprovação.
- Aviso de estudo ausente no contexto: a tela de contexto não entra.

O seed prepara perfil, treino com original, briefing e estados de interface. As Peças apresentadas como prova vêm de chamadas reais, com evidência do provedor.

## 7. Geração

Cada marca recebe um lote de 4 gerações reais. Desses 4, a revisão humana escolhe 2: uma recriação reconhecível e uma peça nova no mesmo sistema.

Antes de cada lote, declarar:

- protocolo e formato;
- teto de 4 chamadas;
- custo ou créditos esperados;
- critério de seleção;
- condição de parada.

Nenhuma chamada paga, retry pago ou ampliação do lote acontece sem autorização explícita na hora. Uma geração enfileirada ou uma chamada aceita não prova que a Peça foi entregue.

Provider controlado preenche só estado de interface. Não entra no kit como resultado.

Timeout ou falha de provedor: registra o erro. Retry pago só com autorização nova. Sem retry automático.

## 8. Storyboard e entregáveis deste ciclo

Pacote interno:

- 15 telas desktop: cinco por marca, 1440×1000.
- 9 telas mobile: treino, resultados e decisão de cada marca, 390×844.
- 6 recortes isolados das peças geradas: duas por marca.

Sem 16:9, 4:5 ou 9:16 neste ciclo. Isso era publicação.

## 9. Falhas e custo

| Evento | Comportamento | Próximo passo |
|---|---|---|
| Original sem fonte, arquivo ou direito de uso interno | A marca não entra no kit | Substituir campanha ou adiar a marca |
| Fixture no treino ou no recorte isolado | Reprova a tela | Recolocar o original ou a peça real |
| Geração que não é lida como aquele sistema | A peça não entra; copy não “salva” | Autorizar novo lote ou reprovar o caso |
| Timeout ou falha de provedor | Registrar o erro | Retry pago só com autorização nova |
| Prints vazios ou na rota errada | Falhar só aquela rota | Recapturar a rota |
| Aviso de estudo ausente no contexto | A tela de contexto não entra | Recapturar com o aviso visível |

Revisão deste ciclo: técnica, visual e editorial, internas. Jurídica só se alguém for publicar depois. Este ciclo não publica.

## 10. Validação

### 10.1 Checks automatizados

- Seed restrito a development e idempotente.
- Isolamento de perfil, Trabalhos, Peças e ativos entre as três marcas.
- Manifesto com fontes, hashes dos originais, IDs, rotas e arquivos obrigatórios.
- Provider controlado nunca apresentado como geração real.
- Capturas com rota, dimensão e conteúdo válidos.
- Nenhum dado de cliente, pessoa ou campanha real do ADScale.
- Originais ausentes do git.

### 10.2 Revisão humana

- Inspeção desktop e mobile de todas as telas.
- Original visível no treino de cada marca.
- Coerência entre hipótese, treino e peça escolhida.
- As duas peças de cada marca lidas como aquele sistema.
- Ausência de aparência de parceria, patrocínio ou aprovação oficial.

## 11. Sequência de trabalho

1. Consolidar manifesto e obter os originais com fonte.
2. Seed e treino sem geração paga.
3. Telas controladas (contexto, treino, direção, loading/erro/vazia).
4. Autorizar e executar o lote Nike; escolher 2.
5. Repetir MTV.
6. Repetir Absolut.
7. Capturar 15+9+6.
8. Revisão humana das peças reais e das telas.
9. Recapturar só as rotas reprovadas.

Sem Volkswagen, Old Spice, 16:9/4:5/9:16, publicação ou deploy.

## 12. Fora de escopo

- Tratar Nike, MTV ou Absolut como clientes.
- Publicar, impulsionar ou distribuir o kit nesta entrega.
- Deploy de produção.
- Cobrança, compra de créditos ou alteração de billing.
- Scraping em massa de anúncios.
- Fine-tuning de modelo.
- Novo modelo de permissões.
- Mudanças de produto só para deixar o estudo mais bonito.
- Segunda leva com Volkswagen e Old Spice.
- Retry automático de geração paga.

## 13. Critérios de sucesso

- Cada marca tem original no Brand Training, com fonte e hash no manifesto.
- Cada marca tem perfil, treino e Trabalho isolados.
- Existem 15 telas desktop, 9 mobile e 6 recortes isolados.
- Cada recorte isolado possui evidência de provedor real.
- Nenhuma fixture é confundida com original ou com prova real.
- Nenhuma tela sugere cliente, parceria ou aprovação.
- Nenhuma geração paga, publicação ou deploy ocorre sem aprovação específica.
