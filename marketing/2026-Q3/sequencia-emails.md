# Sequência de E-mails — ADScale

> Copy completa de todas as automações de e-mail, alinhada com
> `marketing/brand/tom-de-voz.md` e `marketing/copy/sales-page.md`.
>
> **Stack:** Resend (já no ADScale) + Loops ou Resend Audiences.
> **Idioma:** PT-BR como padrão. Versões EN quando destinatário for LinkedIn/EN.
> **Compliance:** LGPD + CAN-SPAM. Todo e-mail tem link de descadastro.

---

## 0. Convenções de copy

- **Assunto:** ≤ 50 caracteres, sem caps lock, sem emoji de exclamação.
- **Pré-header:** ≤ 90 caracteres, complementa o assunto (não repete).
- **Corpo:** 1 ideia por e-mail, 1 CTA principal.
- **Tom:** consistente com `tom-de-voz.md` — direto, técnico, sem corporate.
- **Rodapé:** assinatura pessoal (Jhonatan) + link de descadastro + razão social.

**Variáveis de personalização usadas:**

- `{{first_name}}` — primeiro nome do destinatário
- `{{company}}` — empresa (se coletou)
- `{{trial_end_date}}` — data de fim do trial (sequência 5)

---

## 1. Sequência 1 — Boas-vindas waitlist (3 e-mails)

**Trigger:** signup na página de waitlist.
**Objetivo:** confirmar inscrição, entregar valor, manter lead quente até o lançamento.
**Janela:** 7 dias.

### 1.1 E-mail #1 — Confirmação imediata (D+0)

**Assunto:** Você está na lista
**Pré-header:** E o que vem por aí nos próximos 7 dias.

```
Oi {{first_name}},

Confirmação rápida: você está na lista do ADScale.

O que isso significa na prática:

- Você vai receber um e-mail por semana com bastidor do que estou construindo.
- Quando lançar (em algumas semanas), você entra com condição especial.
- Antes de todo mundo.

Nos próximos dias vou te mandar 2 e-mails:
1. Um sobre por que decidi construir o ADScale do zero.
2. Um com 3 erros que vejo toda agência cometendo em produção de criativos.

Se tiver alguma pergunta agora, responde esse e-mail. Eu leio tudo.

Abraço,
Jhonatan
Founder, ADScale
```

**CTA:** botão "Responde esse e-mail" (mailto).

### 1.2 E-mail #2 — Por que criei o ADScale (D+3)

**Assunto:** Por que parei tudo pra construir isso
**Pré-header:** 18 meses olhando o mesmo problema. Achei a saída.

```
Oi {{first_name}},

Em 2024 eu olhei pro mercado de produção de criativos pra ads e vi uma coisa:
as ferramentas existentes te obrigam a escolher entre velocidade e qualidade.

- Velocidade: gera 50 criativos em 5 minutos. 80% não serve.
- Qualidade: designer leva 3 dias pra entregar 5 criativos. Você não testa.

O ADScale existe porque isso é uma falsa dicotomia.

A ideia: a IA cuida da parte operacional (variação, adaptação de formato,
restyling). O humano cuida do que importa (estratégia, briefing, aprovação).

Subi um criativo teste na semana passada, gerei 24 variações em 11 minutos,
aprovei 9. Antes eu esperava 2 dias pelo designer.

Quando você tá na lista, esse tipo de update é o que você vai receber.
Bastidor real. Sem filtro.

Abraço,
Jhonatan
```

**CTA:** botão "Ver 1 demo de 60s" → link pro Reel.

### 1.3 E-mail #3 — Erro recorrente + educação (D+7)

**Assunto:** 3 erros que travam a produção de criativos
**Pré-header:** Erro #1 afeta 80% das agências que vejo.

```
Oi {{first_name}},

Tô rodando o ADScale com 5 agências beta. Em 2 meses, vi 3 erros que se repetem em todas:

1. Tratar variação como projeto.
   Variação é batch. 1 criativo base gera 20 derivações, não 20 projetos individuais.
   O erro: cobrar por unidade. O certo: cobrar por campanha.

2. Briefing vago.
   "Quero algo moderno e clean" não é briefing. É desperdício de designer.
   O certo: objetivo, público, tom de voz, oferta, plataformas. 5 campos. 2 minutos.

3. Adaptar formato manualmente.
   1:1, 4:5, 9:16, 16:9 — 4 formatos pra Meta, TikTok e Google. Fazer um por um é
   o motivo de a maioria das agências não testar mais de 2-3 criativos por campanha.

O ADScale resolve os 3. Mas mesmo sem o produto, dá pra eliminar 80% do retrabalho
só corrigindo o briefing.

Próximo e-mail: vou te mostrar o que tô preparando pro lançamento.

Abraço,
Jhonatan
```

**CTA:** botão "Responde: qual desses 3 é seu maior vilão?" (mailto).

---

## 2. Sequência 2 — Anúncio de lançamento (4 e-mails)

**Trigger:** agendada por data (T-7, T-3, T-1, T0).
**Objetivo:** converter lead da waitlist em trial no dia do lançamento.
**Janela:** 7 dias.

### 2.1 E-mail #4 — Aviso prévio (T-7)

**Assunto:** Falta 1 semana
**Pré-header:** ADScale abre pra todo mundo no dia [DATA].

```
Oi {{first_name}},

Falta 1 semana pro ADScale abrir.

O que vai ter no dia 0:
- Acesso imediato (sem fila) pra quem tá na waitlist.
- 14 dias grátis (sem cartão).
- 30% de desconto vitalício pros 100 primeiros que ativarem.

Não vou te mandar mais e-mail "contagem regressiva". Só esse.
Os outros 3 que vêm agora são: dica pra usar bem, link de acesso, e "como foi o dia 1".

Abraço,
Jhonatan
```

**CTA:** botão "Adiciona ao calendário" (arquivo .ics com a data).

### 2.2 E-mail #5 — Dica pra começar (T-3)

**Assunto:** 3 coisas pra ter pronto no dia 0
**Pré-header:** Quanto mais preparado, mais rápido você vê valor.

```
Oi {{first_name}},

Quando o ADScale abrir, dá pra testar em 5 minutos. Mas se você
quiser extrair o máximo no primeiro dia, deixa 3 coisas prontas:

1. 1 criativo base (PNG ou JPEG) que você queria transformar em variações.
   Pode ser um que já performou, ou um que tá em produção agora.

2. 1 briefing de 5 linhas:
   - Objetivo (ex: conversão pra lead)
   - Público (ex: donos de agência, 30-45)
   - Tom (ex: técnico, direto)
   - Oferta (ex: trial grátis 14 dias)
   - Plataformas (ex: Meta + Google)

3. Workspace criado na sua conta (vou te mandar o link no dia 0).

Quem chegar com isso pronto vai sair do dia 0 com 10+ criativos prontos pra rodar.

Abraço,
Jhonatan
```

**CTA:** botão "Salva esse e-mail" (mailto de si mesmo).

### 2.3 E-mail #6 — Acesso liberado (T-1)

**Assunto:** Amanhã, 9h
**Pré-header:** Teu link de acesso tá aqui. Bora?

```
Oi {{first_name}},

Amanhã, 9h (horário de Brasília), o ADScale abre pra waitlist.

Teu link de acesso: [LINK-PESSOAL-DA-WAITLIST]

Algumas coisas que vão acontecer amanhã:
- 9h00: e-mail "ADScale está no ar" com link direto de login.
- 12h00: live de 30 min mostrando o fluxo completo (briefing → exportação).
- 20h00: e-mail com números do dia 1 (signups, primeiro case, próximos passos).

E o que importa pra você:
- 14 dias grátis. Sem cartão.
- Se você for um dos 100 primeiros a ativar, ganha 30% vitalício.

Te vejo amanhã.

Abraço,
Jhonatan
```

**CTA:** botão "Quero entrar amanhã" → link de login (placeholder por enquanto).

### 2.4 E-mail #7 — Lançamento T0 (T0, 9h)

**Assunto:** ADScale está no ar
**Pré-header:** Teu link de acesso, tua condição especial, e 1 vídeo de 60s.

```
Oi {{first_name}},

ADScale está no ar.

Teu link de acesso (válido por 24h): [LINK-WAITLIST]

Aqui o que muda pra você a partir de agora:
- 14 dias grátis pra testar o fluxo completo.
- 30% de desconto vitalício se for um dos 100 primeiros a ativar.
- Acesso prioritário a features beta.

Como começar em 3 minutos:
1. Clica no link, cria tua conta (ou loga).
2. Sobe 1 criativo base.
3. Clica em "Gerar derivações".

Demora menos de 3 min. Sem cartão. Sem compromisso.

Vou estar em live às 12h mostrando o fluxo na íntegra.
E amanhã de manhã te mando os números do dia 1.

Bora.

Abraço,
Jhonatan

PS: Responde esse e-mail dizendo "ativei" — eu mesmo vou responder com 1 dica
pra tirar o máximo da plataforma no primeiro dia.
```

**CTA:** botão "Entrar no ADScale" → link principal.

---

## 3. Sequência 3 — Onboarding trial (5 e-mails)

**Trigger:** signup no produto (trial iniciado).
**Objetivo:** levar o trial até a 1ª derivação aprovada (ativação).
**Janela:** 14 dias (trial inteiro).

### 3.1 E-mail #8 — Boas-vindas no produto (D+0, 5 min após signup)

**Assunto:** Bem-vindo. 3 passos pra ver valor agora.
**Pré-header:** 5 minutos de leitura = 1 hora de tentativa evitada.

```
Oi {{first_name}},

Bem-vindo ao ADScale.

Você tem 14 dias pra testar. Pra usar bem esse tempo, segue o caminho mais rápido
até o "uau" do produto:

Passo 1 (2 min): Cria uma campanha.
   - Objetivo: o que você quer otimizar (conversão, leads, awareness).
   - Plataformas: Meta, Google, TikTok. Pode escolher mais de uma.

Passo 2 (1 min): Sobe 1 criativo base.
   - PNG ou JPEG. Quanto mais simples, melhor pra começar.

Passo 3 (3 min): Clica em "Gerar plano criativo".
   - A IA vai sugerir ângulos, ganchos e CTAs. Aprova ou edita.

Pronto. Em 5 minutos você tá com 10+ derivações prontas pra revisar.

Se travar em qualquer ponto, responde esse e-mail. Eu leio e respondo pessoalmente.

Abraço,
Jhonatan
```

**CTA:** botão "Criar minha 1ª campanha" → deep link no app.

### 3.2 E-mail #9 — 1ª derivação gerada (D+1, se gerou) OU lembrete (D+1, se não gerou)

**Lógica condicional:**

- **Se gerou 1ª derivação → E-mail #9a**
- **Se NÃO gerou → E-mail #9b**

#### #9a — Gerou (D+1, 24h após signup)

**Assunto:** Viu o que a IA gerou?
**Pré-header:** 3 botões pra decidir rápido.

```
Oi {{first_name}},

Vi que você já gerou as primeiras derivações. Massa.

Olha, 3 coisas que vão te ajudar a decidir mais rápido:

1. Use o filtro "improvable" pra ver o que precisa ajuste fino.
   É onde a IA erra mais, e onde a aprovação humana mais agrega.

2. Compare 2 derivações lado a lado. O app mostra diferença de score
   criativo, formato, e fidelidade à marca.

3. Antes de aprovar, abra o briefing original.
   A aprovação fica mais fácil quando você lembra do objetivo da campanha.

Se quiser ver como fica um caso finalizado, tenho 1 case real (de um beta tester)
que dá pra te mostrar em 60s. Quer que eu mande?

Abraço,
Jhonatan
```

**CTA:** botão "Sim, manda o case" → link pro case.

#### #9b — Não gerou (D+1, 24h após signup)

**Assunto:** Travou em algum lugar?
**Pré-header:** Responde com a palavra e eu te ajudo.

```
Oi {{first_name}},

Vi que você criou a conta mas ainda não gerou a 1ª derivação.

Se travou em algum lugar, responde esse e-mail com a palavra
que melhor descreve:

- "BRIEFING" — não sei como preencher
- "CRIATIVO" — não tenho um criativo base pronto
- "PLATAFORMA" — não sei qual escolher
- "OUTRO" — descreve o problema

Eu respondo pessoalmente em até 24h.

Se tá tudo certo e você só não teve tempo, sem stress. O trial é teu.
Segue o calendário que preparamos:

- D+0 a D+2: 1ª campanha + 1ª derivação.
- D+3 a D+7: revisar 5-10 derivações, exportar as melhores.
- D+8 a D+14: 2ª campanha com o que você aprendeu.

Abraço,
Jhonatan
```

**CTA:** botão "Responde com a palavra" (mailto).

### 3.3 E-mail #10 — Case real (D+3)

**Assunto:** Como a agência X fez 200 criativos em 1 semana
**Pré-header:** Sem contratar ninguém. Só reorganizando o workflow.

```
Oi {{first_name}},

Compartilho aqui um case real (com permissão) de uma agência beta
que tá rodando o ADScale há 6 semanas.

Antes do ADScale:
- 2 designers em tempo integral.
- 8-10 criativos por semana.
- 3-4 dias de prazo médio.

Depois do ADScale:
- Mesma equipe. Zero contratação.
- 200+ criativos por semana.
- Workflow de 2h: briefing → aprovação → export.

O que mudou (palavras do dono da agência):
"A IA cuidou das variações e adaptação de formato. A gente focou no que
importa: estratégia de campanha e aprovação final."

Quer aplicar isso no teu workflow? Tô disponível pra 15 min de call
essa semana. Calendly no link.

Abraço,
Jhonatan
```

**CTA:** botão "Quero 15 min com o Jhonatan" → link do Calendly.

### 3.4 E-mail #11 — Recursos avançados (D+7)

**Assunto:** 3 features que 70% dos usuários não usam (e deviam)
**Pré-header:** Restyling, landing pages, biblioteca de cliente.

```
Oi {{first_name}},

Você tá na metade do trial. Esse e-mail é sobre 3 features que pouca gente
usa, mas que fazem diferença grande no resultado final:

1. Restyling (intensidade: soft / medium / strong)
   Pega um criativo aprovado e aplica o estilo visual de outro (seu ou de marca
   conhecida). Útil pra padronizar visual entre campanhas.

2. Landing pages automáticas
   Quando você aprova um criativo, o ADScale gera uma landing page HTML no
   mesmo estilo. Sem mexer em código. Sem pedir pro dev.

3. Biblioteca de referências de cliente
   Salva logo, paleta, estilo, produtos, "negativos" (o que NÃO fazer).
   Toda derivação nova consulta essa biblioteca. Fidelidade de marca de verdade.

Abre o app, testa 1 dessas 3 hoje, e me conta o que achou.

Abraço,
Jhonatan
```

**CTA:** botão "Testar feature avançada" → deep link na feature.

### 3.5 E-mail #12 — Lembrete final (D+12, 2 dias antes do fim)

**Assunto:** Faltam 2 dias pro trial acabar
**Pré-header:** 3 caminhos pra escolher.

```
Oi {{first_name}},

Seu trial acaba em 2 dias ({{trial_end_date}}).

Não vou te encher o saco. 3 caminhos possíveis:

1. **Você tá usando e tá valendo.**
   Escolhe um plano e segue. Starter é o mais comum pra começar.

2. **Você usou mas ainda tá na dúvida.**
   Me conta o que tá faltando. Eu respondo em 24h. Às vezes é ajuste de
   expectativa, às vezes é feature que falta.

3. **Você não usou.**
   Tudo bem. Cancela ou deixa expirar. Quando quiser voltar, é só logar.

Se for caminho 1 ou 2, clica aqui: [LINK DE CONVERSÃO]

Abraço,
Jhonatan
```

**CTA:** botão "Ver planos" → página de pricing.

---

## 4. Sequência 4 — Recuperação de trial inativo (3 e-mails)

**Trigger:** trial ativo MAS sem atividade há 3+ dias.
**Objetivo:** trazer de volta antes de expirar (D+15 padrão).
**Janela:** 8 dias.

### 4.1 E-mail #13 — Check-in leve (D+3 de inatividade)

**Assunto:** Tá tudo bem?
**Pré-header:** Vi que você sumiu. Aconteceu alguma coisa?

```
Oi {{first_name}},

Vi que você não loga há uns 3 dias. Tudo certo?

Pode ser que:
- Você tá ocupado e esqueceu. Normal.
- Travou em algum lugar e desistiu. Comum.
- Não é pra você. Também tudo bem.

Se for o caso 1: clica aqui pra voltar: [LINK]
Se for o caso 2: responde esse e-mail com o que travou. Eu ajudo.
Se for o caso 3: deixa expirar. Sem cobrança. Sem ressentimento.

Abraço,
Jhonatan
```

**CTA:** botão "Voltar pro app" → deep link.

### 4.2 E-mail #14 — Conteúdo útil (D+7 de inatividade)

**Assunto:** 1 truque de 2 min que economiza 1h
**Pré-header:** Não precisa logar. Só lê e aplica no próximo criativo.

```
Oi {{first_name}},

Você não precisa logar no ADScale pra usar essa dica. Aplica no próximo
briefing que você fizer (com ou sem a gente):

Preenche 5 campos ANTES de chamar o designer:
1. Objetivo (1 linha)
2. Público-alvo (1 linha, específico: "dona de agência de marketing, 30-45, SP")
3. Tom de voz (3 adjetivos: "técnico, direto, sem hype")
4. Oferta (1 linha: "trial grátis 14 dias, sem cartão")
5. Plataformas (Meta + Google, com quais formatos)

5 campos. 2 minutos. Resultado: o designer entrega na primeira vez
o que você queria. Sem 3 rodadas de revisão.

Isso é literalmente o que o Briefing Doctor do ADScale faz, mas vale pra qualquer ferramenta.

Abraço,
Jhonatan
```

**CTA:** botão "Quero tentar o ADScale de novo" → deep link.

### 4.3 E-mail #15 — Última chamada (D+11 de inatividade, 1 dia antes do fim)

**Assunto:** Última coisa que vou te mandar
**Pré-header:** Trial acaba amanhã. Aqui vai meu último pedido.

```
Oi {{first_name}},

Amanhã teu trial acaba.

Esse é o último e-mail que te mando sobre o ADScale.

A minha aposta:
Você tá sem tempo. Não é que o produto não serviu. É que a vida é corrida,
e testar uma ferramenta nova é um peso que não cabe agora.

Tudo bem. Sério.

Se em 60 dias você quiser voltar, tua conta ainda vai tá aqui.
Se não, foi um prazer te ter como beta tester.

Obrigado por testar.

Abraço,
Jhonatan
```

**CTA:** botão "Ativar plano Starter por R$ XX" → link de pricing.

---

## 5. Sequência 5 — Conversão trial → pago (3 e-mails)

**Trigger:** trial terminando (D-3, D-1, D0 do fim).
**Objetivo:** converter trial em assinatura paga.
**Janela:** 3 dias.

### 5.1 E-mail #16 — Aviso prévio (D-3 do fim)

**Assunto:** Trial acaba em 3 dias
**Pré-header:** 3 planos. 1 deles é o seu.

```
Oi {{first_name}},

Faltam 3 dias pro trial acabar. Tua conta continua existindo, mas sem plano
ativo, você perde acesso a:
- Campanhas salvas.
- Derivações geradas.
- Biblioteca de cliente.

Os planos:

🚀 Starter — R$ XX/mês
   30 derivações/mês. Pra freelancer ou agência pequena testando escalada.
   Suficiente pra 1-2 campanhas por semana.

📈 Growth — R$ XX/mês (mais popular)
   120 derivações/mês. Pra time de performance que testa sem parar.
   Suficiente pra 5-10 campanhas por semana.

🏭 Scale — R$ XX/mês
   360 derivações/mês. Pra agência e operação de alto volume.
   Workspaces ilimitados, suporte prioritário, onboarding dedicado.

Se quiser conversar antes de escolher, responde esse e-mail.

Abraço,
Jhonatan
```

**CTA:** botão "Escolher plano" → página de pricing.

### 5.2 E-mail #17 — Bônus por decidir hoje (D-1 do fim)

**Assunto:** 1 dia. Bônus de 50 créditos.
**Pré-header:** Quem escolher plano até amanhã ganha +50 créditos.

```
Oi {{first_name}},

Decidi dar um empurrão: quem ativar qualquer plano até amanhã ganha +50
créditos extras no 1º mês.

Exemplo:
- Starter: 30 + 50 = 80 derivações no 1º mês.
- Growth: 120 + 50 = 170 derivações no 1º mês.

É o dobro, na prática, por 1 mês.

Se não for ativar, tudo bem. Tua conta continua existindo, e quando voltar
(a qualquer momento) é só logar.

Abraço,
Jhonatan
```

**CTA:** botão "Ativar com bônus" → link de pricing com cupom.

### 5.3 E-mail #18 — Último aviso (D0 do fim)

**Assunto:** Último aviso
**Pré-header:** 9h e teu trial expira.

```
Oi {{first_name}},

Daqui a poucas horas teu trial expira.

Sem plano ativo, tu perde:
- 24h pra reativar e manter TUDO (campanhas, derivações, biblioteca).
- Depois disso, fica salvo por 60 dias. Depois, é deletado.

Se quiser ativar, última chance: [LINK]

Abraço,
Jhonatan
```

**CTA:** botão "Ativar agora" → link de pricing.

---

## 6. Sequência 6 — Reativação de trials antigos (2 e-mails)

**Trigger:** trial expirou há 30+ dias, sem conversão em pago.
**Objetivo:** reabordagem com novidade (feature nova, social proof, caso novo).
**Janela:** 14 dias entre e-mails.

### 6.1 E-mail #19 — "O que mudou" (D+30 pós-expiração)

**Assunto:** 4 coisas novas no ADScale desde que você testou
**Pré-header:** Vale uma segunda olhada.

```
Oi {{first_name}},

Faz um tempo desde que você testou o ADScale. Algumas coisas mudaram:

1. **Restyling por referência** — você sobe um estilo, a IA aplica em qualquer criativo.
2. **Briefing Doctor** — IA revisa teu briefing antes de tu começar.
3. **Landing pages automáticas** — aprova criativo, gera landing page no mesmo estilo.
4. **Biblioteca de cliente persistente** — fidelidade de marca entre campanhas.

E tem 1 case novo: agência [X] reduziu tempo de produção em 70% (link).

Se quiser testar de novo, te dou +20 créditos de cortesia.
Responde esse e-mail com "VOLTAR" e eu ativo.

Abraço,
Jhonatan
```

**CTA:** botão "Quero testar de novo" → link com cupom.

### 6.2 E-mail #20 — Última tentativa honesta (D+45 pós-expiração)

**Assunto:** Vou parar de te mandar e-mail
**Pré-header:** Última tentativa. Sem cobrança, sem ressentimento.

```
Oi {{first_name}},

Esse é meu último e-mail de reativação.

Sem pressão. Sem "última chance". Sem "só hoje".

Se um dia tu quiser voltar, tua conta tá aqui. Tua senha também (ou reseta).
Nada vai ser deletado por 1 ano.

O que eu queria te dizer: o ADScale ficou bem melhor do que quando você testou.
Se aparecer a necessidade, me chama. Se não, obrigado pelo tempo que dedicou testando.

Abraço,
Jhonatan
```

**CTA:** botão "Me chama no LinkedIn" → link do perfil.

---

## 7. Conformidade LGPD/CAN-SPAM

Todo e-mail DEVE ter:

- **Link de descadastro funcional** (uma única click).
- **Identificação do remetente** (nome + razão social + endereço físico).
- **Honestidade no assunto** (sem clickbait enganoso).
- **Consentimento explícito** (só envia pra quem optou — waitlist, trial, ou signup).

**Template de rodapé padrão:**

```
--
Jhonatan Soares
Founder, ADScale
[Endereço físico da empresa]
Você recebeu esse e-mail porque [motivo do envio].
[Descadastrar]
```

---

## 8. Métricas por sequência

| Sequência | Abertura esperada | Clique (CTOR) | Conversão objetivo |
|-----------|-------------------|---------------|---------------------|
| 1 — Welcome waitlist | ≥ 40% | ≥ 8% | Aguardar lançamento |
| 2 — Anúncio lançamento | ≥ 35% | ≥ 12% | ≥ 15% waitlist → trial |
| 3 — Onboarding trial | ≥ 30% | ≥ 6% | ≥ 60% gera 1ª derivação |
| 4 — Recuperação trial | ≥ 25% | ≥ 4% | ≥ 20% volta ao app |
| 5 — Conversão trial → pago | ≥ 35% | ≥ 10% | ≥ 20% trial → pago |
| 6 — Reativação | ≥ 20% | ≥ 3% | ≥ 5% reativa |

---

*Mantido em `marketing/2026-Q3/` · PT-BR · Última atualização: 2026-06-23*
