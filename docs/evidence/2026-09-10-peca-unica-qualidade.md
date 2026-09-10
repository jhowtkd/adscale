# Peça única — qualidade: prova controlada e protocolo humano (2026-09-10)

Dono: Agente D (`codex/estudio-creditos-qa`). Fatia D da tarefa 4 do plano
de qualidade. Prova técnica local abaixo; comparação humana em §3 com
status **`not_run`** — este documento prepara o experimento, não declara
resultado nem autoriza chamadas pagas.

## 1. Prova técnica controlada (local, sem provider pago)

- Evidência do provider controlado passou a registrar
  `quality: input.quality ?? null` por chamada (modo, dimensões, ordem de
  referências, marcadores e attempt já existiam). Geração controlada
  inalterada.
- Teste
  `src/server/ai/providers/e2e-controlled-provider.test.ts → "records the
  requested quality in isolated evidence"`: `E2E_PROVIDER_EVIDENCE_PATH`
  isolado por `mkdtempSync`, `quality: "high"` gerado, última linha do
  JSONL contém `{ quality: "high", generationMode: "art_variation" }`.
  Verde no lote de 90 testes do marco de créditos.
- Matriz E2E `integrated` (sucesso, `[e2e:qa-error]`,
  `[e2e:qa-fail-always]`, `[e2e:hard-fail-once]`, revisão com base,
  adaptação 9:16, 1 chamada inicial `quality: "high"`, sem autocorreção,
  retry humano confirmado ≤ 2 chamadas, snapshot histórico preservado):
  **a executar pós-integração** no SHA do coordenador, com servidor/worker
  locais isolados e `E2E_CONTROLLED_PROVIDER=true`. PNG determinístico não
  prova superioridade criativa.

## 2. Casos de comparação (3 pares Cenbrap × ChatGPT)

Categorias (gate do estudo: institucional, promoção, evento):

| # | Categoria | Pedido real | Anexos | Hash do pedido | Status |
|---|-----------|-------------|--------|----------------|--------|
| 1 | institucional | pendente (material do usuário) | iguais por par; brand kit ADScale documentado ou mesmos assets/regras ao ChatGPT | — | not_run |
| 2 | promocao (oferta/validade explícitas) | pendente (material do usuário) | idem | — | not_run |
| 3 | evento (título/data/local explícitos) | pendente (material do usuário) | idem | — | not_run |

Sem hash fictício: a linha de cada par é gerada do texto real coletado:

```ts
import { createHash } from "node:crypto";
function comparisonCase(kind: "institucional" | "promocao" | "evento", brief: string) {
  if (!brief.trim()) throw new Error("O pedido real é obrigatório.");
  return {
    case: kind,
    briefHash: createHash("sha256").update(brief).digest("hex"),
    status: "not_run" as const,
    adscaleOutputId: null,
    chatgptArtifact: null,
    winner: null,
    reason: null,
    providerCalls: 0,
    actualCost: null,
  };
}
```

Contexto disponível: auditoria
(`docs/evidence/2026-09-10-auditoria-cenbrap-geracoes.md`, 10 prints) e
Córtex da marca Cenbrap documentado. Os textos exatos dos 3 pedidos e os
anexos de cada par dependem do material do usuário — não inventar preço,
desconto, prazo, nome de pessoa ou data para completar um caso; se
faltar fato numa categoria, usar um pedido real já existente da categoria.

## 3. Protocolo de execução (após autorização concreta das 6 gerações)

1. Apresentar os 3 pedidos + anexos e o orçamento concreto (latência e
   custo efetivamente observado, sem estimar preço de provider por
   memória); obter autorização antes de qualquer chamada paga.
2. Cada par usa pedido e anexos iguais nas duas plataformas. ADScale pode
   usar o brand kit documentado; registrar essa diferença de contexto, ou
   fornecer os mesmos assets/regras ao ChatGPT.
3. Uma geração por plataforma por pedido, sem selecionar a melhor entre
   tentativas escondidas. Randomizar A/B e ocultar a origem na avaliação.
4. Avaliação cega do Jhonatan, nota 1–5: legibilidade, hierarquia, marca,
   precisão e prontidão; preferência final empate/A/B.
5. Aceite humano: ADScale vence/empata 2 de 3, zero erro factual crítico.
   Se falhar, registrar a causa e decidir o ajuste pelos resultados, sem
   lotes automáticos. Registrar resultados inclusive os ruins.
6. Latência e custo reais por geração vão na tabela do §2 ao executar.

## 4. Limites explícitos

- Tecnicamente concluído ≠ vencer o ChatGPT; PNG de provider controlado
  não é evidência de qualidade visual.
- Publicação e teste pago fora deste commit. Estado dos planos de
  experiência/qualidade e aprovação visual da aplicação integrada ficam
  com o coordenador no aceite final.
