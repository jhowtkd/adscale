# 0016 — Ativar treinamento após calibração visual validada

**Data:** 2026-09-13
**Status:** Aceita como direção de produto; execução em definição
**Decisor:** Jhonatan Soares

## Contexto

A revisão de descrições e regras extraídas não demonstra, por si só, que o treinamento produz o resultado visual esperado. O operador solicitou que cada rodada de treinamento inclua geração de várias Peças de teste, avaliação humana e ajuste do aprendizado.

## Decisão

Uma nova versão do treinamento visual só entra em uso depois de o operador validar os exemplos da calibração. Enquanto a nova versão estiver em revisão ou calibração, a versão anterior permanece ativa; no primeiro treinamento, a nova versão permanece pendente até a validação.

O lote padrão de calibração é de quatro imagens por rodada, escolhidas para testar aspectos diferentes do aprendizado. Rodadas seguintes devem focar nos problemas apontados, preservando o que já funcionou.

O teto inicial é de três rodadas por treinamento: uma inicial e duas de ajustes, totalizando até 12 imagens. A calibração termina antes se o operador aprovar. Se a qualidade continuar insuficiente ao atingir o teto, a nova versão permanece pendente e cabe ao operador decidir se abre outra rodada.

## Consequências

A calibração integra o caminho de ativação do conhecimento da marca e exige tempo, orçamento e participação humana. A validação dos exemplos deve corresponder à versão do conhecimento que será ativada; ela não representa autorização para publicar as Peças de teste. O teto de imagens não fixa um preço: cálculo e apresentação do custo, contabilização de falhas e critérios de cobertura ainda serão definidos no plano técnico.

## Alternativa considerada

Ativar o novo treinamento antes da calibração e ajustar os resultados já em uso foi rejeitado. A validação prévia permite conferir o efeito visual do aprendizado e preserva a versão anterior durante os ajustes.

## Emenda — D3: orientação aprendida textual e visual

**Data:** 2026-10-15

**Status:** Aceita, conforme D2/D3 da spec #640; esta emenda integra B2b (#694).

A regra de calibração prévia acima se aplica ao conhecimento e à orientação aprendida de natureza **visual**. Orientação de **texto**, como voz e convite, entra em vigor após a aprovação do texto literal pelo Dono da plataforma, com categoria, natureza, papéis e escopo de uso confirmados. Não exige sessão visual, rodada 4:5 nem conclusão do holdout. A aprovação respeita a autorização local da marca e os orçamentos da orientação; não confirma fatos, flexibiliza integridade objetiva nem autoriza publicação.

Cada aprovação cria a próxima revisão imutável da orientação. A regra mantém identidade estável por workspace, marca, categoria e fatia sustentada, e projeta seu estado atual; candidatas e edições em revisão não substituem a seleção elegível anterior. Repetir o mesmo aceite devolve a decisão já registrada, sem outra revisão ou reatribuição de autoria. O número da revisão da orientação é distinto da revisão da Peça e da versão fixa de prompt.

A ativação visual continua dependendo da Calibração da marca validada por um operador membro do workspace, vinculada ao **conjunto exato de revisões visuais** e ao contexto em que serão aplicadas. Candidata, hash do conjunto, sessão e prova devem identificar workspace, marca, papéis de destino, modo/protocolo de geração, formato e instrução fixa pertinente. Mudar revisão, texto, conjunto ou instrução fixa invalida a correspondência da prova anterior; prova ausente, pendente, rejeitada ou de outro contexto não ativa a orientação visual. Uma prova 4:5 não comprova 9:16 nem carrossel. Mantém-se uma única sessão aberta por marca, e a seleção elegível anterior segue em uso enquanto a nova candidata aguarda a prova pertinente; sem seleção anterior, o visual permanece pendente.

O efeito da orientação textual já aprovada será medido por holdout no **P3**. A definição D4 (marcas/dados autorizados, janela, braços, critério humano e teto de gasto) e a autorização precedem o experimento real de efeito. Essa medição não é condição de ativação textual e sua ausência não equivale a evidência de melhoria.

A divisão de poderes de D2 permanece: Dono da plataforma aprova texto e gere orientação aprendida; owner/admin do workspace gere consentimento; operador membro valida e ativa conhecimento visual. Não há delegação de aprovação por marca. Esta emenda não altera os limites de rodadas e imagens definidos acima nem as regras de Aprovação humana das Peças.
