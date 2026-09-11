# 0014 — Carrossel editorial: aprovações de gancho, roteiro e capa neste Protocolo

**Data:** 2026-09-10
**Status:** ✅ Aceita
**Decisor:** Jhonatan Soares (founder)

## Contexto

O Protocolo de carrossel no Estúdio precisa transformar tema e materiais em argumento pesquisado, três ganchos e um roteiro com intenção visual, com decisões humanas antes da produção de imagens. O fluxo aprovado nesta data é: tema e materiais → pesquisa → três ganchos → escolha → roteiro com intenção visual → aprovação → capa piloto → aprovação visual → demais slides → revisão final.

Um print coincidiu com o simulador local E2E em `carousel-editorial.ts`: `controlledSlideTexts` fatia o pedido e `controlledPlannerResponse` preenche o propósito com “Slide N do pedido”. Esse caminho só entra quando `isE2EControlledProviderEnabled()` é verdadeiro; o planejador normal faz uma chamada estruturada de texto e não pesquisa fontes externas.

A inspeção desta decisão reproduziu o ramo do simulador e o ramo da chamada mockada em testes autorizados. Flags relevantes (`E2E_CONTROLLED_PROVIDER`, `E2E_CONTROLLED_PROVIDER_PREVIEW`, `E2E_DISABLE_RATE_LIMIT`, `APP_URL`, `NODE_ENV`) foram conferidas só por nome. Sem acesso ao ambiente do print, **o diagnóstico de origem daquele rascunho permanece não confirmado**: o texto recortado é compatível com o simulador, mas também pode ter vindo de dados de teste persistidos. Não se altera o guard de produção nem se desliga o simulador por suposição.

O CONTEXT.md já estabelece que a IA infere o briefing e que revisá-lo é opção, não etapa obrigatória. As aprovações editoriais deste carrossel não podem generalizar um briefing manual para os demais Protocolos.

## Decisão

As aprovações de **gancho**, **roteiro** e **capa** são específicas deste Protocolo de carrossel editorial. Elas não tornam briefing manual obrigatório para Variações, Peça única, Adaptar formatos, Mudar estilo nem para qualquer outro Protocolo.

- Manter um único Trabalho com `toolKind: carousel`, rascunho persistido e controlador existente.
- Pesquisa e planejamento textual não cobram unidades de geração de imagem.
- Publicação fica fora deste fluxo.
- O simulador E2E permanece para testes herméticos. Seu resultado não conta como avaliação editorial real, verdade factual, qualidade criativa nem evidência de produção.
- Corrigir a causa de um rascunho “Slide N do pedido” somente se o ambiente autorizado comprovar o guard violado. O teste de regressão com `vi.importActual` já mostra que flags de teste **não** habilitam o simulador em domínio de produção (`APP_URL=https://app.example.com` com `NODE_ENV=production`).

## Consequências

**Mais fácil:**

- Próximas tarefas (estado, pesquisa, API, gates, UI) têm uma decisão canônica para gates humanos deste Protocolo.
- Outros Protocolos continuam com briefing inferido; revisar permanece opcional.
- Testes distinguem simulador (sem `chat.completions.create`) da chamada real mockada, sem confundir os dois.

**Mais difícil:**

- O carrossel editorial exige pausas humanas (gancho, roteiro, capa) que os demais Protocolos não herdam.
- Diagnóstico do print continua aberto até inspeção do ambiente correspondente; não se trata o simulador como incidente de produção sem essa evidência.

**Destrava:**

- Envelope editorial versionado, pesquisa com proveniência e gates de geração podem ser implementados sem alargar briefing manual ao produto inteiro.

## Alternativas consideradas

- **Tornar briefing manual obrigatório em todos os Protocolos:** rejeitado. Contradiz o CONTEXT.md e o ADR 0013; as pausas deste carrossel são do argumento visual, não um novo ritual global.
- **Tratar o print como prova de simulador em produção e alterar `e2e-controlled-provider.ts`:** rejeitado. O ambiente do print não foi inspecionado; o guard já recusa domínio de produção mesmo com as flags de teste ligadas.
- **Desativar o simulador nos testes para “parecer produção”:** rejeitado. O simulador é a costura local autorizada; a regressão deve distinguir os ramos, não apagar um deles.
- **Manter o planejador antigo como caminho paralelo sem aprovações:** rejeitado. O fluxo aprovado substitui essa alternativa para este Protocolo; ausência de comando inicia a proposta de ganchos, não o recorte determinístico como produto.

---

*Decidido em 2026-09-10 · Registrado 2026-09-10 · Diagnóstico do print: não confirmado.*
