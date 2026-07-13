# Plano de convergência de produto e arquitetura do ADScale

**Data:** 2026-07-12
**Status:** Gate 5 aprovado — Fase 6 (simplificar workspace e navegação); 40–42 diferidos
**Direção assumida:** trabalho criativo-first
**Estratégia:** migração incremental com gates; nenhum big bang

## 1. Problema

O ADScale acumulou três jornadas concorrentes para executar o mesmo trabalho:

- campanha e workspace;
- Assistente conversacional;
- Quick Tools / Criar Post.

Essas jornadas compartilham parte da infraestrutura, mas apresentam modelos mentais, persistência, cobrança, geração, qualidade e recuperação diferentes. O usuário precisa aprender onde começar e o time precisa manter regras equivalentes em mais de um lugar.

Paralelamente:

- o planejamento declara estados incompatíveis para o mesmo marco;
- funções periféricas competem com o fluxo principal;
- módulos centrais coordenam responsabilidades demais;
- a evidência operacional continua insuficiente apesar da grande cobertura técnica;
- existem ações visíveis que não concluem o que prometem, como `Usar template`.

O objetivo não é apenas reorganizar código. É fazer o produto operar como uma única jornada coerente.

## 2. Resultado desejado

O produto deverá apresentar uma espinha única:

```text
Marca/cliente
  → intenção e briefing
  → trabalho criativo
  → geração
  → revisão e aprovação
  → entrega
  → aprendizado
```

As superfícies passam a ter papéis claros:

- **Trabalho criativo:** agregado canônico do que está sendo produzido.
- **Campanha:** contexto estratégico opcional que pode agrupar trabalhos criativos.
- **Assistente:** interface conversacional que cria e opera os mesmos trabalhos.
- **Quick Tools:** atalhos que iniciam trabalhos preconfigurados, sem persistência ou pipeline paralelo.
- **Brand Training:** módulo independente por marca, consumido por trabalhos e campanhas.
- **Templates:** aceleradores que materializam intenção e briefing dentro do fluxo canônico.

## 3. Princípios obrigatórios

1. Um comportamento de negócio deve possuir uma implementação canônica.
2. Interface HTTP, chat e painel são adapters; não podem duplicar regras.
3. Compatibilidade temporária precisa ter prazo e critério de remoção.
4. Nenhuma nova função ampla entra antes do gate de evidência humana.
5. Status de planejamento deve ser derivado de requisitos e evidências verificáveis.
6. Testes devem observar comportamento pela interface pública do módulo.
7. Brand Training continua independente de campanhas e Quick Tools.
8. Postgres continua como verdade operacional; memória aprendida permanece auxiliar.

## 4. Escopo

### Dentro do escopo

- corrigir o fluxo quebrado de Templates;
- criar um contrato canônico de trabalho criativo;
- convergir Criar Post, Assistente e Campanhas sobre esse contrato;
- centralizar geração, cobrança, qualidade, retry e captura de aprendizado;
- reduzir os grandes módulos de orquestração;
- simplificar navegação e nomenclatura;
- eliminar a árvore paralela de preview quando a produção estiver equivalente;
- normalizar o planejamento;
- executar UAT humano e medir conclusão real.

### Fora do escopo

- reescrever toda a aplicação;
- trocar banco, framework, Inngest ou provedores de imagem;
- redesenhar visualmente todas as telas;
- tornar campanha obrigatória para Criar Post ou Brand Training;
- aprendizado automático sem consentimento;
- colaboração multiusuário e merge de versões;
- pixel diff;
- novas jornadas guiadas;
- expansão de Landing Page ou Persona Simulation;
- reescrita completa do corpus de qualidade.

## 5. Decisões de arquitetura

### 5.1 Trabalho criativo canônico

O trabalho criativo precisa representar:

- workspace e marca;
- campanha opcional;
- origem da intenção;
- briefing e referências;
- plano opcional;
- outputs e versões;
- estado atual aprovado;
- custo e operação idempotente;
- decisões de revisão;
- pacote de entrega;
- sinais de aprendizado.

O primeiro passo não exige substituir imediatamente tabelas existentes. Um módulo de projeção pode oferecer a interface canônica sobre campanhas, derivações e Creative Work enquanto a migração é validada.

### 5.2 Um pipeline de geração

Todas as entradas devem submeter uma solicitação canônica contendo:

- escopo e autoria;
- intenção e modo de geração;
- identidade e referências;
- formato e restrições;
- fonte/versionamento;
- política de custo;
- chave de idempotência;
- destino do resultado.

O pipeline concentra:

- validação;
- cobrança e reembolso;
- escolha de provider;
- armazenamento;
- score e quality gate;
- retry e cancelamento;
- versionamento;
- telemetria;
- captura para aprendizado.

Persistência específica de campanha ou trabalho avulso pode continuar atrás de adapters durante a transição.

### 5.3 Planejamento verificável

O status canônico de um marco deverá ser calculável a partir de:

- requisitos;
- planos executados;
- testes e gates;
- evidência operacional;
- dívida explicitamente aceita.

Documentos narrativos podem explicar o estado, mas não declarar um estado incompatível com esse ledger.

## 6. Sequência de implementação

Cada item abaixo deve resultar em um commit pequeno e manter a aplicação funcionando.

### Fase 0 — Congelamento e baseline

**Objetivo:** impedir que a superfície continue crescendo durante a convergência.

1. Registrar a decisão de produto trabalho criativo-first e os papéis de Campanha, Assistente, Quick Tools, Templates e Brand Training.
2. Marcar Landing Page e Persona Simulation como congeladas: correções críticas permitidas, expansão proibida.
3. Definir os eventos do funil canônico: iniciado, briefing pronto, geração confirmada, output pronto, revisado, aprovado e entregue.
4. Registrar baseline separado para Campanhas, Assistente e Criar Post: início, conclusão, abandono, erro e tempo.
5. Criar um gate que rejeite novos destinos primários ou novos pipelines criativos durante o marco.

**Gate 0:** decisão aprovada, eventos definidos e baseline coletável sem alterar comportamento.

### Fase 1 — Corrigir verdade e defeitos visíveis

**Objetivo:** remover mentiras operacionais antes da refatoração.

6. Fazer `Usar template` materializar o template na criação de trabalho/campanha ou esconder a ação até que isso exista.
7. Adicionar teste E2E que prova que um template escolhido reaparece no briefing resultante.
8. Criar um validador de consistência entre requisitos, roadmap e estado do marco.
9. Corrigir o marco atual para que percentual, planos, requisitos e status concordem.
10. Fazer o release gate falhar quando requisito pendente coexistir com status completo sem dívida aceita explícita.
11. Inventariar rotas e ações sem consumidor ou sem caminho de navegação e classificá-las como manter, fundir, esconder ou apagar.

**Gate 1:** nenhum CTA conhecido termina em fluxo inerte; planejamento passa no validador.

### Fase 2 — Contrato canônico sem migração de dados

**Objetivo:** criar a interface comum antes de mover persistência.

12. Introduzir os tipos canônicos de trabalho criativo, intenção, briefing, output, versão e estado.
13. Criar uma projeção que leia uma campanha existente como trabalho criativo.
14. Criar uma projeção que leia um Creative Work existente como trabalho criativo.
15. Normalizar estados equivalentes entre os dois modelos e rejeitar estados impossíveis.
16. Criar consultas canônicas para listar, abrir e retomar trabalhos independentemente da origem.
17. Cobrir as projeções com testes de contrato usando fixtures de campanha e Criar Post.
18. Adicionar telemetria que compare modelo de origem e projeção canônica sem mudar a UI.

**Gate 2:** os dois modelos existentes produzem a mesma interface consumível e não há regressão de isolamento.

### Fase 3 — Pipeline único de geração

**Objetivo:** eliminar duplicação de regras sem mudar ainda todas as telas.

19. Extrair do job de derivação o contexto de execução e as transições de ciclo de vida.
20. Transformar o job assíncrono em adapter fino que chama o módulo de geração.
21. Criar políticas canônicas de cobrança, reembolso, retry e idempotência.
22. Centralizar score, quality gate e captura de corpus após geração.
23. Migrar geração de campanha para a nova interface mantendo os mesmos eventos e resultados.
24. Migrar geração do Assistente para a mesma interface.
25. Migrar geração de Criar Post para a mesma interface com adapter de persistência temporário.
26. Adicionar testes de paridade para custo, falha pré-provider, falha pós-provider, baixa qualidade, retry e duplicidade.
27. Remover implementações duplicadas que ficaram sem chamadores.

**Gate 3:** todas as entradas usam o mesmo pipeline; cobrança e resultado são equivalentes para o mesmo contrato.

### Fase 4 — Assistente e painel sobre os mesmos comandos

**Objetivo:** impedir que chat replique regras das rotas tradicionais.

28. Criar módulos de aplicação canônicos para: adaptar formato, restyle, regenerar, revisar/aprovar, salvar referência e preparar entrega.
29. Migrar primeiro uma ação de baixo risco e provar que HTTP e Assistente são adapters do mesmo módulo.
30. Migrar as demais ações do escopo (item 28) uma por uma, preservando contratos externos.
31. Para cada migração, adicionar teste de paridade entre painel e Assistente.
32. Remover autorização, persistência, cache e memória duplicadas dos handlers do chat **nas ações migradas**.
33. Impedir novas ações do Assistente que chamem diretamente repositórios, billing ou jobs.

**Diferido pelo Gate 0 (não entra no Gate 4):** Persona Simulation e Landing Page permanecem congeladas — só segurança, perda de dados, build quebrado ou isolamento. Canonicalizar Persona seria refatoração funcional; proibido enquanto o freeze vigorar. Não usar `frozen-exception:` só para “completar” a Fase 4. Reavaliar expansão só após Gate 8; na Fase 7 decidir esconder/remover.

**Assistente-only aceito no Gate 4 (sem paridade painel):** `adaptFormat` / `quick_format_adapt` — não há rota HTTP de single-format adapt; o painel usa batch de campanha (`format_adaptation`) e `prepareDeliveryPackage` para multi-formato. Não contar `adaptFormat` no item 31 até existir adapter de painel.

**Gate 4:** para cada ação **com paridade painel+Assistente** no item 28, apagar um adapter remove somente transporte/apresentação, nunca uma regra de negócio. **Fora do critério:** Persona (Gate 0), Landing Page (Gate 0), `adaptFormat` (Assistente-only documentado).

**Gate 4 — aprovado (2026-07-13):** Standards 0 · Spec 0. Cinco ações compartilhadas com adapters thin + `adapter-parity` (registry/schemas reais). Persona/Landing excluídos; `adaptFormat` Assistente-only.

### Fase 5 — Convergir Criar Post e Templates

**Objetivo:** transformar fluxos paralelos em entradas do trabalho canônico.

34. Fazer Criar Post iniciar um trabalho criativo com intenção preconfigurada para social post.
35. Preservar a experiência curta, sem exigir campanha.
36. Fazer cada passo do wizard escrever no briefing canônico em vez de um modelo paralelo.
37. Fazer os outputs aparecerem na biblioteca e no histórico canônico imediatamente.
38. Migrar seleção, retry e download para comandos compartilhados.
39. Fazer Templates preencher intenção, briefing, formato e referências do trabalho canônico.
40. Redirecionar trabalhos antigos pela camada de compatibilidade.
41. Medir por uma janela de uso se ainda existem leituras ou escritas no caminho antigo.
42. Remover persistência e endpoints antigos somente depois de zero uso e migração validada.

**Gate 5:** Criar Post continua rápido, mas seus trabalhos podem ser retomados e revisados pelas outras interfaces.

**Gate 5 — aprovado (2026-07-13):** Standards 0 · Spec 0. Itens 34–39 com resume `workId`, library isolada, materialize + in-flight ref, inventory. Itens 40–42 (compat/métrica/remoção) permanecem diferidos.

### Fase 6 — Simplificar workspace e navegação

**Objetivo:** fazer a UI refletir a arquitetura convergida.

43. Trocar a home por uma entrada única: novo trabalho e continuar trabalho.
44. Pedir intenção antes de escolher campanha, chat ou atalho técnico.
45. Reorganizar a navegação principal em Trabalhos, Biblioteca, Marcas e Configurações; Assistente vira modo de interação.
46. Preservar Campanhas como filtro/agrupamento estratégico dentro de Trabalhos.
47. Dividir o workspace por tarefas do usuário: briefing, produzir, revisar e entregar.
48. Substituir o hook monolítico por módulos de fluxo com interfaces estreitas.
49. Mover regras de domínio importadas pelo cliente para respostas calculadas no servidor.
50. Fazer UAT desktop e mobile dos caminhos com e sem campanha.

**Phase 6 WIP (2026-07-13):** itens 43–48 **checkpoint aprovados**. Item **49** + **49b** — produce surface e strategy-recipe surface server-derived (`POST /api/strategy-recipe/resolve`; tipos em `lib/domain/strategy-recipe-types`); client sem runtime de `rank/map/estimate/toPatch/buildRecommended`. Item **50**: roteiro em `docs/plans/2026-07-13-phase6-item50-uat-script.md` (executar após 49b verde).

**Gate 6:** um usuário inicia, retoma, revisa e entrega sem precisar entender os antigos subsistemas.

### Fase 7 — Remover árvore paralela e superfícies sem prova

**Objetivo:** reduzir custo permanente depois da convergência.

51. Comparar cada preview v6 com a produção e registrar diferenças ainda desejadas.
52. Migrar diferenças aprovadas para a implementação produtiva.
53. Fazer fixtures usarem adapters de dados sobre a mesma interface visual.
54. Apagar rotas, mappers e módulos de preview sem uso restante.
55. Esconder Landing Page e Persona Simulation da navegação quando não houver evidência de uso decisório.
56. Manter imports de performance e hipóteses somente se completarem o loop de aprendizado com dados reais.
57. Dividir o painel owner de qualidade por tarefa, preservando uma consulta compartilhada apenas onde houver invariantes comuns.
58. Organizar schema e persistência por domínio sem criar abstrações genéricas com um único adapter.

**Gate 7:** não há segunda árvore de produto e toda função visível sustenta a jornada central ou tem evidência de uso.

### Fase 8 — Evidência operacional antes de novas features

**Objetivo:** provar que a convergência melhora o produto real.

59. Executar pelo menos dez jornadas humanas completas: cinco com campanha e cinco sem campanha.
60. Cobrir ao menos três marcas e dois segmentos, incluindo um fora de educação.
61. Registrar onde houve dúvida, abandono, retorno, erro, custo inesperado ou perda de contexto.
62. Corrigir os três maiores breakpoints observados.
63. Repetir as jornadas após as correções.
64. Comparar conclusão, tempo para primeiro output, aprovação e entrega contra o baseline.
65. Exigir amostra suficiente antes de declarar melhoria ou reabrir expansão de escopo.
66. Publicar decisão explícita: expandir, iterar ou reverter partes da convergência.

**Gate 8:** evidência humana mostra uma jornada compreensível e superior; somente então o roadmap aceita novas funções.

## 7. Estratégia de testes

### Comportamentos que devem permanecer cobertos

- isolamento por workspace e marca;
- Brand Training independente de campanha;
- criação com e sem campanha;
- cobrança, reembolso e idempotência;
- falha e retry;
- geração, score e quality gate;
- revisão, aprovação, promoção e histórico;
- retomada após reload;
- template materializado no briefing;
- Criar Post retomável pelo fluxo canônico;
- paridade entre painel e Assistente;
- navegação desktop e mobile;
- compatibilidade de registros antigos.

### Regra para novos testes

Testar a interface pública dos módulos canônicos. Não testar nomes de steps internos, ordem de funções privadas ou detalhes de adapters quando o comportamento externo for suficiente.

### Cobertura existente reutilizável

O repositório já possui testes de:

- jobs de derivação e Creative Work;
- rotas de campanha, derivação e Creative Work;
- Assistente, guided journeys e artifact versions;
- Brand Training;
- billing, quality gate e retry;
- workspace e hooks;
- E2E de Assistente e Criar Post.

Esses testes devem ser usados primeiro como characterization tests; depois, os testes que acoplam detalhes internos devem ser substituídos por testes dos módulos canônicos.

## 8. Migração e rollback

- Cada entrada poderá ser migrada por feature flag separada.
- O modelo antigo permanece legível até o gate de remoção.
- Escrita dupla só será usada quando necessária e por tempo limitado; haverá métrica de divergência.
- O rollback troca o adapter ativo, não reverte dados já aprovados.
- Nenhuma tabela antiga será removida enquanto houver leitura, escrita ou registro não migrado.
- Backfills devem ser idempotentes, auditáveis e executáveis em dry-run.

## 9. Métricas de sucesso

### Produto

- aumento da taxa de trabalho iniciado → primeiro output;
- redução do tempo até primeiro output;
- aumento de output pronto → decisão de revisão;
- aumento de decisão → entrega;
- redução de abandono ao escolher onde começar;
- redução de trabalhos que não podem ser retomados em outra interface.

### Arquitetura

- 100% das gerações passam pelo pipeline canônico;
- 100% das ações equivalentes de painel/chat usam o mesmo módulo;
- zero CTAs sem consumidor funcional;
- zero divergências no ledger de planejamento;
- remoção da persistência paralela de Criar Post após migração;
- remoção da árvore visual paralela após equivalência.

### Operação

- dez jornadas humanas registradas;
- pelo menos três marcas e dois segmentos;
- três maiores breakpoints corrigidos e reavaliados;
- claims bloqueados enquanto amostra permanecer insuficiente.

## 10. Ordem recomendada de entrega

1. **Fases 0–1:** verdade, congelamento e defeitos visíveis.
2. **Fases 2–3:** contrato e pipeline canônicos.
3. **Fase 4:** paridade painel/chat.
4. **Fase 5:** convergência de Criar Post e Templates.
5. **Fase 6:** navegação e workspace.
6. **Fase 7:** deleção e simplificação.
7. **Fase 8:** evidência operacional.

Não executar Fases 6–7 antes de o pipeline e os comandos canônicos estarem estáveis. Fazer a UI convergir antes do domínio apenas esconderia a duplicação.

## 11. Critério final de conclusão

Este plano estará concluído quando:

- o usuário puder começar por intenção, com ou sem campanha;
- Campanhas, Assistente, Templates e Criar Post operarem o mesmo trabalho criativo;
- geração, billing, qualidade, retry, versionamento e aprendizado tiverem uma implementação canônica;
- Brand Training continuar independente e reutilizável;
- os caminhos antigos tiverem sido removidos, não apenas escondidos;
- o planejamento não aceitar estados contraditórios;
- jornadas humanas reais demonstrarem que o fluxo convergido é compreensível e concluível.

