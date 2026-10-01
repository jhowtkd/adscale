# Mesa, barra e conversa do piloto · ticket 09

Capturas de 01/10/2026, Chromium (Playwright) contra `next dev` com o gate ligado, tema escuro (o app força o escuro), movimento reduzido, fuso de São Paulo. Os dados (marca Café Aurora, imagens, cores, o diagnóstico) são **fixtures sintéticas**: o banco de teste recebe o estado do handoff e as mensagens de cada passo, e as imagens são desenhadas na hora. Nenhuma leitura de site ou Instagram, chamada paga ou escrita em produção. **Os estados saem do roteiro versionado `app/scripts/pilot-states.ts`** (como rodar, mais abaixo): quem revisa reproduz qualquer passo sem Inngest, leitor nem modelo. As referências são os PNGs da v4 (`docs/design/pen/telas-v4/`) e, onde a v4 não desenha a tela, os da v3.

| Evidência | O que mostra | Limite |
| --- | --- | --- |
| [H1 lado a lado](h1-comparison.png) · [desktop](h1-implemented-desktop.png) | 1ª abertura: o leque grande de 5 inspirações, a fala de abertura do Estrategista e o card "Qual é o site da sua marca?" | A v4 mostra o endereço já digitado e a promessa "Leva uns 3 minutos" (ver diferenças) |
| [Depois da 1ª resposta](answered-compact-desktop.png) · [celular](mobile-answered.png) | O leque compacto, sem título cortado nas cartas; no celular a mesa já fica fixa | Os títulos das inspirações só aparecem no leque grande (ver diferenças) |
| [H2](h2-comparison.png) · [1024](tablet-1024-reading.png) · [768](tablet-768-reading.png) · [390](mobile-reading.png) | Leitura em andamento: a mesa **fica fixa no topo** com a marca se montando (logo, paleta e as cartas "na fila"), em todas as larguras, com a conversa rolada até o fim | A foto do site só entra quando o grupo de imagens termina (ver diferenças) |
| [H3](h3-comparison.png) · [H4](h4-comparison.png) · [H5](h5-comparison.png) · [H6](h6-comparison.png) · [H5 no celular](mobile-images.png) | Os passos de identidade, redes, imagens e resumo dentro da conversa v4, com a mesa fixa: linha da decisão, fala do Estrategista, card do passo e compositor | O interior dos cards é do ticket 04 e não foi redesenhado aqui |
| [1366×650 H3](laptop-1366x650-identity.png) · [H6](laptop-1366x650-summary.png) | Um notebook de 1366×768 com as barras do navegador: a mesa fixa deixa pouco espaço, então a conversa descansa com o **topo do card logo abaixo da mesa**, com "Passo N de 6", o título e as primeiras linhas à vista; os botões ficam uma rolagem abaixo | A fala acima do card se esvai sob o esmaecimento, como tudo que rola sob a mesa |
| [Redes no celular 390](mobile-networks.png) · [360](mobile-360-networks.png) | O card das redes cabe na largura: caixas de seleção, campo do @ e "Confirmar" dentro do card; o endereço quebra depois da barra ou do ponto | Imagens e endereços sintéticos |
| [Mesa na fase Biblioteca](mesa-biblioteca-desktop.png) · [celular](mesa-biblioteca-mobile.png) | Depois do "É isso": a mesa mostra a marca guardada (fotos do site e do Instagram, logo e paleta), as linhas "Você confirmou sua marca" e "Biblioteca montada · 7 itens" (sem uma fala do Estrategista só com a palavra "Resumo" antes delas), a fala "Sua marca está confirmada" e o aviso do diagnóstico sendo montado. Daqui em diante a mesa não fica mais fixa: rola com a conversa | As fotos são sintéticas |
| [D1](d1-comparison.png) · [desktop](d1-implemented-desktop.png) · [celular](mobile-diagnosis.png) | O diagnóstico na conversa, depois da linha "Biblioteca montada" | O número de itens é o real da fixture (7: o logo, 5 imagens e 1 página do site); o PNG mostra 26 |
| [B1](b1-comparison.png) · [Biblioteca](library-desktop.png) · [celular](mobile-library.png) | A Biblioteca **da marca da conta**, dentro do shell v4, sem escolher marca | O painel de filtros e a grade são do ticket 07; no celular o painel ocupa a primeira tela |
| [Biblioteca vazia](library-empty-desktop.png) · [celular](mobile-library-empty.png) | Conta nova: "A Biblioteca ainda está vazia" com as iscas fixas | O PNG da v4 só desenha a Biblioteca com conteúdo |
| [B2](b2-comparison.png) | Criações vazia, com as iscas fixas | Ver diferenças |
| [Ideias vazia](ideas-empty-desktop.png) · [Metas vazia](goals-empty-desktop.png) | Telas vazias com as iscas fixas, na linguagem do B2 | A v4/v3 só desenham essas telas com conteúdo |
| [Mobile: 1ª abertura](mobile-first-open.png) · [folha Conversas](mobile-conversations-sheet.png) · [Criações vazia](mobile-creations-empty.png) | 390×844 a 2×: barra inferior com Conversa, Criações, Biblioteca e Mais; o seletor Painel/Pipeline e o sino no topo; leque de 3 cartas; as conversas numa folha | Sem desenho mobile na v4: segue a lógica do desktop |
| [768 px](tablet-768-reading.png) · [1024 px](tablet-1024-reading.png) | O painel de conversas só aparece a partir de 1024 px; abaixo disso o botão "Conversas" abre a folha | Sem desenho na v4 |

## Como reproduzir

Os estados do handoff, do diagnóstico e da mesa dependem do leitor de site, do leitor de Instagram, do Inngest e do modelo. O roteiro escreve o que cada passo deixa no banco, direto por SQL, num **banco de teste descartável** (o nome tem de terminar em `_test`; ele recusa qualquer outro) e nas imagens do armazenamento local do servidor.

```bash
cd app
# 1. um banco descartável, com nome terminado em _test, migrado
export DATABASE_URL=postgres://localhost:5432/pilot_prints_test TEST_DATABASE_URL=$DATABASE_URL
npm run db:migrate

# 2. o servidor com o gate ligado e os leitores de mentira (o resto do ambiente, com valores de mentira, é o do .env.example)
export EQUIPE_ENABLED=true EQUIPE_PILOT_WORKSPACES='*' SITE_READER_PROVIDER=fake INSTAGRAM_READER_PROVIDER=fake
export E2E_CONTROLLED_PROVIDER=true E2E_STORAGE_DIR=/tmp/adscale-e2e-storage
npx next dev --webpack

# 3. em outro terminal, com as mesmas variáveis: um usuário (o seed do visual cria visual-foundations@example.test, senha
#    VisualFoundations123!), que entra e abre / uma vez, o que cria a conta grátis; depois os estados
npx tsx scripts/seed-visual-foundations.ts
npx tsx scripts/pilot-states.ts inspirations <email>      # as 5 inspirações curadas (mesa grande)
npx tsx scripts/pilot-states.ts handoff <email> <passo>   # e recarregue a página
```

Passos (cada um é completo em si, na ordem que quiser): `reset` (1ª abertura), `answered`, `reading` (H2), `identity` (H3), `networks` (H4), `images` (H5), `summary` (H6), `done` (Biblioteca montada, diagnóstico em andamento) e `diagnosis` (D1). Para a Biblioteca da marca, abra `/library` depois de `done` ou `diagnosis`; depois de `reset` ela está vazia. `PILOT_STATES_AT=2026-10-01T13:02:00Z` fixa a hora das mensagens (10:02 em São Paulo), como nas capturas.

As capturas usam 1440×900, 1366×650 e 1024×768 (desktop), 768×1024 (tablet) e 390×844 e 360×740 a 2× (celular), com o gate ligado e a conversa como a pessoa a vê quando ela abre; a "mesa na fase Biblioteca" é a conversa rolada ao topo. O E2E do piloto (`tests/e2e/home-rail-assistant.spec.ts`) usa o mesmo roteiro para conferir, em cada passo e em cinco janelas, que o card abre com o topo abaixo da mesa, que nada desliza de lado e que o axe não acha nada.

## Diferenças conscientes

- **Seletor Painel | Pipeline:** o estado ativo usa as cores do sistema, sem o gradiente roxo → pêssego do PNG. O seletor já seguia a regra do produto de não usar gradientes nem acentos roxos.
- **Fala de abertura sem tempo:** o PNG diz "Leva uns 3 minutos". O tempo até o diagnóstico não foi medido com os fornecedores reais e a maior parte dele é a geração do diagnóstico e a pessoa confirmando os passos; a medição possível e a conclusão estão nas notas de implementação.
- **Decisões como linhas, não como balões:** o PNG H2 mostra o endereço digitado como um balão da pessoa. Aqui o card da fonte tem o campo e a decisão vira a linha "Você informou a fonte da marca", o registro das decisões dos cards do ticket 04.
- **Compositor:** sem o "+" de anexo (a conta grátis recusa imagens) e sem o microfone (o produto não tem ditado).
- **Criações:** reaproveita a página de trabalhos; muda o título, a ação "Criar" e a tela vazia. O painel de filtros do PNG fica como está hoje na página.
- **Mesa fixa enquanto a marca é lida:** o plano diz que a mesa rola junto com a conversa, mas a conversa já passa de uma tela no passo 2 e a mesa saía de vista justo quando a marca se monta. Ela fica **fixa e compacta no topo** da conversa desde a primeira resposta da pessoa até o "É isso" (205 px no desktop e 132 px no celular, com um esmaecimento de 28 px por baixo, para o que rola sob ela sumir em vez de ser cortado) e, a partir do "É isso", rola com a conversa. Numa janela baixa ela encolhe para no máximo 28% da altura, e abaixo de 600 px de altura (um celular deitado, por exemplo) deixa de ser fixa e rola com a conversa, para não tomar a tela do card que a pessoa está respondendo. Os PNGs da v4 mostram só a troca mais recente.
- **Onde a conversa descansa com a mesa fixa:** quando o card do passo cabe no espaço que a mesa deixa, a conversa termina no fim da lista, como sempre; quando não cabe (janelas baixas), ela para com o **topo do card logo abaixo da mesa**, não com o fim dele, e a região reserva a altura da mesa (`scroll-padding-top`), então o foco do teclado nunca fica atrás dela. O preço: nessas janelas os botões do card ficam uma rolagem abaixo, e a fala acima do card se esvai sob o esmaecimento.
- **A conversa não desliza de lado:** o esmaecimento e as cartas giradas passam da largura da mesa; ficam cortados na largura da conversa, para não alargar a região de rolagem.
- **Títulos das inspirações e legenda da paleta:** o leque grande da 1ª abertura os mostra; o compacto e o do celular se esvaem embaixo, onde o título e a legenda "Paleta · N cores" ficariam, então eles viram só texto para leitor de tela.
- **Foto do site no passo 2:** o PNG H2 já tem uma foto do site no leque com "Imagens" na fila. Aqui a foto só entra quando o grupo de imagens termina, porque a mesa usa só o que o leitor já guardou na conta.
- **Número de itens:** "Biblioteca montada · N itens" mostra o que foi guardado de verdade (7 na fixture), não os 26 do PNG.

## Acessibilidade dos estados

axe-core (wcag2a e wcag2aa) nos nove estados do roteiro, em 1280×800 e 390×844: nenhuma violação. A conversa com o diagnóstico em andamento (`done`) tinha uma, `scrollable-region-focusable`: a conversa passa de uma tela e nada nela recebe foco, então o teclado não rolava. A região agora é um `region` com nome ("Mensagens da conversa") que recebe foco, só no shell do piloto. O documento do diagnóstico fecha por um botão "Fechar", e cada imagem do passo das imagens se chama pela posição e pela origem ("Remover imagem 3, do site"), nunca por um identificador. O E2E repete o axe em cada passo (leitura, identidade, redes, imagens e resumo) em 1280×720 e 390×844.

Estas capturas não comprovam a leitura real, a geração do diagnóstico pelo modelo, a conta recém-criada em produção nem a aceitação visual humana.
