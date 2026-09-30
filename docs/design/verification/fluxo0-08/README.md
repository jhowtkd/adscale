# Diagnóstico grátis · ticket 08

Capturas de 30/09/2026, Chromium (Playwright) contra `next dev`, tema escuro, movimento reduzido. Os dados (marca Café Aurora, resumo, canais, oportunidades, trechos) são **fixtures sintéticas**; nenhuma chamada paga, leitura externa ou escrita em produção. A página que monta a cena é um arnês temporário (não versionado) que renderiza a `AssistantMessageList` de produção com uma mensagem `equipe_card` de `kind: "diagnosis"`; o card, as iscas e o diálogo são os componentes reais (`DiagnosisCard`, `DiagnosisDocument`).

| Evidência | O que mostra | Limite |
| --- | --- | --- |
| [D1 lado a lado](d1-comparison.png) | Recorte do PNG `d1-diagnostico-gratis.png` (PR 604) à esquerda e o componente à direita (desktop, coluna de 645 px como no PNG) | Só a coluna da conversa: a barra lateral e o compositor da v4 são do ticket 09 |
| [Card pronto](ready-desktop.png) · [mobile](ready-mobile.png) | Resumo, os dois canais, 3 oportunidades, "Não encontrado… Nada foi inventado" e as três iscas fixas | Mobile em 390 px sem rolagem horizontal (`scrollWidth === innerWidth`) |
| [Fonte única](single-source-desktop.png) | Só o site: um canal e uma oportunidade; o que faltou (Instagram) aparece em "Não encontrado" | |
| [Conteúdo insuficiente](insufficient-desktop.png) | Documento honesto: 0 oportunidades, o que foi lido, o que não foi encontrado e a isca para corrigir/acrescentar a fonte | Sem desenho na v4; segue a linguagem do D1 |
| [Falha](failed-desktop.png) | Card de erro com a isca "Tentar de novo" | Sem desenho na v4 |
| [Montando o diagnóstico](building-desktop.png) | Linha da conversa enquanto a tarefa roda | |
| [Documento](document-desktop.png) · [mobile](document-mobile.png) | "Abrir documento": resumo, o que cada fonte conta, oportunidades, não encontrado e os trechos literais que sustentam cada afirmação | Mobile vira folha inferior, sem rolagem horizontal |

Diferenças conscientes em relação ao D1: "O diagnóstico **de** Café Aurora" (o PNG usa "da", que só serve a nomes femininos); pontos de origem nas cores do sistema (âmbar/azul) em vez do laranja/azul do PNG; as duas primeiras iscas seguem o texto aprovado pelo mediador (o PNG mostra outras frases de exemplo). A linha "Biblioteca montada · N itens" do PNG não existe nos tickets 04/07 e fica fora do 08.

Estas capturas não comprovam a geração real pelo modelo, a home autenticada nem a aceitação visual humana.
