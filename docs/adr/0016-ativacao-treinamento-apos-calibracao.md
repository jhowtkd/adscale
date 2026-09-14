# 0016 — Ativar treinamento após calibração visual validada

**Data:** 2026-09-13
**Status:** Aceita como direção de produto; execução em definição
**Decisor:** Jhonatan Soares

## Contexto

A revisão de descrições e regras extraídas não demonstra, por si só, que o treinamento produz o resultado visual esperado. O operador solicitou que cada rodada de treinamento inclua geração de várias Peças de teste, avaliação humana e ajuste do aprendizado.

## Decisão

Uma nova versão do treinamento só entra em uso depois de o operador validar os exemplos da calibração. Enquanto a nova versão estiver em revisão ou calibração, a versão anterior permanece ativa; no primeiro treinamento, a nova versão permanece pendente até a validação.

O lote padrão de calibração é de quatro imagens por rodada, escolhidas para testar aspectos diferentes do aprendizado. Rodadas seguintes devem focar nos problemas apontados, preservando o que já funcionou.

O teto inicial é de três rodadas por treinamento: uma inicial e duas de ajustes, totalizando até 12 imagens. A calibração termina antes se o operador aprovar. Se a qualidade continuar insuficiente ao atingir o teto, a nova versão permanece pendente e cabe ao operador decidir se abre outra rodada.

## Consequências

A calibração integra o caminho de ativação do conhecimento da marca e exige tempo, orçamento e participação humana. A validação dos exemplos deve corresponder à versão do conhecimento que será ativada; ela não representa autorização para publicar as Peças de teste. O teto de imagens não fixa um preço: cálculo e apresentação do custo, contabilização de falhas e critérios de cobertura ainda serão definidos no plano técnico.

## Alternativa considerada

Ativar o novo treinamento antes da calibração e ajustar os resultados já em uso foi rejeitado. A validação prévia permite conferir o efeito visual do aprendizado e preserva a versão anterior durante os ajustes.
