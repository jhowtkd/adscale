# Ledger revalidado — Performance do ADScale

**Verificado em:** 2026-07-28

**Substitui:** auditoria heurística de 2026-05-23

**Fonte de verdade:** os 20 achados nomeados de A1 a F2

## Reconciliação da contagem

A auditoria anterior declarava 36 problemas no resumo executivo, enquanto o
resumo consolidado registrava 32; o corpo continha 20 achados nomeados. As
contagens posteriores de 18 e 22 também não podem ser reproduzidas a partir do
documento: orçamento, Top 10 e Quick Wins repetiam ou reagrupavam os mesmos
achados, sem formar claims independentes.

Este ledger corrige a fonte de verdade para os **20 achados nomeados**:

| Estado | Quantidade | Entra no backlog ativo? |
|---|---:|---|
| Confirmado | 5 | Sim — correção |
| Resolvido | 5 | Não |
| Referência inválida | 3 | Não |
| Não verificado | 7 | Sim — verificação |
| **Total** | **20** | |

## Critério de estado

- **Confirmado:** o comportamento ainda existe e a evidência basta para uma
  correção delimitada.
- **Resolvido:** o comportamento pedido pela auditoria já está implementado ou
  o claim foi invalidado pelo contrato atual.
- **Referência inválida:** o módulo citado não existe mais ou não contém o
  comportamento descrito; não há correção ativa derivável do claim.
- **Não verificado:** existe comportamento relacionado, mas falta medição de
  impacto ou análise de risco. O próximo passo é verificar, não corrigir.

## Ledger dos 20 achados

| ID | Módulo de domínio | Estado | Evidência em 2026-07-28 | Próximo passo |
|---|---|---|---|---|
| A1 | Listagem de campanhas | Resolvido | A listagem padrão limita 50 campanhas, ordenadas pela atualização mais recente; a variante paginada aceita limite e deslocamento. | Fora do backlog. |
| A2 | Persistência de derivações e assets de campanha | Não verificado | Ainda existem leituras com projeção completa, mas não há medição de payload, latência ou custo por consumidor. | [#115](https://github.com/jhowtkd/adscale/issues/115) |
| A3 | Persistência de campanhas e derivações | Não verificado | O schema possui 158 declarações de índice; campanhas e derivações já têm índices de escopo, mas não há slow query ou plano que prove os índices compostos sugeridos. | [#117](https://github.com/jhowtkd/adscale/issues/117) |
| A4 | Métricas de campanha | Não verificado | As contagens continuam calculadas em consulta agregada, porém não há volume, plano ou latência que justifique estado denormalizado e seu custo de consistência. | [#116](https://github.com/jhowtkd/adscale/issues/116) |
| B1 | Leitura de derivações e object storage | Não verificado | A leitura aguarda URLs assinadas para todos os outputs retornados, em paralelo e com cache; o custo incremental ainda não foi medido. | [#121](https://github.com/jhowtkd/adscale/issues/121) |
| B2 | Exportação de campanhas | Confirmado | Os dois fluxos de ZIP usam JSZip e materializam o pacote completo em buffer antes da resposta ou upload. | [#109](https://github.com/jhowtkd/adscale/issues/109) |
| B3 | Clientes de provedores de IA | Resolvido | Os clientes têm timeouts explícitos de 60–120 s. O provedor de imagem usa zero retry deliberadamente porque cada chamada é cobrada e o orquestrador controla repetição e teto durável. | Fora do backlog; preservar a invariante de billing. |
| B4 | Proteção das APIs de leitura | Não verificado | Algumas leituras públicas têm rate limit e muitas leituras autenticadas não têm; não existe inventário de ameaça, custo ou controles que sustente uma correção global. | [#118](https://github.com/jhowtkd/adscale/issues/118) |
| C1 | Polling de derivações | Resolvido | O polling para quando não há trabalho pendente e usa intervalos progressivos de 3 s, 5 s e 10 s. | Fora do backlog. |
| C2 | Provider de consultas do cliente | Resolvido | Devtools são importados dinamicamente e renderizados somente em desenvolvimento. | Fora do backlog. |
| C3 | Sistema de animações | Confirmado | Há importação direta de Framer Motion em 19 módulos do produto. | [#112](https://github.com/jhowtkd/adscale/issues/112), [#113](https://github.com/jhowtkd/adscale/issues/113) e [#114](https://github.com/jhowtkd/adscale/issues/114) |
| C4 | Estado de notificações do cliente | Confirmado | Toasts têm auto-dismiss após 5 s, mas a operação de adição não impõe teto à coleção. | [#108](https://github.com/jhowtkd/adscale/issues/108) |
| D1 | Pipeline de imagem | Referência inválida | O job citado apenas reexporta a normalização. A implementação canônica usa um único pipeline Sharp de resize, PNG e buffer; não há evidência dos três buffers descritos. | Fora do backlog. |
| D2 | Creative score | Confirmado | A preparação da análise mantém o buffer de entrada, cria a string base64 e depois o data URL no mesmo escopo. | [#110](https://github.com/jhowtkd/adscale/issues/110) |
| D3 | Orquestração da geração | Não verificado | O despacho trabalha por unidade, mas não há medição do overhead nem prova de que batching preservaria settlement, idempotência, cancelamento e reentrega. | [#119](https://github.com/jhowtkd/adscale/issues/119) |
| E1 | Cache de URLs assinadas do object storage | Referência inválida | O módulo citado não existe. O adaptador atual usa LRU com teto de 1.000 entradas e TTL de 4 minutos. | Fora do backlog. |
| E2 | Cliente do object storage | Referência inválida | O módulo citado não existe. O adaptador atual cria um cliente por instância e a aplicação exporta uma única instância compartilhada. | Fora do backlog. |
| E3 | Cache de consultas do cliente | Resolvido | O provider global configura coleta após 5 minutos, exatamente o valor recomendado. | Fora do backlog. |
| F1 | Ferramenta de acessibilidade | Confirmado | `@axe-core/react` permanece classificado como dependência de produção. | [#111](https://github.com/jhowtkd/adscale/issues/111) |
| F2 | Configuração de build | Não verificado | Headers já existem; compressão e imports otimizados não foram medidos contra o gate real de bundle. | [#120](https://github.com/jhowtkd/adscale/issues/120) |

## Backlog ativo

### Correções confirmadas

1. [#108 — Limitar notificações efêmeras no cliente](https://github.com/jhowtkd/adscale/issues/108)
2. [#109 — Transmitir exportações ZIP incrementalmente](https://github.com/jhowtkd/adscale/issues/109)
3. [#110 — Remover a residência duplicada da imagem no creative score](https://github.com/jhowtkd/adscale/issues/110)
4. [#111 — Restringir a ferramenta de acessibilidade ao desenvolvimento](https://github.com/jhowtkd/adscale/issues/111)
5. [#112–#114 — Migrar o sistema de animações para carregamento preguiçoso](https://github.com/jhowtkd/adscale/issues/112)

### Verificações antes de corrigir

1. [#115 — Projeções de derivações e assets](https://github.com/jhowtkd/adscale/issues/115)
2. [#116 — Contagens de campanha](https://github.com/jhowtkd/adscale/issues/116)
3. [#117 — Necessidade de índices](https://github.com/jhowtkd/adscale/issues/117)
4. [#118 — Rate limit em leituras](https://github.com/jhowtkd/adscale/issues/118)
5. [#119 — Batching do orquestrador](https://github.com/jhowtkd/adscale/issues/119)
6. [#120 — Configuração de build](https://github.com/jhowtkd/adscale/issues/120)
7. [#121 — URLs assinadas na listagem de derivações](https://github.com/jhowtkd/adscale/issues/121)

## Invariantes

- Teste automatizado verde prova ausência de regressão funcional; não prova
  ganho de latência.
- Ganho de performance exige medição antes/depois no ambiente real de
  hospedagem.
- O cliente do provedor de imagem não deve ganhar retry automático: o
  orquestrador já controla repetição e cada chamada pode gerar cobrança.
- Itens resolvidos ou com referência inválida só voltam ao backlog mediante
  nova evidência datada.
