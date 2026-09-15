# ADScale como MCP server + skills públicas

Data: 2026-09-15 (rev. 2). Especificação de implementação proposta; nenhuma
alteração de aplicação, migração ou publicação foi executada nesta etapa.

Mapa: [#343](https://github.com/jhowtkd/adscale/issues/343).
Decisões: [#354](https://github.com/jhowtkd/adscale/issues/354) (spec/auth),
[#355](https://github.com/jhowtkd/adscale/issues/355) (operações),
[#356](https://github.com/jhowtkd/adscale/issues/356) (identidade),
[#357](https://github.com/jhowtkd/adscale/issues/357) (skills),
[#359](https://github.com/jhowtkd/adscale/issues/359) (async).
Protótipo [#358](https://github.com/jhowtkd/adscale/issues/358) pulado —
conexão Claude/Cursor fica nesta execução.

## Resultado e recorte

Agentes externos (Claude, Cursor na v1) operam o ADScale via MCP remoto:
criar Trabalho, gerar Peça, acompanhar, listar, selecionar. Uma skill
(`SKILL.md`) ensina esses agentes a usar bem o servidor. Toda geração
disparada via MCP passa pelo **Generation Settlement canônico** — mesma
cobrança, reserva, dispatch e refund; nenhuma jornada paralela.

**Primeira entrega ≠ paridade.** Paridade com a API do Estúdio é o
norte; o aceite desta fatia é menor (ver § Primeira entrega). OAuth/CIMD
e paridade são fatias seguintes.

Fora desta spec: assistente interno consumindo MCP de terceiros;
MCP/skills para os agentes que desenvolvem o repo; ChatGPT (connector
OAuth fica para depois); marketplace de skills; voz no assistente; MCP
expondo a análise do Meta Ads (cruzamento no fog).

## Fontes e precedência

- `CONTEXT.md`: Seleção por agente, Generation Settlement, Contexto
  autorizado, Aprovação humana. `docs/agents/source-of-truth.md`.
- Pesquisa #354: spec MCP current `2026-07-28`; transporte remoto
  **Streamable HTTP** (HTTP+SSE deprecated); dual-era obrigatório (hosts
  ainda falam `initialize` 2025); stateless no Next.js do Render
  (`POST /mcp`); geração = job id + poll (MCP Tasks fora da client
  matrix dos hosts; Codex timeout default 60 s — nunca bloquear o worker
  no `tools/call`); skills = `SKILL.md` (agentskills.io) + plugin/`mcp.json`.
- Código inspecionado no checkout `main` HEAD `78a7378b`: assistente
  interno tem só 3 tools (`get-thread-context`, `propose-action`,
  `update-goal-plan`) em `app/src/server/assistant/tools/registry.ts` —
  o MCP **não** reexpõe esse registry; mapeia a API do Estúdio
  (`/api/creative-work/*`, client-profiles); `POST
  .../outputs/[outputId]/select` hoje é Aprovação humana
  (`app/src/app/api/creative-work/[id]/outputs/[outputId]/select/route.ts`);
  generate retorna HTTP 202
  (`app/src/app/api/creative-work/[id]/generate/route.ts`).

## Primeira entrega (aceite desta fatia)

- Auth: **Bearer por workspace atrás de flag**. Configurações →
  Integrações = **criar/revogar token** (credencial pré-criada,
  coerente com Bearer).
- Loop: `criar_trabalho` → `gerar_peca` → resource `peca`/`trabalho`
  → `selecionar_peca` (+ `listar_pecas`, `cancelar_peca`).
- Resources de leitura: `peca`, `trabalho`.
- Skill copiada e funcional em Claude + Cursor (ver § Skills).

Fora desta fatia (norte, não aceite): demais Protocolos como prompts,
carrossel, Layerize, marca, Campanha, saldo, repertório, OAuth 2.1 +
CIMD, paridade completa. Na fatia OAuth, a mesma tela Integrações vira
**grants ativos + revoke**, sem mint de secret — sem isso, CIMD e
"criar credencial" se contradizem.

## Operações — norte de paridade (fora do aceite, dentro do desenho)

- Todos os Protocolos (`single`, `variations`, `format_adaptation`,
  `restyle`) + carrossel + Layerize (falha claramente sem entitlement
  `layer_editor_v1`); criar/editar marca; Campanha; leitura de saldo;
  leitura do repertório.
- Tools em **PT-BR snake_case**, sem prefixo (`criar_trabalho`,
  `gerar_peca`, `listar_pecas`, `selecionar_peca`, `criar_variacao`,
  `cancelar_peca`). Servidor dedicado: sem prefixo `adscale.` na v1.
- Resources de leitura (marca, Trabalho, Peça, briefing inferido). Um
  prompt por Protocolo (incluindo carrossel). Glossário/`CONTEXT.md`
  **não** vira resource — skills cobrem o "como pedir bem".
- Fora da v1: compra de créditos/assinatura (leitura de saldo entra);
  admin e tudo do Dono da plataforma; gestão de workspace/membros/
  convites; escrita de Treinamento Visual e Calibração (leitura do
  repertório entra); Landing Page e Persona Simulation congelados —
  MCP não é porta de descongelar.

## Identidade, escopo e autoridade

- O agente age **em nome de um operador**. Escopo **workspace** — as
  marcas que aquele operador já enxerga; um token não atravessa
  workspace; nunca herda Dono da plataforma.
- Pode o que o operador pode na API do Estúdio (dentro da v1 fechada),
  inclusive Seleção por agente. **Não** é Aprovação humana. Gasta os
  créditos do workspace pelo Settlement canônico. Sem teto extra por
  agente na v1.
- Auditoria registra o operador e o cliente que disparou.
- Nesta fatia: Bearer por workspace (ver § Primeira entrega). Fatia
  seguinte: OAuth 2.1 + PRM (RFC 9728) + `resource` (RFC 8707) + CIMD
  (DCR deprecated).

## Assincronia da geração

- `gerar_peca` devolve **job id** (espelha HTTP 202) e **não bloqueia**
  o `tools/call`. O agente **polla** estado (tool/resource de
  Trabalho/Peça) até completar, falhar ou ser cancelado.
- Fora: webhook HTTP, MCP Tasks, notificação MCP como caminho
  obrigatório (hosts v1 não são confiáveis nisso).
- `cancelar_peca` existe, alinhado à API.
- Job falho ≠ Peça com veredito objetivo (aprovado/reprovado/
  inconclusivo). O agente vê os dois como a API do Estúdio.

## Seleção por agente

`selecionar_peca` mapeia o select da API mas com **rastro distinto** de
Aprovação humana: respeita a reprovação objetiva; não conta em métricas
nem na Calibração da marca até o operador confirmar. Exige trilha
própria no comando de select — não reutilizar o POST de aprovação como
está.

## Skills

- **Uma skill** — "como operar o ADScale" (criar Trabalho, gerar Peça,
  selecionar). Não uma por Protocolo.
- Hosts v1: **Claude e Cursor**.
- Fonte canônica no monorepo, ao lado do MCP server:
  `app/src/mcp/skills/adscale/SKILL.md`, versionada **junto** com o
  servidor (rename de tool = bump da skill no mesmo release).
- Skill no monorepo versiona; **não distribui**. Aceite exige copiar
  para `.cursor/skills/adscale/` e `.claude/skills/adscale/` (ambos
  existem na raiz), com README com os caminhos. Sem marketplace nesta
  fatia. Quem escreve/mantém: o time do produto.
- Teste: o agente completar o fluxo Estúdio num host v1 contra dev.

## Hospedagem

`createMcpHandler` (server v2) **stateless** no Next.js do Render,
`POST /mcp`. Dual-era `initialize` obrigatório. Sem sessão in-memory.
Timeouts de host (Codex ~60 s) respeitados via job + poll, nunca
bloqueando o `tools/call`.

## Aceites

1. Com Bearer válido: `criar_trabalho` → `gerar_peca` (retorna job id
   em < 60 s sem bloquear) → poll no resource até Peça pronta →
   `listar_pecas` mostra → `selecionar_peca` registra Seleção por
   agente (não Aprovação humana); créditos do workspace consumidos via
   Settlement canônico.
2. `cancelar_peca` cancela job pendente; job falho e veredito objetivo
   aparecem como estados distintos.
3. Bearer de outro workspace não atravessa; sem flag, `POST /mcp`
   recusa; revogar o token em Integrações invalida chamadas seguintes.
4. Claude e Cursor (hosts v1): agente com a skill instalada completa o
   fluxo contra dev; `SKILL.md` canônico e as duas cópias idênticos;
   README com os caminhos presente.
5. Auditoria de uma chamada mostra operador + cliente OAuth/Bearer.
