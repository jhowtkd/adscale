# Fundo do logo · ticket 16

Capturas de 02/10/2026 do ticket 16 (um logo transparente com partes claras some na carta de logo da mesa e na cópia que a visão lê). Chromium (Playwright) contra `next dev` com o gate ligado, tema escuro, movimento reduzido, fuso de São Paulo, banco de teste descartável e leitores de mentira. **Antes** é a `main` em `2cb6114d`, num servidor à parte (porta 3952) sobre o mesmo banco; **depois** é esta branch. Os dados são os da marca sintética Café Aurora (`app/scripts/pilot-states.ts`) com o logo trocado (`PILOT_STATES_LOGO`, abaixo). O logo do dono é o arquivo público do site dele (`Conteudo-Logo-3.svg`, conteudomartech.com.br), baixado **uma vez** (uma requisição GET) e desenhado pelo próprio desenhista do servidor (o PNG de 1024×198 que a leitura guardaria); nenhum outro arquivo do site foi lido e nenhum fornecedor foi chamado, exceto a **única comparação com o modelo real** da seção "Paleta" (só a Anthropic, sem banco, sem armazenamento). Os nomes terminam em `d1440` (desktop, 1440×900) e `m390` (celular, 390×844 a 2×); `-mesa` é o recorte da mesa.

Cada captura vem do mesmo estado do banco nos dois servidores: o dado que o servidor gravou (`metadata.surface` do ativo e `surface` do item do handoff) está lá no "antes" também, e o código antigo o ignora. Por isso a diferença entre os dois é só o código.

| Cena | Antes | Depois | O que mostra |
| --- | --- | --- | --- |
| **a · logo do dono, passo Identidade** | [desktop](a-dono-identidade-antes-d1440.png) · [celular](a-dono-identidade-antes-m390.png) | [desktop](a-dono-identidade-depois-d1440.png) · [celular](a-dono-identidade-depois-m390.png) | A mesa fixa durante a leitura. Antes, a carta de logo (creme) engole "Conteúdo", que o arquivo pinta de branco; só "Martech" e os colchetes aparecem. Depois, a carta usa a chapa escura do cartão da paleta e o logo aparece inteiro. A linha "Logo" do cartão (fundo escuro) não mudou e já mostrava o logo inteiro |
| **b · logo do dono, Resumo** | [desktop](b-dono-resumo-antes-d1440.png) · [celular](b-dono-resumo-antes-m390.png) · [recorte da mesa](b-dono-resumo-antes-d1440-mesa.png) | [desktop](b-dono-resumo-depois-d1440.png) · [celular](b-dono-resumo-depois-m390.png) · [recorte da mesa](b-dono-resumo-depois-d1440-mesa.png) | A mesa de cinco cartas (foto, logo, foto, paleta, foto) e o resumo com o logo (cartão escuro, igual nos dois) |
| **c · logo do dono, mesa depois do "É isso"** | [desktop](c-dono-biblioteca-mesa-antes-d1440.png) · [celular](c-dono-biblioteca-mesa-antes-m390.png) | [desktop](c-dono-biblioteca-mesa-depois-d1440.png) · [celular](c-dono-biblioteca-mesa-depois-m390.png) | A mesa na fase Biblioteca (conversa rolada ao topo). Aqui o dado vem do ativo (`metadata.surface`), não do estado do handoff: o logo também aparece inteiro |
| **d · a página Biblioteca (lugar que ficou como está)** | | [desktop](d-dono-biblioteca-pagina-depois-d1440.png) · [celular](d-dono-biblioteca-pagina-depois-m390.png) | O cartão de identidade da Biblioteca tem fundo escuro (`--surface-raised`) e mostra "Conteúdo Martech" inteiro, sem mudança. Não há cartão de fundo claro para trocar |
| **e · um logo escuro comum, Resumo** | [desktop](e-escuro-resumo-antes-d1440.png) · [celular](e-escuro-resumo-antes-m390.png) | [desktop](e-escuro-resumo-depois-d1440.png) · [celular](e-escuro-resumo-depois-m390.png) | Logo de tinta escura sobre fundo transparente (`PILOT_STATES_LOGO=dark`): foi medido como `light` e **continua como hoje**, sobre a chapa creme. As duas capturas são iguais |
| **f · logo escuro comum, mesa na Biblioteca** | [desktop](f-escuro-biblioteca-mesa-antes-d1440.png) | [desktop](f-escuro-biblioteca-mesa-depois-d1440.png) | Idem, na fase Biblioteca |
| **g · logo claro sintético, Resumo** | [desktop](g-claro-resumo-antes-d1440.png) · [recorte](g-claro-resumo-antes-d1440-mesa.png) | [desktop](g-claro-resumo-depois-d1440.png) · [recorte](g-claro-resumo-depois-d1440-mesa.png) | O mesmo formato do logo do dono (palavra branca grossa, nome e dois colchetes em degradê ciano-roxo, só formas, sem fontes), para quem quiser reproduzir sem o arquivo do dono (`PILOT_STATES_LOGO=light`) |
| **h · logo enviado pela pessoa** | | [SVG do dono](h-envio-svg-dono-depois-d1440.png) · [PNG de tinta clara](h-envio-png-claro-depois-d1440.png) · [PNG de tinta escura](h-envio-png-escuro-depois-d1440.png) | Em "Editar Logo", pela rota real (`POST /api/workspace/assets` com `handoffId` e `purpose=logo`): o servidor mede o PNG (o SVG é desenhado antes, no processo filho) e a mesa troca a chapa na hora: SVG do dono e PNG claro, chapa escura; PNG escuro, chapa creme. No banco: `surface` `dark`, `dark`, `light` |
| **j · o que a visão lê** | [cópia do logo, achatada sobre branco](j-visao-copia-antes.jpg) | [cópia do logo, achatada sobre o grafite](j-visao-copia-depois.jpg) | As duas cópias que a chamada de visão recebeu na comparação com o modelo real (abaixo). Antes, "Conteúdo" não está na imagem; depois, está |

## Paleta com o modelo real

Uma comparação, só com a chave da Anthropic (Opus, `claude-opus-5-5`, esforço `high`, o mesmo cliente, o mesmo schema de saída e o mesmo `createSiteVision` do app; as imagens seguem inline em base64 em vez de por URL, porque o armazenamento local não tem endereço público). **Banco local nenhum, nenhum outro fornecedor.** A leitura do site é o `identity()` de verdade, com o download de mentira servindo o SVG do dono: o SVG é saneado, desenhado, medido e guardado, e a cópia da visão é feita pelo código de cada lado (a `main` e esta branch). Entradas iguais nas duas rodadas:

- as **cores candidatas** que o fornecedor registrou para o site do dono no teste do ticket 12 (fixture `readers/fixtures/firecrawl-conteudomartech-home.json`, nenhuma requisição nova): `#0178E6`, `#B06BFF`, `#FFFFFF`, `#0E0914`, `#CC3366`, e a fonte `Inter`;
- como **nenhum site foi lido**, a captura de página é um quadro branco de 1280×720. Isto isola o que o ticket muda (a cópia do logo e a frase do prompt), mas **não é uma leitura real do site**: com a captura de verdade a paleta pode sair diferente.

| Rodada | Código | Cópia do logo | Prompt | Paleta devolvida (3 chamadas cada) | Entrada / saída (tokens) |
| --- | --- | --- | --- | --- | --- |
| antes | `main` | branco | `equipe-prompts/v4` | `#B06BFF`, ciano (`#22E4F9`, `#1EE8FF`, `#1CE6F8`), `#0E0914`, `#FFFFFF` nas 3 | 1.677 / 446 a 552 |
| depois, 1ª frase | `e6859311` | grafite `#17191d` | v5 + frase | `#B06BFF`, ciano (`#22E5F5`, `#1FE5F2`, `#22E8F5`), azul (`#4DB8FF`, `#4FB3FF`, `#4DB5FF`), `#FFFFFF` nas 3 | 1.793 / 406 a 560 |
| depois, frase final | esta branch | grafite `#17191d` | v5 + frase | `#B06BFF`, ciano (`#1EEAF7`, `#1EE3F5`, `#22E5F5`), azul (`#4BB5FF`, `#5AA8FF`, `#4FA9FF`), `#FFFFFF` nas 3 | 1.810 / 412 a 600 |

- **O que mudou na paleta:** entrou o azul do degradê do "Martech" (que a cópia sobre branco não mostrava inteiro) e o branco passou a vir do desenho do logo. **Nenhuma rodada devolveu o grafite `#17191D`** (o fundo que pusemos), com as duas redações da frase. O `#FFFFFF` já aparecia antes, mas a palavra "Conteúdo" não estava na imagem: o branco vinha, com toda probabilidade, do fundo da cópia, do quadro branco da captura e da lista de candidatas (não dá para separar as três causas com uma chamada só).
- **O que saiu:** `#0E0914` (o quase preto que o fornecedor deu como cor do texto do site), nas 6 rodadas "depois". As duas redações da frase dão o mesmo resultado, então não é efeito da frase sobre o fundo: com o logo inteiro à vista o modelo montou a paleta do que viu e não precisou da candidata. Com a captura real da página (texto escuro sobre branco) ele pode voltar a escolhê-la; esta comparação não mostra isso.
- **Custo:** a frase soma uns 120 tokens de entrada (1.677 → 1.793 a 1.810), menos de US$ 0,001 por leitura; as 9 chamadas custaram cerca de US$ 0,16 a 0,19 em tokens.

## Como reproduzir

Como em [fluxo0-09](../fluxo0-09/README.md): banco `*_test` migrado, servidor com o gate ligado e os leitores de mentira, `E2E_STORAGE_DIR` igual no servidor e no roteiro, um usuário (`npx tsx scripts/seed-visual-foundations.ts`) que entrou e abriu `/` uma vez. O logo de cada estado vem de `PILOT_STATES_LOGO`:

```bash
cd app
PILOT_STATES_LOGO=light  npx tsx scripts/pilot-states.ts handoff <email> summary   # logo claro sintético (peça a chapa escura)
PILOT_STATES_LOGO=dark   npx tsx scripts/pilot-states.ts handoff <email> summary   # logo escuro sintético (fica a chapa creme)
PILOT_STATES_LOGO=file:/caminho/logo.svg npx tsx scripts/pilot-states.ts handoff <email> done   # um PNG ou SVG seu (o SVG é desenhado pelo servidor)
```

O roteiro mede o logo com a mesma função do servidor (`measureLogoSurface`) e grava o resultado no ativo e no item do handoff, como uma leitura ou um envio deixam. Para ver o "antes", suba a `main` em outra porta sobre o mesmo banco: o dado extra é ignorado.

## Limites

- **Dois lugares mudam; os outros ficam como estão.** A carta de logo da mesa e a cópia da visão eram os únicos fundos claros fixos. Os cartões de identidade, o resumo do handoff, a Biblioteca e o Brand Kit têm fundo escuro (o app força o tema escuro), onde o logo claro já aparece inteiro. A lista completa e o motivo de cada um estão nas notas do ticket.
- **O espelho do problema não foi tratado:** um logo preto sobre transparente quase não se vê nesses cartões escuros (nem se via). A medição já grava `surface: "light"` para ele, mas pôr uma chapa clara atrás do logo nesses cartões muda como os logos escuros aparecem hoje e é decisão de produto.
- **Logos que já estavam guardados não são medidos de novo** (ficam como hoje até uma nova leitura ou um novo envio). O logo enviado nas Configurações (Brand Kit) também não é medido: é outro caminho de envio, fora do handoff.
- As capturas não comprovam uma leitura real de site, a captura de página do Firecrawl nem a aceitação visual humana.
