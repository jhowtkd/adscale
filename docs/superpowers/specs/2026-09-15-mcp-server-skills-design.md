# Spec: ADScale como MCP server + skill

Data: 2026-09-15 (rev. 2). Handoff executável. A “paridade com o Estúdio” do ticket de operações é o norte, **não** o recorte desta entrega.

Mapa: [Wayfinder: Meta Ads, voz no pedido e MCP/skills](https://github.com/jhowtkd/adscale/issues/343).
Pesquisa: `docs/research/2026-09-14-mcp-remote-server-and-skills.md` (branch `research/mcp-and-skills`).

## Fatias (nomes honestos)

| Fatia | Auth | Superfície | Aceite |
| --- | --- | --- | --- |
| **Esta spec (MCP loop)** | Bearer por workspace, atrás de flag | Loop Estúdio: criar → gerar → poll → selecionar | Claude Code **ou** Cursor contra **dev**, com skill instalada à mão |
| **MCP auth (seguinte)** | OAuth 2.1 + PRM + CIMD | Grants + revoke em Integrações | Aceite próprio; não trava o loop |
| **MCP paridade** | a do momento | Layerize, marca write, Campanha, saldo, repertório, um prompt por Protocolo | Aceite próprio |

Não chamar esta spec de “v1 paridade”. OAuth nesta entrega transforma o item mais arriscado em gating de tudo — recusado.

## Resultado desta spec

Um agente em Claude Code ou Cursor, com Bearer do workspace, cria um Trabalho, dispara `gerar_peca`, lê a Peça pronta por **resource** e faz Seleção por agente. Toda geração passa pelo Generation Settlement.

## Auth (esta spec)

- Transporte: MCP spec current `2026-07-28`, Streamable HTTP, handler **stateless** no Next/Render. Dual-era (`initialize` 2025) no handler — isso é transporte, não OAuth.
- **Bearer** escopado ao **workspace**, emitido por owner/admin. Flag de produto (off por default em produção até o aceite passar em dev). Token mostrado **uma vez**; persistir só hash. Sem Dono da plataforma.
- O agente age **em nome do operador que emitiu o token** (o owner/admin que criou). Escopo = aquele workspace, marcas que esse operador já vê.
- **Configurações → Integrações** nesta fatia: **lista de tokens Bearer + criar + revogar**. Isso é credencial pré-criada, e está certo *porque não é CIMD*.

## Auth (fatia seguinte — não implementar aqui)

OAuth 2.1 + PRM + CIMD. Registro do cliente é o Client ID Metadata Document: **não há credencial pré-criada**. A mesma tela passa a ser **lista de grants ativos + revoke** (qual cliente, que operador, quando). Sem botão “gerar API key”. Sem misturar Bearer e OAuth no mesmo aceite.

## Tools (write)

Só estas quatro:

- `criar_trabalho` — Protocolo como argumento (`single` \| `variations` \| `format_adaptation` \| `restyle` \| `carousel`). Um tool, não um por Protocolo.
- `gerar_peca`
- `cancelar_peca`
- `selecionar_peca` — grava **Seleção por agente**, rastro distinto do `POST .../select` humano.

Sem prefixo `adscale.`. PT-BR snake_case.

**Não nesta spec:** Layerize, criar/editar marca, Campanha, leitura de saldo, leitura/escrita de repertório, Ditado, Anúncios veiculados.

O MCP **não** reexpõe `assistant/tools/registry.ts`. Mapeia `/api/creative-work/*`.

## Resources (read) — não tools

Leitura é **resource**, não `obter_peca`:

| Resource | Lê |
| --- | --- |
| `marca` | marca ativa do workspace do token |
| `trabalho` | Trabalho (inclui estado do job de geração) |
| `peca` | Peça (status, URLs, veredito objetivo) |
| `briefing_inferido` | briefing do Trabalho |

Poll = reler `trabalho` / `peca`. Sem webhook, sem MCP Tasks, sem notificação obrigatória. `gerar_peca` devolve job/id, não bloqueia `tools/call`. Job falho ≠ veredito objetivo — os resources expõem os dois. `CONTEXT.md` não é resource.

## Skill — versionamento ≠ distribuição

**Onde vive (versão):** `app/src/mcp/skills/adscale/SKILL.md`, no mesmo commit/release do handler e dos nomes das tools. Rename de tool = bump da skill no mesmo release.

**Como chega no host (esta spec, teste e mundo real):** **não se instala sozinha.** Não há marketplace.

| Host | Como a skill entra |
| --- | --- |
| Cursor | Copiar/symlink `SKILL.md` para `.cursor/skills/adscale/SKILL.md` **do projeto de teste** (ou `~/.cursor/skills/adscale/` na máquina do aceite) |
| Claude Code | Copiar/symlink para `.claude/skills/adscale/SKILL.md` do projeto de teste (ou `~/.claude/skills/adscale/`) |
| Claude.ai / ChatGPT | Fora desta spec (depende da fatia OAuth) |

O README da skill tem esses dois caminhos, literais. O aceite **inclui** executar esses passos — “a skill está no monorepo” não conta.

## Aceite desta spec

1. Flag on em dev; owner cria Bearer em Integrações; o agente só vê aquele workspace.
2. Com a skill instalada pelo README: `criar_trabalho` → `gerar_peca` → poll nos resources `trabalho`/`peca` → `selecionar_peca`. Settlement e créditos iguais ao Estúdio.
3. Seleção por agente ≠ Aprovação humana / Calibração.
4. Bearer não obtém Dono da plataforma.
5. O fluxo completa em **pelo menos um** de Claude Code ou Cursor contra dev; o segundo host é o mesmo contrato, não um segundo projeto de auth.
6. `npm test`: poll/cancel, rastro de seleção, escopo de workspace, resource `peca` (não tool `obter_peca`), flag off rejeita.

## Fora

OAuth/CIMD/PRM. Paridade Estúdio. ChatGPT. Observabilidade/preço por agente. Distribuir skill por plugin marketplace.
