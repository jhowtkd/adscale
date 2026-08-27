# Referências temporárias da Arte Livre

**Status:** aprovado em brainstorming em 2026-08-27

## Resumo

A Arte Livre permitirá anexar até três imagens específicas da peça. A ADScale classificará cada imagem automaticamente, associará um tratamento visual previsível e permitirá que o usuário corrija o tipo ou acrescente uma instrução curta.

O recurso estende as fontes, a análise e o planejamento de referências já existentes. Não cria uma biblioteca paralela de anexos. A geração continua enviando no máximo quatro imagens ao provedor, preservando o controle de custo atual.

## Contexto

Hoje a Peça única já combina:

- fontes anexadas ao trabalho criativo;
- conhecimento e ativos persistentes do Brand Training;
- um snapshot congelado antes da geração;
- um planejador de referências com papéis e prioridades;
- composição determinística de ativos exatos, como logos;
- limite interno de quatro imagens enviadas ao provedor.

O GPT Image aceita múltiplas imagens de entrada, mas cada referência é processada em alta fidelidade e acrescenta tokens de imagem à chamada. O teto técnico do provedor não deve ser exposto nem utilizado como meta de produto. A Arte Livre precisa de poucos anexos bem definidos, não de dezesseis slots genéricos.

## Objetivos

- Permitir até três anexos temporários em uma Arte Livre.
- Classificar automaticamente cada anexo e aplicar um tratamento por tipo.
- Permitir correção do tipo e uma instrução curta opcional por anexo.
- Preservar referências obrigatórias sem ultrapassar quatro imagens no provedor.
- Aplicar logos e selos exatos depois da geração, sem pedir ao modelo que os redesenhe.
- Manter os anexos restritos à peça, com promoção explícita e opcional ao Brand Training.
- Reutilizar upload, análise, armazenamento, snapshot, planejamento e composição existentes.
- Manter o preço da Arte Livre em 50 créditos nesta primeira versão.

## Fora do escopo

- Expor o limite técnico de dezesseis imagens.
- Levar o recurso para Variações, Restyle ou Adaptação de formato.
- Criar uma tabela ou biblioteca paralela de “tokens visuais”.
- Cobrança variável conforme a quantidade de anexos.
- Posicionamento manual, canvas ou editor de coordenadas para logos e selos.
- Salvar automaticamente anexos no treinamento da marca.
- Criar uma segunda chamada de visão apenas para classificar o anexo.

## Vocabulário e tratamentos

O usuário vê tipos concretos. O sistema deriva o tratamento a partir do tipo para evitar combinações incoerentes.

| Tipo detectado | Tratamento derivado | Regra de geração |
| --- | --- | --- |
| Personagem ou pessoa | Preservação de identidade | Deve permanecer reconhecível, preservando características essenciais. |
| Produto ou embalagem | Preservação reconhecível | Deve manter formato, cores e elementos distintivos. |
| Logo ou selo adicional | Aplicação exata | É composto deterministicamente depois da geração. |
| Objeto ou cenário obrigatório | Presença obrigatória | Deve aparecer, com liberdade de composição. |
| Grafismo ou textura | Linguagem visual | Orienta fundo, textura ou acabamento sem exigir reprodução literal. |
| Referência de estilo | Direção de estilo | Transfere apenas linguagem visual; conteúdo e marcas da referência não podem contaminar a peça. |

O usuário pode alterar o tipo sugerido. O tratamento acompanha automaticamente o novo tipo e não é editado de forma independente.

## Contrato de dados

Cada `creative_work_source` anexada à Arte Livre poderá carregar um único bloco JSON versionado de referência da peça. Não haverá uma nova tabela.

O rascunho persiste:

- `version`;
- `category`;
- `classificationSource`: `automatic` ou `user`;
- `confidence`: `high`, `medium` ou `low`;
- `userInstruction`: texto opcional de até 240 caracteres;
- `hasTransparency`: resultado técnico da normalização, usado apenas para validar aplicação exata antes da chamada paga.

O tratamento não é um campo livre do rascunho: ele é derivado por uma função pura a partir da categoria. Durante o prepare, o snapshot congela categoria, tratamento resolvido, instrução, chave do ativo, MIME type e rótulo. Assim, uma mudança futura no mapeamento não altera trabalhos já preparados.

Fontes antigas e fontes de outras ferramentas continuam legíveis sem o bloco. A ausência do bloco mantém o comportamento atual.

## Classificação automática

A classificação amplia a análise de imagem que a fonte já executa. Ela não dispara uma segunda análise exclusiva para este recurso.

Fluxo:

1. O usuário anexa uma imagem.
2. O ativo percorre o upload e a normalização atuais.
3. A análise existente retorna conteúdo, estilo e a categoria da referência da peça.
4. A interface mostra o tipo detectado e o tratamento derivado.
5. O usuário pode corrigir o tipo e escrever “Como usar nesta arte?”.

Classificações de confiança alta ou média ficam prontas sem confirmação obrigatória. Confiança baixa ou ausência de classificação exige que o usuário escolha um tipo antes de gerar.

## Interface

O fluxo aprovado usa uma faixa compacta imediatamente abaixo do pedido da Arte Livre.

Cada anexo mostra:

- miniatura;
- tipo detectado;
- resumo do tratamento;
- estado de análise;
- instrução opcional;
- ações de alterar tipo, substituir e remover;
- ação explícita “Salvar no treinamento da marca”.

A faixa mostra apenas `n de 3 anexos`; a interface não expõe a capacidade técnica do provedor. Ao atingir três, o botão permanece visível, desabilitado e identificado como “Limite de 3 atingido”. Não há etapa adicional nem painel lateral.

O estado de análise é anunciado de forma acessível. Seletores e ações funcionam por teclado, têm nomes explícitos e não dependem apenas de cor. Depois do prepare, os anexos seguem o bloqueio de configurações já usado pelo trabalho criativo.

## Planejamento das referências

O limite do provedor permanece em quatro imagens. O planejador existente passa a considerar o contrato temporário nesta ordem:

1. original, pai ou revisão obrigatória da operação;
2. anexos temporários com presença ou preservação obrigatória;
3. anexos temporários de linguagem visual ou estilo;
4. referências opcionais do Brand Training.

Slots obrigatórios nunca são descartados silenciosamente. Se ultrapassarem quatro, o prepare falha antes da chamada paga e informa que o pedido precisa de menos referências obrigatórias.

Referências opcionais do Brand Training apenas ocupam espaços restantes. O conhecimento textual, as regras e as proibições da marca continuam no prompt mesmo quando nenhuma imagem opcional da marca é enviada.

Logos e selos com tratamento exato contam no limite de três anexos da interface, mas não ocupam um slot de imagem do provedor. Eles entram no preflight e na composição determinística já usada para ativos exatos. O prompt apenas reserva espaço visual; o compositor escolhe uma posição segura conforme a política existente. Nesta versão, aplicação exata exige PNG ou WebP com transparência utilizável.

## Promoção ao Brand Training

“Salvar no treinamento da marca” é uma ação separada e explícita. Ela:

- exige o perfil de marca ativo;
- reutiliza o ativo do workspace, sem duplicar o binário;
- cria de forma idempotente uma referência no fluxo de treinamento existente;
- submete a referência à análise e revisão normais do Brand Training;
- não remove nem altera o anexo da peça atual.

Falhar ao promover não bloqueia a geração da peça. A interface informa a falha apenas nessa ação e permite tentar novamente.

## Falhas e segurança operacional

- Arquivo inválido continua usando as validações atuais de tipo, tamanho e conteúdo real.
- Análise pendente bloqueia a geração; análise com baixa confiança exige escolha do tipo.
- Referência obrigatória que não puder ser carregada ou normalizada falha como `reference_failure` antes do provedor.
- Referência opcional da marca que falhar pode ser omitida, preservando a ordem dos slots restantes.
- Logo ou selo exato incompatível com a composição é rejeitado no preflight. O usuário deve substituí-lo ou mudar seu tipo; o modelo nunca o redesenha silenciosamente.
- O snapshot é a autoridade da execução. Alterações posteriores no rascunho ou no Brand Training não afetam a geração já preparada.
- Todas as consultas e mutações permanecem limitadas por workspace e perfil ativo.

## Custo

A primeira versão mantém a cobrança atual de 50 créditos por saída da Arte Livre. Não haverá preço variável por anexo.

O controle econômico vem de três decisões:

- máximo de três anexos temporários;
- máximo de quatro imagens totais no provedor;
- classificação incorporada à análise já existente, sem uma chamada visual adicional.

O sistema já registra quantidade e bytes das referências na telemetria do pipeline. Esses dados devem ser usados para medir custo real antes de qualquer mudança de preço ou de limite.

## Testes e critérios de aceitação

### Contrato e análise

- A análise mapeia exemplos representativos para as seis categorias.
- A correção do usuário substitui a classificação automática.
- O tratamento é derivado deterministicamente da categoria.
- Fonte antiga sem metadados mantém o comportamento anterior.

### Interface

- A Arte Livre aceita zero a três anexos e impede um quarto.
- Estados de upload, análise, baixa confiança, pronto e falha são perceptíveis e acessíveis.
- O usuário altera o tipo e adiciona ou remove a instrução opcional.
- Outras ferramentas criativas não exibem o recurso.

### Prepare e snapshot

- Categoria, tratamento, instrução e ativo são congelados no snapshot.
- Baixa confiança sem escolha bloqueia o prepare.
- Mudanças posteriores não alteram o snapshot preparado.

### Planejamento e geração

- O planejador respeita a ordem: operação, temporários obrigatórios, temporários visuais, marca.
- Nenhuma chamada contém mais de quatro imagens.
- Referências obrigatórias excedentes falham antes do provedor.
- Logos e selos exatos não entram no array de referências e são compostos depois da geração.
- O custo cobrado permanece em 50 créditos.

### Promoção

- A promoção reutiliza o ativo e é idempotente.
- A nova referência entra no fluxo de revisão do Brand Training.
- Falha na promoção não bloqueia a peça.

## Resultado esperado

O usuário consegue orientar uma Arte Livre com poucos elementos específicos e entende como cada um será tratado. A ADScale preserva itens obrigatórios, evita redesenhar logos, mantém o treinamento da marca limpo e controla o custo sem expor complexidade técnica do provedor.
