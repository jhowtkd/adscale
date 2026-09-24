# Exceção ao congelamento: detalhe do histórico de Brand Knowledge

**Data:** 2026-09-24  
**Status:** Proposta — aprovada quando este commit for mergeado na `main`  
**Manifesto:** [`allowed-primary-destinations.json`](./allowed-primary-destinations.json)  
**PR de implementação:** [#525](https://github.com/jhowtkd/adscale/pull/525) · **Issue:** [#505](https://github.com/jhowtkd/adscale/issues/505)

## Contexto

O GET atual de Brand Knowledge envia o snapshot completo de cada versão do
histórico. A #505 reduz a lista a metadados e busca o snapshot somente quando
o operador abre uma versão. O contrato da nova rota foi autorizado pelo usuário,
mas o anti-expansion gate recusa qualquer arquivo de rota novo até que a exceção
esteja no snapshot da `main`.

## Escopo da exceção

Somente `client-profiles/[id]/brand-knowledge/versions/[versionId]/route.ts`:
GET autenticado, somente-leitura, aninhado ao módulo Brand Training existente.
A consulta verifica workspace, perfil e versão; versão fora do escopo retorna
404. A interface usa a rota apenas para expandir o histórico.

Não cria página, destino criativo, árvore de API, tabela, chamada paga ou
permissão de publicação. As demais rotas e o freeze permanecem sujeitos ao gate.

## Consequência

Após o merge desta exceção na `main`, a #525 incorpora essa base e seu CI pode
validar a rota. O snapshot da branch de implementação não substitui esta
decisão na base.
