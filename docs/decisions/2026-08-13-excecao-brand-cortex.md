# Exceção ao congelamento: Córtex da Marca

**Data:** 2026-08-13
**Status:** Proposta — aprovada quando este commit for mergeado na `main`
**Manifesto:** [`allowed-primary-destinations.json`](./allowed-primary-destinations.json)
**Demanda:** issue #228 (Córtex da Marca na Peça única)

## Contexto

O Córtex da Marca estende o Brand Training existente com conhecimento
versionado e fontes aprovadas. Ele não cria uma nova jornada criativa: a
geração continua no `creative_work` canônico e consome um snapshot imutável
da identidade publicada.

## Escopo da exceção

Somente estas rotas de suporte entram no snapshot:

| Artefato | Motivo |
| -------- | ------ |
| `client-profiles/[id]/brand-fonts/route.ts` | Listar fontes de marca aprovadas para revisão e seleção. |
| `client-profiles/[id]/brand-knowledge/route.ts` | Ler e editar o rascunho versionado do conhecimento da marca. |
| `client-profiles/[id]/brand-knowledge/publish/route.ts` | Publicar uma versão somente após aprovação humana. |

O manifesto também absorve rotas e módulos que já existem na `main` e eram
aceitos pelo reparo de drift do gate. Isso sincroniza o snapshot sem autorizar
nenhum artefato adicional desta mudança.

## Consequências

- O fluxo permanece dentro de Brand Training e Peça única.
- Campanhas, novas páginas e novas árvores de API continuam fora do escopo.
- Qualquer outra expansão segue bloqueada pelo gate.
