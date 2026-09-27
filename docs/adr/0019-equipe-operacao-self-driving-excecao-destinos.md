# 0019 — ADScale Equipe: operação de marketing self-driving sobre o Trabalho, com exceção ao congelamento para Pipeline, Ideias e Metas

**Data:** 2026-09-27
**Status:** Aceita
**Decisor:** Jhonatan Soares (founder)
**Ticket:** [jhowtkd/adscale#538](https://github.com/jhowtkd/adscale/issues/538) — Spec: ADScale Equipe — operação de marketing self-driving (fluxos centrais)

## Contexto

O ADScale produz Peças com a marca do cliente, mas não **opera** o marketing de uma conta:
- não faz plano, calendário, cobrança de aprovações, publicação nem acompanhamento de resultado;
- a proposta de produto "ADScale Equipe" (agência de IA com atendimento humano só em exceções) foi debatida, desenhada em fluxos centrais e aprovada nas telas v3.

Três restrições canônicas se aplicam:
- **ADR 0013:** uma espinha só (Trabalho criativo-first). Chat, painel e HTTP são adapters; nenhuma regra de negócio duplicada.
- **Congelamento de destinos primários** (`docs/decisions/allowed-primary-destinations.json`): durante a convergência, nenhum destino primário novo nem pipeline criativo novo. Exceções exigem funil com escopo de Trabalho (`docs/decisions/2026-09-12-funnel-read-gate8-holds.md`).
- **Glossário** (`CONTEXT.md`): Aprovação humana, Seleção por agente e Calibração da marca já têm sentido fixo.

A Equipe precisa de três superfícies do cliente que não existem hoje: **Pipeline**, **Ideias** e **Metas**. Precisa também de consoles internos para exceções, o pipeline entre contas e a qualidade.

## Decisão

1. **Um app só.** A Equipe não é produto separado nem tem switch "Estúdio | Equipe". É um contexto de serviço dentro do ADScale: o cliente vê o que ele mesmo cria no Estúdio e o que a Equipe entrega no mesmo lugar.
2. **Não é pipeline criativo novo.** Toda Peça continua nascendo de um Trabalho, por um Protocolo existente. A Equipe **opera sobre** Trabalhos e Peças (planeja, pede aprovação, agenda, publica, lê resultado) e não gera fora dos Protocolos. Nenhum arquivo novo em `src/server/ai/` é autorizado por este ADR.
3. **Destinos reaproveitados, sem exceção:**
   - **Conversa** = evolução do **Assistente**, destino já permitido;
   - **Criações** = Biblioteca e Trabalhos, que já existem.
4. **Exceção ao congelamento, só para:**
   - três destinos do cliente: **Pipeline** (itens por etapa), **Ideias** (propostas da equipe de IA) e **Metas** (Plano do ciclo, acompanhamento da Implantação, Frentes e Mandatos);
   - os consoles internos (**Exceções**, **Pipeline entre contas**, **Qualidade**), dentro do grupo interno já existente, com acesso por papel;
   - a árvore de API que esses destinos precisarem.
5. **Uma implementação canônica das regras.** Um único módulo de aplicação ("Operação da conta") concentra as regras de Implantação, Lote, Item, Versão, Recibo, Calibração da frente, Escalonamento, Exceção de atendimento, Pausa e Despacho de publicação.
   - Assistente, Pipeline, Ideias, Metas, consoles, jobs duráveis e agentes de IA são adapters (ADR 0013, princípios 1 e 2).
   - É também o único ponto de teste.
6. **Aprovação:**
   - A aprovação de um Item, Plano ou Mandato pelo Aprovador ou pelo Substituto é **Aprovação humana**, registrada em **Recibo** (pessoa, versão, data e hora).
   - Agentes de IA **nunca** aprovam. A Seleção por agente continua distinta e não vale como aprovação.
   - Texto livre ("ok", "pode postar") na conversa não é aprovação.
7. **Única escrita externa autorizada:** publicar post estático no Instagram a partir de Item aprovado, com Mandato, dentro da janela assistida e dos limites do contrato, passando pelo Despacho de publicação.
   - O Despacho persiste a intenção antes de enviar e usa chave de idempotência.
   - Reconcilia sempre que o resultado for incerto.
   - Qualquer outra escrita externa exige ADR próprio.
8. **Mecânica do gate.** O `check-primary-destinations` lê o snapshot da **base**. Por isso:
   - os entrypoints exatos são definidos no plano técnico;
   - eles são registrados no manifesto (`allowedPrimaryDestinations` + `snapshots`), com a nota "Exceção aprovada em 2026-09-27 (ADR 0019)";
   - o registro vai num PR próprio, mergeado na `main` **antes** de qualquer PR de implementação.
   - Este ADR não altera o manifesto.
9. **O resto do congelamento continua.**
   - Nenhum outro destino novo.
   - Landing Page e Persona Simulation continuam congeladas.
   - O hold do Gate 8 sobre o Estúdio não muda.
10. **Base da exceção.** A exceção é uma **decisão de produto do fundador** (nova linha de serviço), não evidência de funil: não existe funil para um serviço que ainda não opera.
    - **Revisão:** ao fim do piloto (até 2 contas, 90 dias de operação).
    - **Se não converter:** Pipeline, Ideias e Metas saem do manifesto e das rotas, e o módulo fica sem superfície.

## Consequências

- **O que fica mais fácil:**
  - construir a Equipe sem criar outro app nem outra jornada criativa;
  - reaproveitar o Assistente, Trabalho, Peça, Calibração da marca, Conexão Meta e a orquestração durável que já existem;
  - testar todas as regras num ponto só.
- **O que fica mais difícil:**
  - o Assistente passa a carregar a conversa com a equipe de IA, e precisa de cuidado para não misturar o chat de criação com a condução da conta;
  - os termos novos do `CONTEXT.md` precisam ser respeitados em código e UI;
  - toda rota nova precisa do PR de manifesto antes.
- **O que destrava:** a spec [#538](https://github.com/jhowtkd/adscale/issues/538), o plano técnico e a quebra em tickets.
- **Pendências para o plano técnico:**
  - persistência (tabelas próprias no mesmo banco × banco próprio);
  - formato do Recibo de Plano e Mandato;
  - rótulo final do seletor de vista;
  - spike de carga (50 contas sintéticas) antes do piloto.

## Alternativas consideradas

- **Produto separado servido em `/equipe`, com switch:** rejeitado pelo fundador em 27/09. Dois produtos para o mesmo cliente contradizem o "um app só" e a espinha do ADR 0013.
- **Tudo dentro do Assistente, sem destinos novos:** rejeitado. O acompanhamento semanal precisa de vistas próprias: o pipeline por etapa e as metas com o Plano. As telas v3 aprovadas dependem delas, e a conversa sozinha esconde o estado.
- **Esperar evidência de funil antes da exceção:** rejeitado. O critério do Gate 8 mede jornadas do Estúdio e não se aplica a um serviço novo. Em troca, a exceção tem prazo de revisão e critério de remoção.
- **Criar um pipeline criativo próprio da Equipe:** rejeitado. Duplicaria geração, cobrança e qualidade, violando o princípio 1 do ADR 0013.
