# Ubiquitous Language

## Produção criativa

| Termo | Definição | Evitar |
| --- | --- | --- |
| **Trabalho** | Unidade criativa retomável que reúne intenção, briefing, fontes, estado e resultados sob uma marca. | Campanha como sinônimo, job, projeto |
| **Campanha** | Agrupamento opcional de Trabalhos que compartilham uma iniciativa, objetivo ou período. | Trabalho, pasta |
| **Protocolo** | Modo de criação aplicado a um Trabalho. | Ferramenta, fluxo, tipo de campanha |
| **Rascunho** | Estado editável e retomável de um Trabalho, vinculado a um único Protocolo. | Sessão temporária, formulário descartável |
| **Peça** | Resultado visual produzido por um Trabalho. | Output, asset gerado, derivação |
| **Variação** | Peça criada como alternativa relacionada a uma base, direção ou Peça anterior. | Versão, derivação |
| **Versão** | Estado sucessor da mesma Peça após uma revisão. | Variação |
| **Veredito objetivo** | Avaliação automática de integridade: aprovado, reprovado ou inconclusivo. | Score subjetivo, aprovação humana |
| **Aprovação humana** | Decisão explícita do operador de selecionar uma Peça. | Veredito objetivo, seleção automática |

## Superfícies

| Termo | Definição | Evitar |
| --- | --- | --- |
| **Início** | Superfície operacional para começar um Trabalho ou retomar o mais relevante. | Dashboard |
| **Trabalhos** | Lista canônica de todos os Trabalhos, com Campanha como filtro ou agrupamento. | Campanhas como nome da lista |
| **Visão geral** | Superfície gerencial secundária para indicadores, atividade e itens que exigem atenção. | Dashboard como nome visível, Início |

## Papéis

| Termo | Definição | Evitar |
| --- | --- | --- |
| **Dono da plataforma** | Operador autorizado a acessar dados e ferramentas globais do ADScale entre workspaces. | Owner do workspace, admin do workspace |

## Relações

- Um **Trabalho** pertence a uma marca e pode participar de no máximo uma **Campanha**.
- Uma **Campanha** pode agrupar zero ou mais **Trabalhos**.
- Um **Trabalho** usa um **Protocolo** e produz uma ou mais **Peças**.
- Um **Rascunho** pertence a um único **Protocolo**; trocar de Protocolo preserva o atual e abre ou retoma outro Rascunho.
- Uma **Variação** é uma **Peça** relacionada a uma base, direção ou Peça anterior.
- Uma **Versão** preserva a identidade da mesma **Peça** ao longo de revisões.
- Um **Veredito objetivo** reprovado bloqueia a **Aprovação humana**; um veredito inconclusivo ou ausente exige confirmação explícita.
- **Início**, **Trabalhos** e **Visão geral** são superfícies distintas: criar/retomar, localizar/organizar e gerir, respectivamente.

## Exemplo de diálogo

> **Produto:** “Este Trabalho usa o Protocolo Variações e gerou três Peças.”
>
> **Design:** “As três são Variações da mesma base ou Versões da mesma Peça?”
>
> **Produto:** “São Variações. Se revisarmos uma delas, o resultado será uma nova Versão daquela Peça.”
>
> **Design:** “E a Campanha?”
>
> **Produto:** “É opcional; serve para agrupar esse Trabalho com outros da mesma iniciativa.”

## Ambiguidades resolvidas

- **Campanha** não é sinônimo de **Trabalho**; a lista principal chama-se **Trabalhos** e usa Campanha como agrupamento.
- **Derivação** permanece como termo técnico legado e não deve aparecer como nome principal de uma Peça na interface.
- **Variação** e **Versão** não são equivalentes: a primeira cria uma alternativa; a segunda revisa a mesma Peça.
- **Dashboard** não nomeia uma superfície visível: **Início** é operacional e **Visão geral** é gerencial.
- **Dono da plataforma** é um papel global e não deriva do papel owner ou admin de um workspace.
- Score subjetivo é consultivo: não libera nem bloqueia a **Aprovação humana**.
