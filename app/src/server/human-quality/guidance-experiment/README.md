# Manifesto de orientações da marca (#703)

Este módulo prepara e verifica somente simulações de P3 da spec #640. D4 está
pendente na #704: não existe executor, persistência de manifesto ou provider de
produção. Todo resultado mantém `realExecutionAllowed: false` e
`realExecutionBlock: "d4_pending_704"`; uma autorização enviada pelo chamador é
recusada pelo schema estrito. Os valores dos testes são fictícios e não definem
marcas, tamanho, janela, critério humano ou orçamento reais.

`validateGuidanceExperimentManifest` copia e congela recursivamente a seleção de
revisões por marca/papel e braço, versões fixas, holdout, dados de treino, janela
e exclusões com motivo. Uma única feature (`guidance_revisions`) é aceita. O
controle é explicitamente vazio; o tratamento tem referências e hash coerentes.
Versões fixas desconhecidas ou diferentes e contaminação por contexto ou fonte de
treino impedem a comparação.

`buildSimulatedGuidanceExperimentReport` aceita um provider controlado de leitura
de evidências simuladas. Antes de usar o agregador existente, confere os dois
braços para cada entrada congelada, hash das entradas equivalentes, escopo,
janela e identidades aplicadas em geração e decisão. Evidência excluída,
divergente, omitida ou desconhecida bloqueia o relatório. O resultado declara
`origin: "simulated"` e `conclusion: "simulated_only"`: não demonstra ganho
criativo. Nenhuma rota ou apresentação do relatório é alterada.

`partitionGuidanceExperimentLearningEvidence` separa as fontes do holdout e todas
as novas decisões de seus contextos da evidência elegível para aprendizado na
simulação. O fim da janela não libera o holdout: exige `closedAt` explícito e
relógio igual ou posterior ao fechamento. Não há escrita no aprendizado real.
O uso de texto aprovado continua regido por D3/ADR 0016, sem esperar o holdout.

A #704 deve registrar marcas/dados autorizados, holdout, janela, braços,
critério humano e teto de gasto antes de se implementar qualquer caminho real.
