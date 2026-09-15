---
name: adscale
description: Operate ADScale (creative-performance studio) via MCP — create Trabalhos, generate Peças, poll, list and select. Use for any ADScale task.
---

# /adscale — operar o ADScale via MCP

Você opera o **ADScale**, estúdio de criativos de performance, pelo MCP remoto.
Toda geração consome créditos do workspace pelo Generation Settlement canônico —
o mesmo da interface. Nunca prometa custo zero.

## Vocabulário (use estes termos, evite os outros)

- **Trabalho**: unidade criativa retomável (intenção + briefing + Peças). Evite: job, projeto.
- **Peça**: resultado visual de um Trabalho. Evite: output, asset, derivação.
- **Protocolo**: modo de criação — `single`, `variations`, `format_adaptation`, `restyle`.
- **Marca**: client profile do workspace. Peça sempre pertence a um Trabalho de uma marca.
- **Seleção por agente** ≠ **Aprovação humana**: você pode selecionar, mas só o
  operador aprova. Veredito inconclusivo e reprovação objetiva travam você.

## Conexão

- Endpoint: `POST {ADSCALE_URL}/mcp` (dev: `http://localhost:3000/mcp`,
  prod: `https://adscale.jhonatansoares.com/mcp`).
- Auth (primeira fatia): header `Authorization: Bearer <token>`. O operador cria
  o token em Configurações → Integrações. Um token vale para um workspace.
- Transporte: Streamable HTTP stateless. Sem sessão, sem `initialize` manual —
  o host MCP cuida do handshake.

## O loop (primeira fatia)

1. **Criar**: `criar_trabalho({marca, pedido, protocolo?, formato?})`.
   `marca` aceita nome ou id; se ambíguo, a tool lista candidatas — pergunte
   ao operador em vez de chutar. Default: protocolo `single`, formato `4:5`.
2. **Gerar**: `gerar_peca({trabalho_id})`. Retorna os `peca_id` (job ids)
   **imediatamente e não bloqueia**. Nunca espere dentro da call.
3. **Acompanhar**: `listar_pecas({trabalho_id})` ou leia
   `adscale://peca/{trabalho_id}/{peca_id}` até `status` ser `completed`
   ou `failed`. Poll com intervalo de segundos, não em loop apertado.
4. **Selecionar**: `selecionar_peca({trabalho_id, peca_id})` quando uma Peça
   `completed` servir. Falha de job ≠ veredito ruim: leia `veredito` antes.
5. **Cancelar** (se precisar): `cancelar_peca({trabalho_id, peca_id})`.
   Só pendentes cancelam; terminadas não.

Resources de leitura: `adscale://trabalho/{trabalho_id}`,
`adscale://peca/{trabalho_id}/{peca_id}` (JSON).

## Regras

- Uma Peça `completed` com reprovação objetiva **não** pode ser selecionada —
  nem por você, nem pelo operador. Gere outra ou reporte.
- Veredito inconclusivo: **não** selecione; peça confirmação ao operador.
- `trabalho_ja_gerado`: não gere de novo — liste e selecione as existentes.
- Erros voltam como `{erro, mensagem, detalhes}` com `isError: true`.
  `marca_ambigua` lista candidatas; `marca_nao_encontrada` lista marcas.
- Nunca invente ids de marca, Trabalho ou Peça. Nunca atravesse workspace:
  um token, um workspace.
- Fora da v1 (não peça, não existe): comprar créditos, admin, membros,
  escrita de Treinamento Visual, Landing Page, Persona, carrossel,
  Layerize, marca/campanha/saldo via MCP. Marca aqui é só argumento do
  `criar_trabalho`, não gestão.
