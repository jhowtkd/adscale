# Estúdio peça na caixa

Accepted 2026-09-10. Esta decisão registra o recorte aprovado do protótipo
contido sem reescrever a tese do CONTEXT.md.

Revisão obrigatória aqui é a confirmação operacional de uma geração cobrada,
não um wizard obrigatório para editar briefing. "Versões" designa histórico
de revisão e "Criar variação" mantém a base no mesmo Trabalho. A UI não muda
o protocolo do rascunho para produzir um filho.

Contrato desta frente (B1): rascunho de revisão salvo por output com CAS
próprio (`review_draft` mutável, `revision_context` imutável no filho),
GET público projeta `reviewDraft`, `revisionContext` e `revisionCreditCost`
canônico sem expor chaves privadas de storage. `claimCreativeWorkOutputImageCall`
aceita `maxCalls: 1 | 2` com default canônico, e
`getCreativeWorkSourceAssetDetails` projeta `width/height` existentes de
`workspace_assets`. Save não modifica `updatedAt` operacional do output.

Esta especificação substitui as propostas visuais anteriores de expansão e os
trechos que mantinham a página de resultado separada, apenas neste recorte.
