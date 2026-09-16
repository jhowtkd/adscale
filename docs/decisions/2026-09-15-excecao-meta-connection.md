# Exceção ao congelamento: Conexão Meta (rotas live)

**Data:** 2026-09-15
**Status:** Proposta — aprovada quando este commit for mergeado na `main`
**Manifesto:** [`allowed-primary-destinations.json`](./allowed-primary-destinations.json)
**PR de implementação (depois desta exceção):** Anúncios veiculados, PR de rotas
**Spec:** `docs/superpowers/specs/2026-09-15-anuncios-veiculados-design.md` (#347, mapa #343)

## Contexto

O anti-expansion gate rejeita qualquer rota de API nova, inclusive aninhada
a árvore existente. A fatia live de Anúncios veiculados precisa de 5 rotas
de suporte sob a árvore `workspace` existente: estado/desconectar da
Conexão, OAuth (start + callback), sync sob demanda e vínculo conta↔marca.

Não é destino novo nem jornada concorrente: é a conexão que alimenta a
superfície de leitura `/served-ads` já excepcionada (somente-leitura, sem
crédito, fora do Settlement). Sem Meta App (#348 OPEN), tudo opera contra
a Graph mockada determinística; nenhuma chamada à Meta.

Sem esta exceção na base, o PR de implementação não consegue passar o gate,
porque o snapshot é lido de `main`, não do próprio PR.

## Escopo da exceção

Somente estas rotas de suporte entram no snapshot:

| Artefato | Motivo |
| -------- | ------ |
| `workspace/meta-connection/route.ts` | GET estado (member lê) + DELETE desconectar com purge imediato (owner/admin). |
| `workspace/meta-connection/oauth/start/route.ts` | Inicia OAuth (ou loopback mock sem #348). |
| `workspace/meta-connection/oauth/callback/route.ts` | Troca code, cifra token (AES-GCM), agenda sync inicial. |
| `workspace/meta-connection/sync/route.ts` | POST "atualizar agora" (enfileira job). |
| `workspace/meta-connection/accounts/route.ts` | Lista contas + vincula/desvincula marca. |

O job 6h entra como função Inngest na rota `/api/inngest` existente (sem
rota nova). Nenhum arquivo em `src/server/ai/`.

## Fora do escopo

- Nova página, grupo de dashboard ou árvore de API.
- App Review, produção multi-tenant, KMS, rotação de chave.
- Landing Page e Persona Simulation continuam congelados.

## Consequências

- Depois do merge em `main`, o PR de rotas passa o gate para os artefatos acima.
- Qualquer outra rota nova continua bloqueada.
- Fechar #348 não autoriza apontar produção para a Graph de clientes (spec).
