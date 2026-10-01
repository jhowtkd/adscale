# Mesa, barra e conversa do piloto · ticket 09

Capturas de 01/10/2026, Chromium (Playwright) contra `next dev`, tema escuro (o app força o escuro), movimento reduzido. Os dados (marca Café Aurora, imagens, cores, o diagnóstico) são **fixtures sintéticas**: o banco de teste recebe o estado do handoff e as mensagens de cada passo, e as imagens são geradas na hora. Nenhuma leitura de site ou Instagram, chamada paga ou escrita em produção. Os arnês e as fixtures são temporários e não estão versionados. As referências são os PNGs da v4 (`docs/design/pen/telas-v4/`) e, onde a v4 não desenha a tela, os da v3.

| Evidência | O que mostra | Limite |
| --- | --- | --- |
| [H1 lado a lado](h1-comparison.png) · [desktop](h1-implemented-desktop.png) | 1ª abertura: o leque grande de 5 inspirações, a fala de abertura do Estrategista e o card "Qual é o site da sua marca?" | A v4 mostra o endereço já digitado e a promessa "Leva uns 3 minutos" (ver diferenças) |
| [H2](h2-comparison.png) | Leitura em andamento: o leque compacto da marca, com as cartas de logo e paleta e as cartas "na fila" dos grupos ainda lendo | Sem foto do site porque o grupo de imagens ainda está na fila, como no PNG |
| [H3](h3-comparison.png) · [H4](h4-comparison.png) · [H5](h5-comparison.png) · [H6](h6-comparison.png) | Os passos de identidade, redes, imagens e resumo dentro da conversa v4: linhas dos eventos, fala do Estrategista, card do passo e compositor | O interior dos cards é do ticket 04 e não foi redesenhado aqui |
| [D1](d1-comparison.png) · [desktop](d1-implemented-desktop.png) | O diagnóstico na conversa, depois da linha "Biblioteca montada · N itens" | O número de itens é o real da marca (8 na fixture; o PNG mostra 26) |
| [B1](b1-comparison.png) · [Biblioteca](library-desktop.png) | A Biblioteca da marca dentro do shell v4 | O painel de filtros e a grade são do ticket 07 |
| [B2](b2-comparison.png) | Criações vazia, com as iscas fixas | Ver diferenças |
| [Ideias vazia](ideas-empty-desktop.png) · [Metas vazia](goals-empty-desktop.png) | Telas vazias com as iscas fixas, na linguagem do B2 | A v4/v3 só desenham essas telas com conteúdo |
| [Mobile: 1ª abertura](mobile-first-open.png) · [leitura](mobile-reading.png) · [diagnóstico](mobile-diagnosis.png) · [folha Conversas](mobile-conversations-sheet.png) · [Biblioteca](mobile-library.png) · [Criações vazia](mobile-creations-empty.png) | 390×844 a 2×: barra inferior com Conversa, Criações, Biblioteca e Mais; o seletor Painel/Pipeline e o sino no topo; leque de 3 cartas; as conversas numa folha | Sem desenho mobile na v4: segue a lógica do desktop. A página da Biblioteca empilha o painel de filtros no topo como já fazia |
| [768 px](tablet-768-reading.png) | O painel de conversas só aparece a partir de 1024 px; abaixo disso o botão "Conversas" abre a folha | Sem desenho na v4 |

## Diferenças conscientes

- **Seletor Painel | Pipeline:** o estado ativo usa as cores do sistema, sem o gradiente roxo → pêssego do PNG. O seletor já seguia a regra do produto de não usar gradientes nem acentos roxos.
- **Fala de abertura sem tempo:** o PNG diz "Leva uns 3 minutos". O tempo até o diagnóstico não foi medido com os fornecedores reais e a maior parte dele é a geração do diagnóstico e a pessoa confirmando os passos; a medição possível e a conclusão estão nas notas de implementação.
- **Decisões como linhas, não como balões:** o PNG H2 mostra o endereço digitado como um balão da pessoa. Aqui o card da fonte tem o campo e a decisão vira a linha "Você informou a fonte da marca", o registro das decisões dos cards do ticket 04.
- **Compositor:** sem o "+" de anexo (a conta grátis recusa imagens) e sem o microfone (o produto não tem ditado).
- **Criações:** reaproveita a página de trabalhos; muda o título, a ação "Criar" e a tela vazia. O painel de filtros do PNG fica como está hoje na página.
- **Mesa que rola:** a mesa fica no topo da rolagem da conversa, como no plano, e sai de vista quando a conversa passa de uma tela. Os PNGs mostram só a troca mais recente.

Estas capturas não comprovam a leitura real, a geração do diagnóstico pelo modelo, a conta recém-criada em produção nem a aceitação visual humana.
