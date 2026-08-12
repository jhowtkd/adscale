# Córtex da Marca com execução determinística e conhecimento baseado em evidências

## Problem Statement

Quem treina uma marca no ADScale precisa confiar que os materiais enviados serão usados de forma coerente nas Peças futuras. Hoje essa confiança é limitada por dois problemas distintos.

Primeiro, uma análise de IA pode inferir categoria, regra, preferência ou restrição a partir de um asset e esse resultado pode ganhar autoridade demais. Quando uma inferência imprecisa entra na identidade da marca sem uma decisão humana explícita, a alucinação deixa de afetar uma geração isolada e passa a contaminar trabalhos futuros.

Segundo, mesmo quando a identidade está correta, elementos que precisam ser literais continuam sob responsabilidade do gerador de imagem. Copy, fonte, quebra de linha, CTA e aplicação do logo podem ser alterados durante a geração. A marca pode estar corretamente descrita e ainda assim a Peça sair visualmente incoerente.

Enviar mais referências ao modelo não resolve esses problemas. O GPT Image 2 aceita mais inputs do que o limite operacional atual do ADScale, mas volume de contexto não cria autoridade, não resolve conflitos e não garante pixels exatos. Mais referências também podem aumentar custo, latência e ruído.

O usuário precisa de uma fonte de identidade confiável, vinculada ao perfil da marca, que diferencie explicitamente conhecimento comprovado, inferência, desconhecido e conflito. Também precisa que elementos literais sejam executados deterministicamente sempre que existirem arquivos oficiais apropriados.

## Solution

Criar o **Córtex da Marca**, uma evolução do Brand Training vinculada a `clientProfileId`, inicialmente consumida apenas pelo Protocolo Peça única.

O Córtex combina duas capacidades complementares:

1. **Conhecimento com evidência:** fatos, regras, preferências e proibições da identidade são registrados como claims com fonte, autoridade, confiança e escopo. A IA pode propor candidatos, mas somente uma publicação humana cria uma versão ativa. Desconhecidos permanecem desconhecidos e conflitos bloqueiam a publicação até serem resolvidos.
2. **Execução determinística:** copy, fontes oficiais, logos e outros assets exatos deixam de depender do gerador sempre que houver arquivos aprovados. O modelo gera a base visual e o ADScale compõe os elementos literais depois, com plano, hashes e proveniência reproduzíveis.

Cada Trabalho de Peça única congela uma versão imutável da identidade usada. A Peça recebe um resultado separado de fidelidade da marca: checks determinísticos podem aprovar ou reprovar aspectos comprováveis; avaliações visuais residuais aparecem como suspeitas ou inconclusivas e nunca ensinam, corrigem ou bloqueiam sozinhas.

A entrega começa medindo o fluxo atual com o corpus e os gates de evidência já existentes. Novos uploads deixam de ser autoaprovados. O rollout fica atrás de feature flag, mantém inicialmente o limite de quatro referências visuais e só considera oito depois de um experimento autorizado demonstrar ganho líquido de aprovação humana por custo e tempo.

Campanhas continuam opcionais e separadas. Elas poderão consumir uma versão do Córtex no futuro, mas não são necessárias para treinar a marca e não modificam sua identidade nesta entrega.

## User Stories

1. As a responsável pela marca, I want selecionar um perfil antes de treinar a identidade, so that todo conhecimento permaneça associado à marca correta.
2. As a responsável pela marca, I want enviar guias visuais, logos, grafismos, personagens e referências, so that o Córtex tenha fontes reais para analisar.
3. As a responsável pela marca, I want que um upload novo apareça como “em análise”, so that eu saiba que ele ainda não influencia nenhuma Peça.
4. As a responsável pela marca, I want que a análise concluída fique aguardando revisão, so that a IA não transforme inferência em regra ativa automaticamente.
5. As a responsável pela marca, I want revisar a categoria proposta para um asset, so that erros de classificação não contaminem seu uso futuro.
6. As a responsável pela marca, I want escolher entre uso exato, referência visual e regra extraída, so that cada material seja aplicado conforme sua função real.
7. As a responsável pela marca, I want editar a descrição, as regras e as restrições propostas, so that o registro represente a intenção da marca e não apenas a leitura da IA.
8. As a responsável pela marca, I want aprovar ou arquivar um asset explicitamente, so that apenas materiais que eu reconheço possam entrar na identidade operacional.
9. As a responsável pela marca, I want identificar assets legados que foram autoaprovados, so that eu possa revisá-los progressivamente sem perder compatibilidade.
10. As a responsável pela marca, I want que consultar a biblioteca nunca altere estados, so that abrir a tela não aprove ou promova dados silenciosamente.
11. As a responsável pela marca, I want persistir o guia visual original como evidência, so that eu possa verificar de onde cada regra foi extraída.
12. As a responsável pela marca, I want ver a origem de cada claim, so that eu possa distinguir Brand Kit explícito, guia, asset, medição e decisão humana.
13. As a responsável pela marca, I want ver a autoridade de cada claim, so that eu saiba se ele foi declarado, medido ou inferido.
14. As a responsável pela marca, I want ver a confiança e as ressalvas de cada claim, so that eu possa priorizar o que precisa de revisão.
15. As a responsável pela marca, I want que informações ausentes permaneçam desconhecidas, so that o Córtex não preencha lacunas com padrões genéricos.
16. As a responsável pela marca, I want que claims inferidos sempre exijam aprovação humana, so that confiança alta do modelo não substitua autoridade.
17. As a responsável pela marca, I want corrigir um claim antes de publicá-lo, so that a versão ativa contenha o valor canônico da marca.
18. As a responsável pela marca, I want rejeitar um claim sem apagar sua evidência, so that exista histórico auditável do que foi considerado.
19. As a responsável pela marca, I want ver conflitos entre fontes, so that decisões incompatíveis não sejam resolvidas silenciosamente.
20. As a responsável pela marca, I want que cores quase idênticas sejam comparadas com tolerância perceptual, so that pequenas variações técnicas não criem alertas falsos.
21. As a responsável pela marca, I want que famílias, pesos e estilos tipográficos sejam comparados por regras próprias, so that conflitos de fonte sejam precisos.
22. As a responsável pela marca, I want que textos sem comparador seguro sejam encaminhados para decisão humana, so that similaridade aproximada não invente equivalência.
23. As a responsável pela marca, I want publicar o conhecimento como um único pacote, so that a identidade ativa tenha versão e momento de decisão claros.
24. As a responsável pela marca, I want que a publicação falhe quando uma fonte mudou durante a revisão, so that eu não publique conhecimento obsoleto.
25. As a responsável pela marca, I want consultar versões anteriores do Córtex, so that eu possa auditar qual identidade estava ativa em cada período.
26. As a responsável pela marca, I want que apenas uma versão fique ativa por perfil, so that não exista ambiguidade sobre a identidade operacional.
27. As a responsável pela marca, I want reenviar o mesmo pacote sem criar uma versão duplicada, so that retries sejam idempotentes.
28. As a responsável pela marca, I want enviar um arquivo oficial de fonte, so that a Peça possa usar a tipografia real em vez de uma aproximação gerativa.
29. As a responsável pela marca, I want declarar família, peso e estilo da fonte, so that o compositor escolha o arquivo correto para cada camada.
30. As a responsável pela marca, I want confirmar que tenho direito de usar a fonte enviada, so that o ADScale não trate uma fonte encontrada apenas pelo nome como autorizada.
31. As a responsável pela marca, I want que arquivos de fonte inválidos ou corrompidos sejam rejeitados, so that o processamento não aceite conteúdo inseguro.
32. As a responsável pela marca, I want ver quando a marca só possui o nome de uma fonte, so that eu saiba que a execução ainda será gerativa e não exata.
33. As a criadora, I want iniciar uma Peça única escolhendo uma marca, so that o Trabalho use a identidade correta desde o começo.
34. As a criadora, I want criar uma Peça sem criar uma Campanha técnica, so that trabalhos soltos continuem independentes.
35. As a criadora, I want ver qual versão do Córtex será usada antes de confirmar o Trabalho, so that a identidade aplicada não seja invisível.
36. As a criadora, I want ver os assets e regras principais selecionados, so that eu possa confirmar a direção da marca.
37. As a criadora, I want ver o motivo de cada referência visual selecionada, so that eu entenda o papel de cada input na geração.
38. As a criadora, I want editar e confirmar a copy antes da geração visual, so that headline, corpo e CTA tenham autoridade textual clara.
39. As a criadora, I want que o modelo gere um background sem copy quando houver tipografia determinística, so that não existam textos duplicados ou conflitantes.
40. As a criadora, I want que headline, corpo e CTA sejam compostos depois da geração, so that ortografia e conteúdo permaneçam literais.
41. As a criadora, I want que o texto se ajuste dentro de limites definidos, so that ele não seja cortado silenciosamente.
42. As a criadora, I want que a Peça falhe com explicação quando o texto não couber no tamanho mínimo, so that eu possa corrigir a copy em vez de receber um resultado ilegível.
43. As a criadora, I want que contraste insuficiente use uma alternativa autorizada ou uma placa prevista, so that a copy permaneça legível sem improvisar cores.
44. As a criadora, I want que logos exatos sejam compostos sem redesenho, so that o símbolo oficial não seja alterado pelo modelo.
45. As a criadora, I want que assets de referência orientem apenas linguagem visual, so that eles não introduzam fatos, ofertas ou marcas alheias.
46. As a criadora, I want que regras textuais não consumam slots de imagem, so that o pacote visual seja usado apenas por referências que realmente precisam ser vistas.
47. As a criadora, I want que um Trabalho confirmado congele a identidade, so that mudanças posteriores na marca não alterem Peças antigas.
48. As a criadora, I want reabrir um Trabalho antigo com o mesmo snapshot, so that eu consiga entender e reproduzir sua configuração.
49. As a criadora, I want que perfis sem versão ativa continuem funcionando no fluxo legado, so that a adoção do Córtex não bloqueie a criação atual.
50. As a criadora, I want que ausência de arquivo oficial seja mostrada como limitação, so that o sistema não prometa exatidão que não pode cumprir.
51. As a criadora, I want ver “Fidelidade da marca” separada da qualidade criativa subjetiva, so that integridade e gosto não sejam confundidos.
52. As a criadora, I want ver quais checks foram comprovados deterministicamente, so that eu saiba por que texto, fonte ou logo passaram.
53. As a criadora, I want que uma falha determinística mostre esperado, observado, regra e fonte, so that o problema seja corrigível.
54. As a criadora, I want que uma avaliação visual ambígua apareça como suspeita ou inconclusiva, so that a IA não reprove uma Peça por incerteza.
55. As a criadora, I want que suspeitas não acionem retry automático, so that uma segunda alucinação não seja usada para corrigir a primeira.
56. As a criadora, I want que falha do avaliador deixe a Peça disponível para decisão humana, so that indisponibilidade do juiz não destrua um resultado utilizável.
57. As a criadora, I want que o Córtex nunca aprenda automaticamente com uma Peça gerada, so that erros de saída não retornem como identidade da marca.
58. As a operadora, I want executar um baseline sem chamar provedor externo ou pago, so that eu possa medir o estado atual sem custo de geração.
59. As a operadora, I want distinguir fixtures sintéticas, imports do operador e casos reais, so that evidência artificial não seja apresentada como validação de cliente.
60. As a operadora, I want que corpus insuficiente resulte em `human_needed` ou amostra insuficiente, so that ausência de evidência não pareça sucesso.
61. As a operadora, I want medir copy, fonte, logo, crop, contraste, paleta e contaminação separadamente, so that regressões tenham diagnóstico específico.
62. As a operadora, I want registrar duração, chamadas, memória e custo quando verificáveis, so that consistência visual não inviabilize economicamente a Peça.
63. As a operadora, I want manter métricas ausentes como indisponíveis, so that o relatório não invente estimativas.
64. As a operadora, I want comparar o baseline e o Córtex com o mesmo schema, so that a melhoria seja mensurável.
65. As a operadora, I want habilitar o Córtex por feature flag apenas na Peça única, so that o rollout tenha blast radius pequeno e rollback simples.
66. As a operadora, I want manter inicialmente quatro referências visuais, so that custo e ruído não aumentem antes de haver evidência.
67. As a operadora, I want testar quatro contra oito referências somente com autorização, so that o experimento pago tenha hipótese e orçamento explícitos.
68. As a operadora, I want que oito referências só sejam adotadas após melhorar aprovação humana por custo e tempo, so that capacidade técnica não vire política sem prova.
69. As a operadora, I want desligar o flag sem migrar ou apagar dados, so that seja possível interromper o rollout com segurança.
70. As a operadora, I want distinguir teste automatizado, sessão autenticada, julgamento humano, geração paga e produção, so that cada alegação tenha o nível de prova correto.
71. As a administradora de workspace, I want isolamento por workspace e perfil em toda leitura e escrita, so that uma marca nunca veja ou use dados de outra.
72. As a administradora de workspace, I want que IDs fornecidos pelo cliente sejam revalidados no servidor, so that referências cruzadas não burlem o isolamento.
73. As a administradora de workspace, I want que arquivos temporários de fonte sejam removidos após composição, so that o worker não acumule dados sensíveis ou lixo operacional.
74. As a administradora de workspace, I want que publicação e ativação sejam transacionais, so that falhas parciais não deixem duas versões ativas.
75. As a administradora de workspace, I want que hashes e versões apareçam na auditoria do Trabalho, so that decisões possam ser rastreadas sem depender de memória conversacional.

## Implementation Decisions

- **Escopo de produto:** o Córtex pertence ao perfil da marca e a primeira integração é exclusivamente com o Protocolo Peça única. Campanha continua sendo agrupamento opcional de Trabalhos e não participa do treinamento nesta entrega.
- **Nomenclatura:** “Córtex da Marca” é o nome de produto. Internamente, os módulos usam `brand-knowledge` e `brand-evidence` para evitar colisão com o Cortex conversacional e com o detector existente de conflito de marca em Mudar estilo.
- **Arquitetura mínima:** o Córtex é um grafo lógico persistido no PostgreSQL atual. Não haverá banco de grafos, busca vetorial ou serviço separado.
- **Persistência de conhecimento:** serão adicionadas somente duas estruturas de domínio: claims da marca e versões publicadas. As evidências permanecem em Brand Kit, referências do perfil, biblioteca de assets e decisões humanas existentes.
- **Modelo de claim:** cada claim possui chave controlada, tipo, valor estruturado, escopo, autoridade, confiança, estado, referências de evidência, versão do extrator e hash da fonte.
- **Vocabulário fechado:** a primeira versão cobre paleta, famílias e papéis tipográficos, logo primário e posicionamento, densidade e hierarquia, tratamento de imagem/grafismo e elementos visuais obrigatórios ou proibidos. Chaves arbitrárias não são aceitas.
- **Autoridade:** claims podem ser humanos, explícitos, medidos ou inferidos. Um claim inferido nunca se torna ativo sem publicação humana. Medição prova observações, mas não intenção semântica.
- **Estados de claim:** candidatos podem ser aprovados, rejeitados ou superseded. Conflito é derivado durante a compilação e não persistido como estado, evitando divergência entre valor e flag.
- **Evidência:** uma claim ativa exige ao menos uma fonte resolvível do mesmo workspace e perfil. A publicação falha se a fonte ou seu hash mudar depois da revisão.
- **Ingestão de guias:** guias visuais passam a ser persistidos como assets e vinculados ao perfil. A extração deixa de descartar a origem documental após atualizar o Brand Kit.
- **Revisão de assets:** uploads novos percorrem `pending_analysis → pending_approval → approved | archived`. A análise assíncrona não aprova. Consultas GET não promovem ou corrigem estados.
- **Legado:** assets já autoaprovados continuam disponíveis para compatibilidade do fluxo legado, são identificados como legados e não sustentam novas claims ativas até revisão humana.
- **Modos de asset:** `exact` é composto deterministicamente; `reference` é input visual sem autoridade factual; `rule` vira orientação textual e não consome slot de imagem.
- **Fontes oficiais:** exatidão tipográfica exige arquivo TTF ou OTF aprovado, família, peso, estilo, hash e confirmação de direito de uso. Um nome de fonte sem arquivo continua como orientação gerativa e é apresentado como limitação.
- **Segurança de fontes:** upload valida tipo, tamanho e assinatura do arquivo. O compositor usa armazenamento escopado, diretório temporário por execução e limpeza em `finally`.
- **Composição tipográfica:** o ADScale reutiliza Sharp/Pango para renderizar texto com arquivo de fonte explícito, wrapping, alinhamento, limite de caixa e RGBA. Não será adicionada dependência nova enquanto esse caminho atender ao corpus.
- **Layouts tipográficos:** a V1 oferece um conjunto limitado de planos por formato, como topo, centro e base. Não haverá editor livre nem engine genérica de templates.
- **Fallback tipográfico:** sem fonte aprovada, a Peça segue o comportamento legado e registra execução gerativa. O sistema não declara fidelidade tipográfica exata nesse caso.
- **Prompt de background:** quando a execução tipográfica for determinística, o gerador recebe instrução de produzir a base sem copy visível e reservar as áreas congeladas pelo plano.
- **Composição exata:** copy, fonte e assets exatos são aplicados depois da geração. O resultado guarda hashes da copy, fonte, plano e composição.
- **Overflow:** auto-fit respeita tamanho mínimo. Se o conteúdo não couber, o Trabalho falha com diagnóstico corrigível; texto nunca é cortado silenciosamente.
- **Contraste:** o compositor escolhe entre cores autorizadas ou placa prevista pelo plano. Ele não inventa uma nova cor para resolver legibilidade.
- **Comparadores de conflito:** cada chave escolhe um comparador explícito. Cores usam distância perceptual; fontes normalizam família, peso e estilo; assets literais usam key e hash; listas usam conjuntos; enums usam igualdade. Texto sem comparador seguro requer decisão humana.
- **Publicação:** o usuário publica um pacote versionado. O servidor recompila, valida evidências, resolve JSON canônico, calcula SHA-256 e ativa a nova versão na mesma transação que supersede a anterior.
- **Idempotência:** publicar conteúdo com o mesmo hash não cria versão duplicada.
- **Snapshot:** a confirmação de um Trabalho congela versão e hash do Córtex, claims publicados, exclusões, fontes, assets, plano tipográfico, seleção de referências e seus motivos.
- **Retrocompatibilidade:** snapshots antigos continuam legíveis. Perfil sem versão ativa ou flag desligado usa o caminho legado.
- **Separação factual:** identidade visual pode orientar paleta, linguagem e composição, mas não substitui pedido, briefing, copy, oferta ou fatos obrigatórios do Trabalho.
- **Fidelidade da marca:** o resultado de Brand Fidelity é separado do veredito objetivo e do julgamento subjetivo de direção de arte.
- **Checks determinísticos:** dimensão, formato, copy composta, fonte/hash usado, assets exatos, safe area, overflow e contraste podem produzir aprovação ou falha comprovada.
- **Paleta:** cobertura e distância de cor são medidas, mas fotografia não é reprovada por histograma genérico. Um gate de paleta exige claim publicada com regra e limiar aplicáveis.
- **Checks residuais:** elementos semanticamente proibidos, tratamento de imagem e gestalt podem ser avaliados por visão, mas retornam suspeita ou inconclusivo quando não forem comprováveis.
- **Autoridade do avaliador:** suspeita visual não reprova, não aciona retry, não corrige e não promove conhecimento. Falha do avaliador mantém a Peça disponível para decisão humana.
- **QA existente:** fatos, marca errada, contaminação de referência e conteúdo crítico continuam sob o veredito objetivo já existente. Composição comprovada não é reavaliada por OCR ou LLM.
- **Context pack:** a seleção existente e seus motivos são preservados. O limite inicial continua em quatro referências visuais; regras e assets exatos não consomem esses slots.
- **GPT Image 2:** o modelo continua no snapshot fixado existente e processa inputs de imagem em alta fidelidade. A spec não introduz `input_fidelity` configurável.
- **Medição:** o baseline reutiliza corpus humano, source composition, coverage e claims gates existentes. As tabelas de corpus não armazenam fatos da identidade porque dependem de Peças/Campanhas e têm outro ciclo de vida.
- **Feature flag:** a integração do Córtex com Peça única inicia desligada e pode ser revertida sem apagar claims, versões ou snapshots.
- **APIs:** a superfície expõe operações escopadas para listar/enviar/revisar assets, listar/enviar fontes, consultar claims, publicar uma versão e consultar a identidade congelada do Trabalho. Todas as mutações exigem autenticação e revalidam workspace/perfil no servidor.
- **Custos:** não há geração paga automática durante implementação ou validação local. Tokens e custo são reportados somente quando o provider ou ledger fornecer evidência verificável.
- **Rollout:** quatro versus oito referências é experimento posterior, autorizado e controlado. Dezesseis inputs permanecem fora de escopo.

## Testing Decisions

- **Princípio:** testes devem provar comportamento externo e invariantes de domínio, não a organização interna dos arquivos. Refactors que preservem o contrato não devem quebrar a suite.
- **Seam principal confirmado:** um único fluxo autenticado cobre `Brand Training do perfil → revisão/publicação da identidade → confirmação da Peça única → snapshot congelado → geração controlada → composição determinística → resultado com Brand Fidelity`.
- **Provider de aceitação:** o seam principal usa o provider E2E controlado já existente. Ele não chama um modelo pago e permite verificar estados, snapshots, composição, falhas e UI de forma repetível.
- **Cenário feliz:** o teste envia material, conclui análise controlada, revisa, publica uma versão, cria um Trabalho, confirma a copy, gera uma Peça, verifica pixels/camadas determinísticas e vê a versão e a fidelidade aplicadas.
- **Autoridade:** o fluxo deve provar que upload pendente e claim candidata não influenciam o snapshot; somente publicação humana altera a identidade consumida.
- **Imutabilidade:** depois de confirmar um Trabalho, editar ou publicar nova identidade não muda seu snapshot, prompt, plano de referências ou plano tipográfico.
- **Fallback:** perfil sem versão ativa e snapshot legado continuam criando e carregando Peças pelo caminho anterior.
- **Isolamento:** testes autenticados tentam referenciar asset, fonte, claim e versão de outro workspace/perfil e esperam falha sem vazamento de existência.
- **Consulta sem mutação:** testes de rota comprovam que listar treinamento nunca altera estado, auditoria ou versão.
- **Algoritmos com seam próprio:** magic bytes, escaping Pango, auto-fit, pixel stability, contraste, ΔE, normalização tipográfica, comparação de conjuntos, JSON canônico e SHA-256 recebem testes unitários porque falhas nesses algoritmos não são bem diagnosticadas apenas pelo fluxo alto.
- **Integração de persistência:** testes verificam transição de revisão, publicação transacional, versão ativa única, idempotência por hash, stale evidence e compatibilidade com dados legados.
- **Composição visual:** fixtures determinísticas comparam regiões e hashes esperados para texto e assets exatos. O teste não compara a base generativa inteira.
- **Brand Fidelity:** checks determinísticos devem mostrar esperado, observado, regra e fonte. Suspeita visual e erro do avaliador devem resultar em inconclusivo sem retry ou reprovação.
- **Baseline:** a mesma estrutura de relatório é usada antes e depois. Corpus vazio não passa; fixture sintética não libera claim de validação em cliente real; métricas ausentes permanecem nulas.
- **Cobertura humana:** o gate cobre os formatos 1:1, 4:5 e 9:16 e ao menos três padrões de conteúdo. Avaliação humana cega é separada de QA automatizado.
- **Economia e operação:** quando houver amostra autorizada, registrar p95, RSS, chamadas de imagem, referências usadas, tokens/custo disponíveis e aprovação humana por custo e tempo.
- **Acessibilidade:** telas de treinamento, conflito e fidelidade devem comunicar estados por texto e sem depender apenas de cor; upload, revisão e publicação devem funcionar por teclado.
- **Prior art:** reutilizar os padrões atuais dos testes de rotas de Brand Training, identidade e prompt do Creative Work, job de Peça única, composição Sharp, quality fixtures, production-pilot baseline e E2E de Criar post.
- **Migrações:** validar banco limpo e banco com assets autoaprovados/snapshots antigos. A migração não rebaixa ou apaga registros em massa.
- **Classes de prova:** reportar separadamente teste unitário, integração local, UI autenticada, avaliação humana, geração paga e produção. Uma classe nunca é apresentada como prova de outra.
- **Gate econômico:** o experimento quatro versus oito não faz parte da suite padrão e só roda após autorização explícita. O limite só muda se a avaliação humana melhorar sem regressão objetiva, econômica ou de latência.

## Out of Scope

- Uso do Córtex por Campanhas, Variações, Adaptar formatos ou Mudar estilo.
- Overlay ou memória específica de Campanha.
- Carrossel e outras Quick Tools.
- Editor visual livre ou sistema genérico de templates.
- Publicação em redes sociais.
- Fine-tuning ou treinamento do GPT Image.
- Banco de grafos, RDF, OWL, SPARQL, vector database ou novo serviço de conhecimento.
- Aprendizado automático a partir de Peças geradas.
- Aprovação automática de assets ou claims baseada em confiança.
- Resolução automática de conflitos sem comparador determinístico.
- Criação de fatos de briefing, oferta, preço ou benefício a partir de referências visuais.
- Uso operacional de dezesseis referências.
- Aumento automático de quatro para oito referências.
- Instalação de fonte encontrada apenas pelo nome.
- WOFF/WOFF2 na primeira versão.
- Verificação jurídica do licenciamento da fonte além da declaração explícita do usuário.
- Editor ontológico com chaves criadas pelo usuário.
- Migração destrutiva ou desativação em massa de assets legados.
- Geração paga, deploy ou promoção de produção sem autorização separada.

## Further Notes

- O Córtex da Marca não substitui o Cortex conversacional. O primeiro é identidade versionada e auditável; o segundo é o órgão conversacional do app.
- “Treinamento” continua significando estruturar, medir, revisar e publicar identidade. Não significa ajustar pesos de um modelo fundacional.
- A solução separa conhecimento e execução porque uma identidade correta ainda pode gerar pixels errados, e pixels determinísticos ainda podem obedecer a uma regra errada.
- O cold start é esperado. Uma marca com um logo e poucas referências terá poucos claims ativos. Nessa situação, Brand Kit explícito e composição determinística ainda entregam valor; o sistema não inventa uma identidade completa.
- O número de inputs é capacidade do provedor, não objetivo do produto. A política de referências é uma decisão de qualidade, custo e ruído baseada em evidência.
- O rollout deve preservar a linguagem do domínio: Trabalho para a unidade retomável, Peça para o resultado e Campanha apenas para o agrupamento opcional.
- O projeto só pode declarar o Córtex pronto quando o fluxo autenticado estiver comprovado e o gate humano/econômico estiver documentado. Testes verdes isoladamente não provam fidelidade percebida nem viabilidade de geração paga.

### Success Criteria

- Todo upload novo exige revisão humana antes de condicionar uma Peça.
- Toda claim publicada possui evidência resolvível e autoridade explícita.
- Nenhum conflito aberto entra em uma versão ativa.
- Toda Peça com fonte oficial registra hashes da fonte, copy e plano usados.
- Nenhuma suspeita produzida por LLM promove conhecimento, reprova ou corrige automaticamente.
- Trabalhos confirmados permanecem imutáveis após mudanças no Córtex.
- Perfis e Trabalhos legados continuam operacionais.
- Nenhum dado cruza workspace ou perfil.
- Peça única é o único consumidor habilitado nesta spec.
- O rollout só avança com melhoria humana mensurável sem regressão objetiva, econômica ou de latência.
