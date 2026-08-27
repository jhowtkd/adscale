# Design: Estudos comerciais com marcas reais

**Data:** 2026-08-27

**Status:** Aprovado pelo usuário em 2026-08-27

**Primeira leva:** Nike, MTV e Absolut

## 1. Objetivo

Criar um laboratório editorial do ADScale que use marcas e campanhas reais como objetos de estudo. Cada caso deve mostrar a passagem de pesquisa para treinamento de marca, briefing, geração, revisão e resultado, produzindo telas reaproveitáveis em site, apresentação e redes sociais.

O laboratório deve combinar estados reproduzíveis da interface com poucas gerações reais. Ele não transforma as marcas estudadas em clientes, parceiros ou patrocinadores do ADScale.

## 2. Enquadramento editorial

Todo material público deve usar o seguinte enquadramento, de forma visível:

> Estudo independente produzido no ADScale. Sem afiliação, patrocínio ou aprovação da marca analisada.

As marcas aparecem como objeto de análise, não como prova social. O aviso não autoriza sozinho o uso de marca ou obra protegida; ele apenas evita uma apresentação enganosa do relacionamento.

Regras obrigatórias:

- Delimitar uma campanha ou sistema de identidade por estudo.
- Registrar fonte, autoria, data e finalidade analítica de cada referência.
- Reproduzir somente o necessário para explicar a análise.
- Não apresentar a marca como cliente ou o resultado como campanha oficial.
- Não usar depoimentos, pessoas, campanhas ou dados de clientes reais do ADScale.
- Não coletar anúncios em massa nem criar um corpus indiscriminado.
- Usar um logo, fonte, fotografia ou outro ativo exato no treinamento ou na composição somente quando a licença, autorização ou hipótese editorial aplicável estiver registrada no manifesto.
- Encaminhar o kit final para revisão jurídica antes de publicação comercial.

Referências normativas para a revisão jurídica:

- Lei de Propriedade Industrial, especialmente os artigos 129–132: <https://www.planalto.gov.br/ccivil_03/leis/l9279.htm>
- Lei de Direitos Autorais, especialmente o artigo 46: <https://planalto.gov.br/ccivil_03/leis/l9610.htm>
- Guia de Propriedade Industrial do INPI: <https://www.gov.br/inpi/pt-br/servicos/marcas/materiais-de-consulta-e-apoio/guia-do-empresario.pdf>

## 3. Casos selecionados

### 3.1 Nike — `Just Do It`

**Hipótese:** uma ideia verbal curta pode sustentar atletas, produtos, formatos e décadas de campanhas sem depender de uma única composição.

**Funções demonstradas:** treinamento de voz, briefing inferido, Peça única, Variações e adaptação 4:5/9:16.

**Resultado esperado:** duas Peças selecionadas e uma tela de comparação de consistência verbal e visual.

### 3.2 MTV — identidade mutável

**Hipótese:** uma estrutura reconhecível pode trocar textura, movimento e atitude sem perder identidade.

**Funções demonstradas:** ativos de marca, referências visuais, Mudar estilo, Variações e comparação de coerência.

**Resultado esperado:** duas Peças selecionadas com linguagens diferentes e uma tela que explica as constantes preservadas.

### 3.3 Absolut — objeto como sistema

**Hipótese:** um ativo proprietário pode ancorar uma série extensa sem transformar consistência em repetição.

**Funções demonstradas:** ativo exato quando autorizado, composição reservada, Peça única, Variações e galeria.

**Resultado esperado:** duas Peças selecionadas e uma tela de verificação da preservação do objeto.

Volkswagen `Think Small` e Old Spice `The Man Your Man Could Smell Like` ficam como segunda leva. Não entram no primeiro pacote nem na primeira rodada de geração.

## 4. Arquitetura escolhida

O laboratório é uma camada editorial e operacional em torno do produto existente. Ele não é uma nova feature do ADScale.

```text
Dossiê editorial
       |
       v
Sandbox dev-admin -> perfil por marca -> treinamento + Trabalhos
       |                                      |
       |                                      v
       |                          fixtures + gerações reais
       |                                      |
       +---------------------------> seleção humana
                                              |
                                              v
                               capturas + kit comercial
```

### 4.1 O que será reutilizado

- Conta dev-admin e autorização de dono da plataforma já existentes.
- `clientProfileId`, Brand Kit, Brand Training, Trabalho, Peça e galeria atuais.
- Provider E2E controlado para estados reproduzíveis sem custo.
- Fluxos atuais de geração para as provas reais.
- Playwright e o capturador de telas existente.
- Armazenamento e manifestos de evidência já usados pelos testes e gates visuais.

### 4.2 O que será adicionado

- Um manifesto versionado dos três casos.
- Um seed dev-only e idempotente para criar os perfis e estados controlados.
- Um modo de captura orientado pelo manifesto no capturador existente.
- Os dossiês editoriais e os arquivos finais dos estudos.

### 4.3 O que não será criado

- Novo papel de superusuário.
- Nova tabela ou banco de dados para estudos comerciais.
- Novo dashboard, CMS ou feature flag de produto.
- Pipeline próprio de geração.
- Novo capturador quando o script atual puder receber um manifesto opcional.

## 5. Manifesto dos casos

Um único manifesto será a trilha de verdade do laboratório. Ele deve conter:

- versão e ambiente;
- aviso editorial canônico;
- marca, campanha delimitada e hipótese;
- fontes com autoria, URL, data de acesso e finalidade;
- uso permitido e restrições de cada ativo;
- perfil, Trabalhos e Peças associados;
- quais estados são controlados e quais vêm de provedores reais;
- chamadas, custo verificável e erros da prova real;
- rotas e dimensões de captura;
- estado de revisão técnica, visual, editorial e jurídica;
- hashes ou caminhos dos arquivos finais.

O manifesto não armazena credenciais. IDs e evidências de runtime podem ser preenchidos pelo seed e pelos scripts, mas permanecem separados por marca.

## 6. Fluxo por marca

Cada estudo percorre cinco estágios visíveis:

1. **Contexto:** campanha, hipótese, fontes e aviso de não afiliação.
2. **Treinamento:** voz, princípios, referências aprovadas e restrições.
3. **Direção:** pedido, público, formato, briefing e direções criativas.
4. **Resultados:** propostas geradas, comparação e seleção.
5. **Decisão:** Peça escolhida, análise humana, limites e conclusão do experimento.

O seed prepara os estados necessários para as telas 1–3 e para estados auxiliares da galeria. As Peças apresentadas como prova real devem vir de chamadas reais e possuir evidência do provedor.

## 7. Estratégia híbrida de evidência

### 7.1 Estados controlados

Fixtures determinísticas cobrem:

- perfil e treinamento completos;
- briefing e direções aprovadas;
- estados de carregamento, erro e retomada;
- galeria, seleção e análise;
- rotas desktop e mobile.

Esses estados provam a interface e a narrativa. Não são apresentados como prova de geração real.

### 7.2 Gerações reais

Cada marca recebe um lote inicial de uma ou duas gerações reais. O lote deve declarar antes da execução:

- protocolo e formato;
- número máximo de chamadas e Peças;
- custo ou créditos esperados quando disponíveis;
- critério de seleção;
- ativos exatos autorizados;
- condição de parada.

Nenhuma chamada paga, retry pago ou ampliação do lote acontece sem autorização explícita. Uma geração enfileirada ou uma chamada aceita não prova que a Peça foi entregue.

### 7.3 Seleção humana

O resultado final exige decisão humana registrada. Teste verde, score automático ou geração concluída não substituem aprovação visual.

## 8. Storyboard e entregáveis

### 8.1 Pacote-base

- 15 telas desktop: cinco por marca, em 1440×1000.
- 9 telas mobile: treinamento, resultados e decisão de cada marca, em 390×844.
- 6 resultados isolados: duas Peças selecionadas por marca.
- Metadados de fonte, caso, função, origem da geração e revisão humana.

### 8.2 Derivações após aprovação visual

- Apresentação 16:9 com abertura e cinco telas por estudo.
- Recortes 4:5 para carrosséis e portfólio.
- Recortes 9:16 para stories e demonstrações verticais.
- Índice web dos três estudos.

As derivações só começam quando as matrizes desktop, mobile e os seis resultados isolados forem aprovados. Um publish, export ou build bem-sucedido não equivale a essa aprovação.

## 9. Tratamento de falhas

| Evento | Comportamento | Próximo passo |
|---|---|---|
| Fonte ou permissão ausente | Bloquear ativo no treinamento e na publicação | Substituir, licenciar ou limitar a uma citação analítica |
| Geração paga sem autorização | Usar somente estado controlado | Solicitar aprovação do lote |
| Timeout ou falha de provedor | Registrar falha sem inventar sucesso | Retry apenas com nova autorização quando houver custo |
| Baixa fidelidade | Reprovar a Peça para os prints finais | Ajustar entrada ou direção e aprovar novo lote |
| Logo duplicado ou ativo deformado | Bloquear seleção | Corrigir na composição compartilhada, não somente no caso afetado |
| Captura vazia ou incorreta | Falhar apenas a rota no manifesto | Recapturar a rota afetada |
| Aviso editorial ausente | Bloquear o material público | Reempacotar com aviso visível |
| Gates completos | Liberar derivações | Produzir 16:9, 4:5 e 9:16 |

Falhas técnicas, custo, evidência de provedor e aprovação humana devem permanecer categorias separadas no relatório.

## 10. Validação

### 10.1 Checks automatizados mínimos

- Seed restrito a desenvolvimento e idempotente.
- Isolamento de perfil, Trabalhos, Peças e ativos entre as três marcas.
- Manifesto sem fontes, IDs, rotas ou arquivos obrigatórios ausentes.
- Provider controlado nunca apresentado como geração real.
- Capturas com rota, dimensão e conteúdo válidos.
- Nenhum dado de cliente, pessoa ou campanha real do ADScale.
- Aviso editorial presente no empacotamento público.
- Arquivos finais indexados com caminho e hash.

### 10.2 Revisão humana obrigatória

- Inspeção desktop e mobile de todas as telas.
- Coerência entre hipótese, treinamento e Peça selecionada.
- Fidelidade visual e legibilidade dos seis resultados.
- Uso proporcional e atribuído das referências.
- Ausência de aparência de parceria, patrocínio ou aprovação oficial.
- Revisão jurídica antes da publicação comercial.

## 11. Sequência de trabalho

1. Consolidar manifesto, fontes e limites dos três estudos.
2. Preparar o seed dev-only e a conta dev-admin isolada.
3. Criar os três perfis e validar o treinamento sem geração paga.
4. Produzir e aprovar os estados controlados das 15 telas desktop.
5. Autorizar e executar o lote real da Nike; selecionar duas Peças.
6. Repetir o lote real e a seleção para MTV.
7. Repetir o lote real e a seleção para Absolut.
8. Capturar as 15 telas desktop, 9 mobile e 6 resultados isolados.
9. Executar checks automáticos e revisão humana lado a lado.
10. Corrigir somente os casos ou rotas reprovados e repetir os gates afetados.
11. Após aprovação das matrizes, produzir apresentação e recortes sociais.
12. Realizar revisão jurídica e pedir autorização separada para publicação.

## 12. Fora de escopo

- Tratar Nike, MTV ou Absolut como clientes do ADScale.
- Publicar, impulsionar ou distribuir o kit nesta entrega.
- Deploy de produção.
- Cobrança, compra de créditos ou alteração de billing.
- Scraping em massa de anúncios.
- Fine-tuning de modelo.
- Novo modelo de permissões.
- Mudanças no fluxo de produto que existam apenas para deixar o estudo mais bonito.
- Segunda leva com Volkswagen e Old Spice.
- Retry automático de geração paga.

## 13. Critérios de sucesso

- Os três estudos possuem fontes, limites e aviso editorial verificáveis.
- Cada marca tem perfil, treinamento e Trabalhos isolados.
- Existem 15 telas desktop, 9 mobile e 6 resultados isolados completos.
- Cada resultado isolado apresentado como real possui evidência de provedor.
- Nenhuma fixture é confundida com prova real.
- Nenhum material público sugere cliente, parceria ou aprovação.
- Falhas técnicas, custo, QA automático e julgamento humano são reportados separadamente.
- Todas as telas passam pela revisão visual desktop e mobile.
- Nenhuma geração paga, publicação ou deploy ocorre sem aprovação específica.

