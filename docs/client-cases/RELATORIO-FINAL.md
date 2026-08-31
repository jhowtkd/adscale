# Relatório final — Kit comercial e cases de clientes

**Data:** 2026-08-29 · **Branch:** `codex/telas-case` · **Commits do trabalho:** `cfaa164d` → `83e3d65c` (~20 commits)

---

## O que foi feito

### Ciclo 1 — Estudos com marcas reais (laboratório)
- Spec → plano → 9 tarefas executadas com subagentes e revisão por tarefa.
- 3 marcas (Nike Just Do It 1988, MTV Network IDs, Absolut Perfection), originais no Brand Training com hash e fonte.
- 24 telas + 6 peças reais + empacotamento com evidência. Sucedido pelo ciclo de clientes.

### Ciclo 2 — Cases de clientes (comercial)
- 3 clientes com autorização registrada: **Nike Pegasus 41**, **Amazon institucional**, **Burger King rebrand**.
- **6 peças reais** geradas (gpt-image-2, custo 50/piece, falhas reembolsadas) e aprovadas em revisão visual.
- **24 telas** de produto (15 desktop + 9 mobile), sem nenhum marcador de estudo/demo.
- **36 slides 16:9**, **9 carrosséis 4:5**, **6 stories 9:16**, **índice web** — tudo derivado do material aprovado, zero regeneração.
- Maquinaria reutilizável: seed idempotente, captura parametrizada, evidência por peça, ARTIFACTS.json, validador fail-closed.

---

## DO's — o que fazer de novo

1. **Spec aprovado antes de uma linha de código.** Nos dois ciclos o alinhamento (destino, conta, teto de custo, formato) veio antes; o plano inteiro derivou dele.
2. **Fail-closed em tudo.** Seed que recusa sem os arquivos e com hash divergente; validador que não deixa kit parcial passar ("requires 2 for absolut, got 1"); evidência obrigatória por peça real.
3. **Revisão visual humana em resolução cheia, peça por peça.** Todo output aprovado foi baixado do R2 e inspecionado antes de entrar no kit — inclusive reprovando candidatos.
4. **Contar custo e reembolso separadamente.** Teto declarado antes do lote (4 dispatches/marca), falhas zeradas no ledger, sucessos a 50 créditos — nada roeu o orçamento sem ser contado.
5. **Ledger de progresso + rulings.** O arquivo `.superpowers/sdd/*/progress.md` sobreviveu a compactações de contexto e travamentos de sessão; cada decisão com "por quê" e "custo se errar".
6. **Reaproveitar maquinaria, reescrever só a pele.** O ciclo 2 reusou seed/captura/empacotador parametrizados — saiu em horas o que o ciclo 1 levou em dias.
7. **Testar idempotência rodando o seed duas vezes.** Contagens estáveis (9/18/17 refs) provaram que nada duplica.
8. **Confirmar efeitos no banco, não na UI.** Dispatch confiável = linha criada + `updated_at` mudou; UI pode mentir (botão clicado, nada despachado).
9. **Digitar de verdade quando for React.** `fill` não aciona o estado; keystroke char-a-char ou o setter nativo + evento `input` funcionam. Guardar isso de memória muscular.
10. **Esperar por conteúdo, não por elemento.** Lazy-load e fetch assíncrono pedem: scroll primeiro, `img.complete && naturalWidth > 0` depois, e espera pelo texto real ("Resultado gerado") na grade.
11. **Automatizar desbloqueios recorrentes.** `reset-failed-creative-work.ts` nasceu da 4ª vez que um trabalho travou e virou utilitário do repo.
12. **Respeitar invariantes do produto.** Peça nova em segundo Trabalho (1 seleção por trabalho), status honesto (`draft`/`failed`), nunca fingir estado.
13. **Rastro limpo no git.** Só paths nomeados, binários fora (hashes no manifesto), commits pequenos por tarefa.

## DON'Ts — o que não repetir (cada um custou tempo real)

1. **Não invente hash "aprovado" para arquivo que não existe.** Gerou achado Critical na primeira revisão e re-trabalho. Fail-closed ou marca fora do kit.
2. **Não treine com fixture e espere resultado real.** "Pastelão": Nike no nome, blob no arquivo. O original (do cliente, com autorização) é o que faz o treino valer.
3. **Não confie em esperas genéricas.** `img[alt]` casou com o logo da sidebar (`alt=""`) e validou tela vazia; `main` validou página em loading. Seletor específico + conteúdo real.
4. **Não presuma que o clique da UI despachou.** Duas vezes o 202 era idempotência ou o clique não chegou ao handler — sempre confirme no banco.
5. **Não coloque datas, números ou claims nas notas de marca.** "17 milhas" e "1980" derrubaram gerações inteiras no guarda factual — às vezes **antes** de chamar o provider (1.2s, zero imagens). Claim sem fonte no fact pack = reprovação garantida.
6. **Não tente "salvar" peça reprovada com copy.** O avaliador VLM rejeita 2x e trava; o caminho é corrigir a entrada (notas, steering) e regenerar.
7. **Não rode operações destrutivas sem perguntar.** Truncate de tabelas do usuário e ENOSPC só com consentimento explícito — e mesmo assim prefira backup.
8. **Não faça diagnóstico longo num runner único de horas.** O server de 10h30 tinha dono da porta 3000; "restarts" nunca o mataram. Confirme quem escuta a porta (`lsof`) antes de teorizar.
9. **Não deixe o controller consertar código no meio do loop.** Fix via subagent + re-review escopada; conserto direto pula a revisão e contamina o contexto de coordenação.
10. **Não raspe em massa.** Fontes pontuais com autoria, data e finalidade no manifesto; o que é do cliente vem do cliente.
11. **Não deixe vocabulário de processo vazar pra superfície visível.** "Estudo", "demo", "fixture" nasceram no backend e estavam na sidebar e nas telas — o ciclo 2 nasceu pra matar isso e a regra é: se aparece em screenshot, é contract.
12. **Não commite binários.** Originais e PNGs ficam no storage/local; o git guarda hash, rota e evidência.
13. **Não confie que o servidor de dev (Inngest) está saudável porque responde 200.** Timeouts de stream R2 e `generation_interrupted` eram ambientais; teste SDK direto isola a camada.

---

## Inventário final

| Artefato | Onde |
|---|---|
| 24 telas de produto (3 marcas) | `docs/client-cases/screenshots/` |
| 6 peças reais isoladas (sha256) | `docs/client-cases/results/` |
| Evidência por peça (provider, request id, custo) | `docs/client-cases/evidence/<marca>/<outputId>.json` |
| ARTIFACTS.json (revisões registradas) | `docs/client-cases/evidence/ARTIFACTS.json` |
| 36 slides 16:9 · 9 carrosséis 4:5 · 6 stories 9:16 | `docs/client-cases/derivatives/` |
| Índice web dos cases | `docs/client-cases/derivatives/index.html` |
| Manifesto + autorizações + hashes | `docs/client-cases/manifest.json` |
| Maquinária reutilizável (lib, seed, captura, derivados) | `app/scripts/lib/client-cases.ts`, `seed-client-cases.ts`, `capture-ui-screenshots.ts --client-cases`, `build-client-case-derivatives.mjs` |
| Ciclo de estudos (histórico) | `docs/commercial-studies/real-brands/` |

**Custos:** ~300 créditos em 6 peças entregues; falhas reembolsadas automaticamente. Zero compra de crédito.

## Encerrado (dispensado pelo product owner em 2026-08-31)

1. **Revisão jurídica** — dispensada. O kit permanece local; não publicar como se tivesse parecer jurídico.
2. **Publicação** — dispensada.
3. **PR da `codex/telas-case`** — dispensado neste closeout.
4. Segunda leva de clientes — só quando houver autorização nova.
