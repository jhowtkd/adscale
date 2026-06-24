# Sequência de E-mails — ADScale (versão light)

> 3 sequências, 10 e-mails totais. Resend já está no stack.
> Detalhe operacional em [`../plano-marketing-completo.md`](../plano-marketing-completo.md).
>
> **Princípio:** menos e-mail, melhor e-mail. Cada e-mail tem
> 1 objetivo. Sem "só pra lembrar" ou "última chance" de 7 emails.

---

## 0. Convenções de copy

- **Assunto:** ≤ 50 caracteres, sem caps lock, sem emoji de exclamação.
- **Pré-header:** ≤ 90 caracteres, complementa o assunto (não repete).
- **Corpo:** 1 ideia por e-mail, 1 CTA principal.
- **Tom:** consistente com `brand/tom-de-voz.md` — direto, técnico, sem corporate.
- **Rodapé:** assinatura pessoal (Jhonatan) + link de descadastro + razão social.

**Variáveis de personalização usadas:**

- `{{first_name}}` — primeiro nome do destinatário
- `{{trial_end_date}}` — data de fim do trial (sequência 3)

---

## 1. Sequência 1 — Welcome waitlist (3 e-mails)

**Trigger:** signup na página de waitlist.
**Objetivo:** confirmar inscrição, entregar valor, manter lead quente.
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

Se tiver alguma pergunta, responde esse e-mail. Eu leio tudo.

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

**CTA:** botão "Ver demo de 60s" → link pro Reel.

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

Próximo e-mail: vou te avisar quando o ADScale abrir.

Abraço,
Jhonatan
```

**CTA:** botão "Responde: qual desses 3 é seu maior vilão?" (mailto).

---

## 2. Sequência 2 — Anúncio de lançamento (3 e-mails)

**Trigger:** agendada por data (T-7, T-1, T0).
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

Não vou te mandar mais e-mail "contagem regressiva".
Te vejo no dia 0 com o link de acesso.

Abraço,
Jhonatan
```

**CTA:** botão "Adiciona ao calendário" (arquivo .ics com a data).

### 2.2 E-mail #5 — Acesso liberado (T-1)

**Assunto:** Amanhã, 9h
**Pré-header:** Teu link de acesso tá aqui. Bora?

```
Oi {{first_name}},

Amanhã, 9h (horário de Brasília), o ADScale abre pra waitlist.

Teu link de acesso: [LINK-PESSOAL-DA-WAITLIST]

Algumas coisas que vão acontecer amanhã:
- 9h00: e-mail "ADScale está no ar" com link direto de login.
- 12h00: live de 30 min mostrando o fluxo completo.
- 20h00: e-mail com números do dia 1.

E o que importa pra você:
- 14 dias grátis. Sem cartão.
- Se você for um dos 100 primeiros a ativar, ganha 30% vitalício.

Te vejo amanhã.

Abraço,
Jhonatan
```

**CTA:** botão "Quero entrar amanhã" → link de login (placeholder).

### 2.3 E-mail #6 — Lançamento T0 (T0, 9h)

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

Bora.

Abraço,
Jhonatan

PS: Responde esse e-mail dizendo "ativei" — eu mesmo vou responder com 1 dica
pra tirar o máximo da plataforma no primeiro dia.
```

**CTA:** botão "Entrar no ADScale" → link principal.

---

## 3. Sequência 3 — Onboarding trial (4 e-mails)

**Trigger:** signup no produto (trial iniciado).
**Objetivo:** levar o trial até a 1ª derivação aprovada.
**Janela:** 14 dias (trial inteiro).

### 3.1 E-mail #7 — Boas-vindas no produto (D+0, 5 min após signup)

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

### 3.2 E-mail #8 — Case real (D+2)

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

### 3.3 E-mail #9 — Recursos avançados (D+5)

**Assunto:** 3 features que 70% dos usuários não usam (e deviam)
**Pré-header:** Restyling, landing pages, biblioteca de cliente.

```
Oi {{first_name}},

Você tá na metade do trial. Esse e-mail é sobre 3 features que pouca gente
usa, mas que fazem diferença grande no resultado final:

1. Restyling (intensidade: soft / medium / strong)
   Pega um criativo aprovado e aplica o estilo visual de outro. Útil pra
   padronizar visual entre campanhas.

2. Landing pages automáticas
   Quando você aprova um criativo, o ADScale gera uma landing page HTML no
   mesmo estilo. Sem mexer em código.

3. Biblioteca de referências de cliente
   Salva logo, paleta, estilo, produtos, "negativos". Toda derivação nova
   consulta essa biblioteca. Fidelidade de marca de verdade.

Abre o app, testa 1 dessas 3 hoje, e me conta o que achou.

Abraço,
Jhonatan
```

**CTA:** botão "Testar feature avançada" → deep link na feature.

### 3.4 E-mail #10 — Lembrete final (D+10, 4 dias antes do fim)

**Assunto:** Faltam 4 dias pro trial acabar
**Pré-header:** 3 caminhos pra escolher.

```
Oi {{first_name}},

Seu trial acaba em 4 dias ({{trial_end_date}}).

Não vou te encher o saco. 3 caminhos possíveis:

1. **Você tá usando e tá valendo.**
   Escolhe um plano e segue. Starter é o mais comum pra começar.

2. **Você usou mas ainda tá na dúvida.**
   Me conta o que tá faltando. Eu respondo em 24h.

3. **Você não usou.**
   Tudo bem. Cancela ou deixa expirar. Quando quiser voltar, é só logar.

Se for caminho 1 ou 2, clica aqui: [LINK DE CONVERSÃO]

Abraço,
Jhonatan
```

**CTA:** botão "Ver planos" → página de pricing.

---

## 4. Conformidade LGPD/CAN-SPAM

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

## 5. Métricas por sequência

| Sequência | Abertura esperada | Clique (CTOR) | Conversão objetivo |
|-----------|-------------------|---------------|---------------------|
| 1 — Welcome waitlist | ≥ 40% | ≥ 8% | Aguardar lançamento |
| 2 — Anúncio lançamento | ≥ 35% | ≥ 12% | ≥ 20% waitlist → trial |
| 3 — Onboarding trial | ≥ 30% | ≥ 6% | ≥ 60% gera 1ª derivação |

---

## 6. O que FOI cortado (vs versão anterior)

| Cortado | Por quê |
|---------|---------|
| Sequência 4 (recuperação de trial inativo) | Meta de 50 não justifica 3 e-mails extras de re-engajamento. Adicionar quando base for > 200. |
| Sequência 5 (conversão trial → pago, 3 e-mails) | Substituída por 1 e-mail único (D+10) na sequência 3. Suficiente pra meta de 50. |
| Sequência 6 (reativação de trials antigos) | Só faz sentido com base > 500. |
| Lógica condicional #9a/#9b no onboarding | Simplificado — manda sempre o case (D+2). Menos complexidade, mesmo resultado. |

**Quando trazer de volta:** quando a base ativa for > 200 e o trial → pago ficar < 15%.

---

*Mantido em `marketing/2026-Q3/` · PT-BR · Última atualização: 2026-06-23*
