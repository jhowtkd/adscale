# Evolução do treinamento de marca — entrevista

Data: 2026-09-13. Definição funcional consolidada a partir das decisões confirmadas na entrevista; detalhamento técnico pendente. Este registro não é evidência de implementação.

## Necessidade confirmada

O treinamento deve sustentar um trabalho de designer gráfico sênior: analisar o problema de comunicação, identificar oportunidades de composição, criar, criticar e refinar. O resultado atual foi descrito pelo operador como superficial, com pouco polimento e composição técnica insuficiente. O repertório deve abranger as pessoas presentes nas artes e os padrões visuais recorrentes.

O operador esclareceu que a ambição de qualidade é geral, sem restringir a evolução a uma marca ou campanha, e forneceu `/Users/jhonatan/Downloads/Artes` como repertório visual para esta discussão. Não é necessário escolher uma única marca para definir essa ambição.

## Decisões confirmadas

- A direção de arte pode abandonar uma composição correta, mas fraca, e criar outra antes de apresentar o resultado, dentro de um orçamento por Trabalho. A crítica deve justificar a tentativa com um problema concreto e uma intervenção. Direção registrada no [ADR 0015](../adr/0015-refinamento-criativo-com-orcamento.md).
- Ao esgotar o orçamento sem alcançar a qualidade esperada, apresentar a melhor Peça válida com pendências explícitas e deixar uma nova rodada à decisão do operador. A apresentação não equivale a aprovação de qualidade e não altera o termo Rascunho, que designa um estado do Trabalho no glossário.
- As pessoas são pessoas humanas presentes nas artes. O operador pode atribuir nomes e citá-las nos briefings para utilizar a pessoa correspondente na composição.
- O repertório deve contemplar tanto pessoas específicas quanto a maneira como a marca trabalha a presença humana na composição.
- Há liberdade para criar novas poses, roupas e cenas a partir das referências de uma pessoa, desde que suas características anatômicas sejam preservadas. Essa liberdade não se restringe ao uso literal da fotografia enviada.
- Uma marca pode manter várias linguagens visuais, como institucional, comercial e educativa, sobre uma identidade comum. O treinamento deve aprender as linguagens separadamente e seus contextos de aplicação; elas podem ser citadas no briefing, e a direção de arte deve escolher uma composição adequada ao pedido.
- A revisão do aprendizado deve ser visual e consolidada por lote: mostrar padrões, linguagens, pessoas, exemplos de suporte e dúvidas; permitir nomear pessoas, corrigir interpretações e aprovar o conjunto antes de ativá-lo.
- Cada rodada de treinamento deve incluir calibração por imagens: gerar várias Peças de teste, colher a avaliação do operador sobre estarem boas ou não e usar esse feedback para ajustar o aprendizado. A calibração se soma à revisão visual consolidada; seu resultado deve orientar trabalhos futuros da marca.
- A nova versão do treinamento só entra em uso após a validação humana dos exemplos da calibração. A versão anterior permanece ativa durante os ajustes, conforme o [ADR 0016](../adr/0016-ativacao-treinamento-apos-calibracao.md).
- O lote padrão de calibração é de quatro imagens por rodada, cobrindo aspectos diferentes do aprendizado. As rodadas seguintes focam nos problemas apontados e preservam o que já funcionou.
- O teto inicial é de três rodadas por treinamento — uma inicial e duas de ajustes —, totalizando até 12 imagens. Encerrar antes se o operador aprovar. Se ainda não estiver adequado ao atingir o teto, manter a nova versão pendente e deixar a abertura de outra rodada à decisão do operador.

Os termos Direção de arte, Pessoa da marca, Linguagem visual da marca e Calibração da marca estão no [glossário](../../CONTEXT.md).

## Detalhamento técnico pendente

- Como identificar e apresentar as linguagens na revisão visual consolidada, preservando a distinção entre identidade comum e padrões de cada contexto.
- Como avaliar fidelidade anatômica a partir das referências disponíveis e proceder quando elas forem insuficientes ou o resultado for inconclusivo.
- Como resolver nomes ambíguos e organizar várias referências da mesma pessoa.
- Orçamento e unidade de contagem das tentativas de refinamento de um Trabalho, distintos do teto de três rodadas de calibração do treinamento.
- Cálculo e apresentação do custo da calibração, contabilização de falhas e cobertura dos exemplos dentro do teto de quatro imagens por rodada e três rodadas.
- Como transformar avaliações positivas e negativas em aprendizado específico sem presumir o motivo de cada julgamento.
- Como gerar exemplos usando a versão candidata do conhecimento sem ativá-la para outros Trabalhos, mantendo o vínculo entre a versão avaliada e a versão posteriormente ativada.

## Fluxo de calibração proposto

O ciclo deve tornar visível o efeito do feedback: analisar o lote, apresentar o entendimento da marca, gerar o lote padrão de quatro Peças de teste, receber avaliações, ajustar o entendimento e apresentar novos exemplos quando necessário. O teto inicial é de três rodadas e até 12 imagens, com encerramento antecipado por aprovação. A ativação depende da validação humana dos exemplos; atingir o teto sem aprovação mantém a versão pendente.

Recomendações para detalhar esse fluxo:

- Oferecer avaliação rápida por imagem e comentário opcional. Uma rejeição sem explicação é um sinal de insatisfação; não prova, isoladamente, que a cor, a pessoa ou o layout seja o motivo.
- Cobrir os aspectos e linguagens presentes naquele treinamento. Comparações com o mesmo briefing podem ajudar a separar preferências de composição de preferências pelo assunto.
- Vincular o feedback ao exemplo, à linguagem e ao entendimento usados naquela rodada; mostrar o que mudou na rodada seguinte.

Condição de ativação confirmada: manter o conhecimento ativo anterior enquanto uma nova rodada estiver em revisão ou calibração. No primeiro treinamento, a nova versão permanece pendente até a validação.

## Leitura do repertório fornecido

Inspeção local de 47 arquivos de imagem, com 46 conteúdos únicos por SHA-256: visão geral de todos por pranchas de contato e abertura individual de oito exemplos para observar detalhes. Os arquivos `8feebbd176fd2b3ae80e78ea56a2b9b8.jpg` e `8feebbd176fd2b3ae80e78ea56a2b9b8 (1).jpg` são duplicados; os originais foram preservados.

As imagens abrangem comunicação educativa, serviços, eventos, esporte e divulgação de design, com tratamentos minimalistas, tipográficos, fotográficos, colagens e efeitos luminosos. O conjunto serve para discutir amplitude de repertório e capacidade de execução; não define uma única linguagem de marca nem uma obrigação de reproduzir cada detalhe.

| Referência na pasta Artes | Leitura visual | Capacidade a desenvolver |
| --- | --- | --- |
| `11.09_[ESEG] Programa Internacional_Feed 2.jpg` | A janela de avião enquadra uma sala de aula; a fotografia, a moldura e o texto conectam estudo a viagem. | Conceber uma relação visual entre mensagem, pessoa e cenário, além de selecionar uma fotografia pelo assunto. |
| `1455ee3dbdf970379ca2569d11cf87b1.jpg` | A repetição dos assentos cria ritmo e contexto; uma pessoa isolada e dois grandes blocos tipográficos organizam a leitura. | Usar escala, repetição, contraste e espaço para construir foco e narrativa. |
| `7552de19da71fba66acbd322bb7b7845.jpg` | A fotografia tem borda de selo, o carimbo sobrepõe a montagem e a textura relaciona imagem e tipografia. | Fazer materiais, máscaras, sobreposições e acabamento participarem da ideia visual. |
| `fe07c50b5a625fdf5b654b37d0b99b07.jpg` | Duas fotografias em escalas diferentes, diagonais corporais e blocos de cor articulam o pôster esportivo. | Integrar a pessoa à composição e escolher cortes e escalas que sustentem movimento e hierarquia. |
| `Prancheta 14-100.jpg` | Molduras em perspectiva, faixas de luz, bordas luminosas e tratamento cromático envolvem o retrato. | Coordenar profundidade, luz e cor entre pessoa, suporte gráfico e ambiente. Efeitos devem ser adequados à linguagem, sem proibições estéticas universais. |
| `Prancheta 4-100.jpg` | O enquadramento do retrato, o fundo de faixas, a marca vertical e as etiquetas sobrepostas têm funções diferentes na hierarquia. | Planejar a distribuição de retrato, assinatura, título e informações auxiliares como conjunto. |
| `CENBRAP_Black November_Feed 2.png` | Oferta em blocos de escalas diferentes, retrato em primeiro plano, fundo com textura e iluminação lateral. | Equilibrar força comercial, presença humana e acabamento, preservando leitura. |
| `8feebbd176fd2b3ae80e78ea56a2b9b8.jpg` | A prancha reúne peças com curvas verdes, fotografias e pequenos elementos recorrentes, alternando distribuição, escala e fundo. | Aprender invariantes e possibilidades de variação de uma série, sem confundir consistência com repetição de um layout. |

### Implicações propostas para o treinamento e a direção de arte

Estas são recomendações derivadas da inspeção, ainda não uma decisão de arquitetura:

- Ler relações entre elementos: o que domina, o que apoia, o que conecta a imagem à mensagem, quais sobreposições ajudam e onde é necessário respiro.
- Distinguir uma técnica de design transferível de uma regra de determinada marca. Uma moldura, uma colagem ou um efeito de luz encontrado nesta pasta não se torna obrigatório para todas as marcas.
- Formar repertório de tipografia como composição: escala relativa, peso, largura, entrelinha, agrupamento e quebra de linha; não limitar a leitura ao nome da fonte.
- Aprender acabamento contextual: recortes, sombras, perspectiva, textura e coerência de iluminação e cor, com evidências visuais.
- Usar referências para sustentar a crítica com uma falha específica e uma intervenção, e comparar a revisão com a versão anterior para verificar se houve melhoria.
- Evitar transformar toda referência fornecida em um exemplo perfeito. O rodapé do pôster das arquibancadas tem contraste mais limitado; no arquivo CENBRAP Black November há um pequeno texto `Feed` sobre o jaleco, que parece residual e mereceria revisão. Isso não anula o valor compositivo das referências.

Não foram comparadas essas imagens com resultados atuais do produto, nem aferida a fidelidade anatômica das pessoas contra fotografias de origem. A inspeção torna o objetivo visual mais concreto, mas não comprova qual mudança técnica produzirá esse nível de resultado.

## Evidência local que orientou a entrevista

- A [análise de treinamento](../../app/src/server/jobs/brand-training.ts) trata arquivos individualmente e propõe categoria, regras e estrutura visual.
- O [compilador de conhecimento](../../app/src/server/brand-knowledge/candidate-compiler.ts) consolida regras e tratamentos; o [contrato de conhecimento](../../app/src/server/brand-knowledge/contracts.ts) não representa uma pessoa nomeada com identidade própria.
- No [fluxo direto de geração](../../app/src/server/jobs/creative-work.ts), a avaliação subjetiva é consultiva; a correção automática examinada responde a falhas objetivas.
- Já há [registro de sinais de calibração](../../app/src/server/brand-taste/calibration-signal-recorder.ts), [extração de regras candidatas](../../app/src/server/brand-taste/rule-extraction.ts) e [aplicação de regras aprovadas ao prompt](../../app/src/server/brand-taste/prompt-calibration-loader.ts). A integração direta encontrada para esse carregamento está no job legado de derivação, e o contrato de sinais exige campanha e derivação. A extração examinada agrupa divergências de julgamento e gera justificativas genéricas; não equivale ao ciclo visual por treinamento proposto aqui. São componentes a avaliar para reaproveitamento, sem criar uma campanha obrigatória para o treinamento.

Essas observações descrevem o código inspecionado, sem validação de geração real ou de comportamento em produção nesta entrevista.
