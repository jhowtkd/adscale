# Auditoria ADScale — gerações com marca Cenbrap (2026-09-10)

Auditoria feita operando o Chrome real do usuário (aba `adscale.jhonatansoares.com`), executando uma geração em cada função do Estúdio com a marca **Cenbrap** ativa. Prints em `docs/screenshots/2026-09-10-auditoria-cenbrap/` (01–10).

## Resultado por função

| # | Função | Resultado | Tempo |
|---|--------|-----------|-------|
| 1 | Peça única | ✅ Gerou ("Equilibrada · 4:5 · v1 · PRONTO"), todos os checks de fidelidade "Comprovado" | ~60s |
| 2 | Variações | ✅ Gerou na 2ª tentativa ("Ousada · 9:16 · v1 · PRONTO") — 1ª tentativa se perdeu | 2ª vez ~90s |
| 3 | Adaptar formatos | ✅ Gerou (4:5 → 9:16), "Pronta para revisar" | ~60s |
| 4 | Mudar estilo | ⛔ Bloqueado: validação reclama de arquivos que estão visualmente anexados | — |
| 5 | Criar carrossel | ⛔ Bloqueado: botão "Organizar conteúdo" habilitado mas morto (5 cliques, 2 métodos) | — |
| 6 | Create post (quick tool) | ⛔ Rota órfã — sem entrada na navegação atual | — |
| 7 | Assistente | ⛔ Rota existe (`/assistant`) mas sem entrada visível no shell atual | — |

## A. Experiência — o que funcionou bem

1. **Peça única ponta a ponta é rápido e confiável**: pedido → "Revise seu plano" → confirmar → "Em geração" → resultado em ~1 min.
2. **"Revise seu plano" é o coração do produto** e funciona: mostra Objetivo / Materiais / Preservar / Explorar, "A geração só começa após sua confirmação" — supervisão humana real antes de gastar crédito.
3. **Fidelidade de marca comprovável por campo** (Copy / Fonte / Assets exatos / Composição / safe_area = "Comprovado") + "Identidade aplicada" mostrando Córtex da Marca congelada e quais assets foram usados como exato vs referência. Diferencial competitivo visível na UI.
4. **Briefing inferido editável** com proveniência (sustentado/inferido/desconhecido) — Mensagem, Objetivo, Público, Oferta, Tom, Restrições.
5. **Rascunho persistente**: fechei, naveguei, voltei — texto, anexo, análise e direcionamentos do Variações voltaram intactos.
6. **Resultado da variação "Ousada" foi o melhor output do teste**: selo gigante de 50% OFF, faixa de validade, bullets, CTA button real, manteve o sistema visual da referência. Seguiu a instrução "selo em destaque e hierarquia agressiva".
7. **"Acompanhe sua criação"** dá status claro ("Em geração" → "Pronta para revisar") quando o fluxo funciona.
8. Aprovação linear: Aprovar / Baixar / Compartilhar para revisão / Refinar no mesmo lugar.

## B. Bugs e fricções (ordenados por severidade)

### P1 — geração some sem erro nem cobrança visível
1. **"Na fila · ~40s" que desaparece**: no fluxo Variações, clicar Gerar durante a análise da arte pôs o botão em "Na fila · ~40s"; quando a análise concluiu, o painel re-renderizou e o estado sumiu. 9+ min depois o trabalho continuava "Em briefing · 0 resultados", sem erro em lugar nenhum. A geração só aconteceu na 2ª tentativa passando pelo plano. Impossível saber se a 1ª chegou a reservar crédito (ver D).
2. **Variações sem etapa de plano na 1ª tentativa e com etapa na 2ª** — mesmo protocolo, fluxos diferentes.
3. **Mudar estilo: validação mentirosa**: painel mostra "Arte original" (com preview e botão Remover) + "Referência de estilo" (preview da inspiração do palco), e o Gerar retorna **"Adicione a arte original e a referência de estilo."** A referência pré-mostrada não é anexo real (file input diz "Nenhum arquivo escolhido") — e não há como transformar o preview em anexo.
4. **Carrossel: "Organizar conteúdo" morto**: botão habilita ao digitar o tema, mas não abre nada (5 tentativas: AXPress e clique real no centro). O rascunho fica "Em briefing" para sempre. O teste de carrossel de ontem do próprio usuário está no mesmo estado ("Quero criar um carrossel qwerwqerw…" · Em briefing · 0 resultados).
5. **"Nova variação" não pré-anexa a peça de origem**: o caso de uso óbvio (variar a peça X) exige Baixar a peça e re-anexar manualmente via seletor de arquivos do SO.
6. **Formato automático errado**: referência 4:5 (1080×1350) → "Automático (agora: 9:16)". A variação nasceu 9:16 sem o usuário pedir stories.
7. **IA sobrescreveu escolha de direcionamentos**: marquei só "Ousada"; após a análise, voltou com Conservadora+Equilibrada+Ousada pré-marcadas (3× custo). Tive que desmarcar à mão.

### P2 — fricção e polish
8. **"Análise da arte" sem progresso**: "Aguarde a análise da arte terminar antes de gerar" sem spinner/ETA; durou ~40s parecendo travado. (Análise repetida da mesma arte foi instantânea — cache funciona.)
9. **Análise bloqueia Gerar em silêncio no meio do fluxo** — o certo seria habilitar a fila e executar quando a análise terminar.
10. **Página do trabalho sem botão Gerar**: em Variações/estilo, o gatilho só existe no compositor do Estúdio; quem cai em `/creative-work/:id` não acha como disparar (e a página não rola com wheel em várias áreas).
11. **Rascunho herda título de trabalho antigo**: trocar de protocolo reutilizou o workId de um rascunho velho — o card "Continuar de onde parei" trocou de trabalho sozinho e o título ("Quero criar um carrossel qwerwqerw…") apareceu como se fosse o novo.
12. **"1 peças"** (deveria ser "1 peça"); restrições do briefing em inglês num produto pt-BR; chaves técnicas cruas na UI (`quality.textComposition.copy`, `dashboard.home.composer.results.brandFidelityCheck.safe_area`).
13. **Navigar em "Estúdio" reseta protocolo/compositor** (estado só sobrevive via `?workId=`).
14. **Notificações com badge "44" fixo** durante toda a sessão — nunca muda nem abre fluxo de leitura.

### P3 — informação e arquitetura
15. **Histórico de uso incoerente**: "Total gasto 190" com tabela **"Nenhuma transação encontrada"**; filtros mostrando enums crus ("thisMonth", "all"); créditos restantes "30" na página vs "999999" na sidebar. Impossível auditar se a geração perdida cobrou.
16. **Create post órfão**: rota `/quick-tools/create-post` viva (usada como returnPath pós-geração) mas sem entrada na navegação — só num `map-dashboard-v6` legado.
17. **Assistente sem entrada**: `/assistant` existe com mode-switch de sidebar, mas o shell atual não renderiza o link.

## C. Qualidade dos resultados (nota honesta)

- **Peça única (Equilibrada)**: 6/10. Segura e on-brand (gradiente de ondas + logo), mas headline longa, corpo de texto pequeno demais para anúncio, "CTA" é texto solto sem tratamento, copy quase verbatim do meu pedido.
- **Variação Ousada**: 8/10. Selo 50% OFF dominante, faixa de prazo, bullets escaneáveis, CTA button real, sistema visual da referência preservado. É a peça que rodaria.
- **Adaptação 9:16**: gerou e manteve o conteúdo — não inspecionei em detalhe (custo/tempo), mas o formato pedido deveria ter sido explícito (ver B.6).
- Todos os outputs passaram os gates objetivos de marca (badges "Comprovado"), o que é o prometido.

## D. Verificar depois (não fechado nesta auditoria)

- Se a 1ª geração de variações (a que "sumiu") reservou/cobrou crédito — o Histórico de uso não mostra transações, então ficou impossível confirmar pela UI.
- Resultado da adaptação 9:16 em detalhe.
- Completar Mudar estilo e Carrossel quando os bugs de validação/botão forem corrigidos.

## Prints
01-pecua-unica-em-geracao.png · 02-pecua-unica-topo.png · 03-peca-unica-resultado.png · 04-variacoes-na-fila.png · 05-trabalhos-lista-variacoes-0-resultados.png · 06-variacoes-revise-plano.png · 07-variacoes-em-geracao.png · 08-variacoes-resultado-ousada.png · 09-adaptar-formatos-pronto.png · 10-historico-de-uso.png
