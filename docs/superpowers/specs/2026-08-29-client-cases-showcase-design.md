# Design: Cases de clientes ADScale — kit comercial

**Data:** 2026-08-29

**Status:** Aguardando revisão do usuário

**Substitui para este fim:** o ciclo de estudos 2026-08-28 (Nike/MTV/Absolut) fica como laboratório histórico; nada dele aparece no novo kit.

**Diferença central:** marcas são clientes com autorização de uso comercial. Zero enquadramento de estudo/demo — nem nomes, nem avisos, nem overlays. O kit vende o produto.

## 1. Objetivo

Produzir o kit comercial público do ADScale com três cases de clientes: **Nike (Pegasus 41)**, **Amazon (institucional)** e **Burger King (rebrand)**. Mesma espinha de processo — treino de marca, briefing, geração real, seleção, telas — com enquadramento de portfólio: o que as telas mostram é o produto trabalhando para clientes.

Publicação comercial **só depois de revisão jurídica**. Autorização de uso de cada cliente fica registrada no manifesto.

## 2. O que morre em relação ao ciclo de estudos

- Aviso "Estudo independente…" — não existe mais, em tela nenhuma.
- Perfis "Estudo editorial — …" — apagados da conta.
- Workspace/usuário com nome "Estudos" — renomeados para marca neutra ("ADScale").
- Overlays de captura (footer de disclaimer, cabeçalho de contexto) — removidos; telas são o produto puro.
- Palavras "estudo/demo/fixture" em qualquer artefato visível — "case", "referência", "evidência técnica".

## 3. Marcas e foco

| Marca | Foco | Assets do cliente |
|---|---|---|
| Nike | Produto **Pegasus 41** | 9 JPGs (posters de campanha + produto) |
| Amazon | Institucional | 17 AVIFs alta resolução (embalagem, smile, tape) |
| Burger King | Rebrand | 15 arquivos (sistema gráfico, embalagens) |

Cada marca tem registro de autorização no manifesto: `authorizedBy: "cliente"`, `commercialUse: true`, com o arquivo de autorização anexado quando existir. Sem esse registro, a marca não entra.

## 4. Arquitetura

Reaproveita integralmente a maquinaria do ciclo anterior, parametrizada:

- Manifesto novo: `docs/client-cases/manifest.json` (slugs `nike`, `amazon`, `burger-king`).
- Mesmos scripts (seed, captura, empacotamento, validador) com flag de modo `client-cases`: sem overlays, perfis com nome de marca, sem vocabulário de estudo.
- Mesma conta `estudos@example.test` — renomeada na UI: usuário "ADScale", workspace "ADScale". Créditos atuais permanecem.
- Falha fechada mantida: hash de asset, evidência de provider por peça, `ARTIFACTS.json`, validador.

## 5. Fluxo por marca

Mesmos cinco estágios: **contexto → treino → direção → resultados → decisão**.

- Treino: assets do cliente no Brand Training (`usageMode: reference`), aprovados.
- Direção: briefing derivado do foco (Pegasus 41 / institucional / rebrand).
- Geração: teto de **4 dispatches por marca**, escolhe **2 peças** (padrão do ciclo anterior). Sem retry automático; falhas reembolsadas.
- Resultados/decisão mostram as peças reais selecionadas.

## 6. Storyboard e entregáveis

- 15 telas desktop (5 por marca, 1440×1000) + 9 mobile (390×844).
- **6 resultados isolados** (2 por marca).
- **Derivados incluídos neste ciclo:** apresentação 16:9 (1 tela por estágio + abertura), carrossel 4:5, stories 9:16, índice web ligando os três cases.
- Derivados só depois das 30 telas base aprovadas visualmente.

## 7. Gates

1. Autorização registrada por marca (bloqueante).
2. Seed idempotente sem geração paga.
3. Ensaio controlado 24/24.
4. Lotes pagos por marca (teto 4, escolhe 2).
5. Captura final + revisão visual humana das 30 telas.
6. Derivados.
7. **Revisão jurídica** — bloqueante de publicação.
8. Publicação (autorização específica).

## 8. Fora de escopo

- Deploy/produção do produto.
- Uso de qualquer marca sem autorização registrada.
- Enquadramento de estudo/demo em qualquer material.
- Fine-tuning de modelo, scraping, nova tabela/role.

## 9. Critérios de sucesso

- 24 telas + 6 resultados + derivados completos, sem nenhum marcador de estudo/demo.
- Cada peça real com evidência de provider e custo.
- Autorização registrada para as três marcas.
- Revisão visual humana aprovada; jurídica pendente até publicação.
- Zero alteração de produto (feature, tabela, role) — tudo em camada de processo.
