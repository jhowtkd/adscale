# Sequência de E-mails — ADScale

> Copy de execução no app: [`../copy/emails.md`](../copy/emails.md) + `app/messages/pt-BR.json`.
> Resend já está no stack. Waitlist fechada. Trial público = **500 créditos**, sem cartão e sem validade.

**Princípio:** menos e-mail, melhor e-mail. 1 objetivo por e-mail. Sem "só pra lembrar".

---

## Estado atual (2026-09-02)

| Sequência | Estado | Por quê |
|-----------|--------|---------|
| 1 — Welcome waitlist | Arquivada | `POST /api/waitlist` retorna 410. Cadastro é público em `/signup`. |
| 2 — Anúncio de lançamento | Arquivada | Produto aberto. Sem T-7 / T-1 / T0. |
| 3 — Onboarding trial | **D+0 no produto** | Welcome dispara na primeira ativação do trial (depois da verificação de e-mail). D+2/D+5/D+10 **não** entram: D+2 era case de cliente sem prova; D+10 assumia trial de 14 dias. |

O equivalente operacional do "trial acabando" no produto atual é o e-mail de **créditos baixos**.

---

## 0. Convenções de copy

- **Assunto:** ≤ 50 caracteres, sem caps lock, sem emoji de exclamação.
- **Pré-header:** ≤ 90 caracteres, complementa o assunto (não repete).
- **Corpo:** 1 ideia por e-mail, 1 CTA principal.
- **Tom:** founder-cientista — direto, técnico, sem corporate. Tese: inteligência criativa em escala.
- **Vocabulário:** Estúdio, Trabalho, Peça, briefing. Evitar cockpit, "IA mágica", claims de velocidade sem dado.
- **Rodapé:** assinatura pessoal (Jhonatan) + razão do envio quando não for auth puro.

**Variáveis:** `{{first_name}}`, `{{credits}}` (500), `{{url}}`.

---

## 1. Sequência 1 — Welcome waitlist (arquivada)

**Trigger antigo:** signup na waitlist. **Não dispara.**

A função `sendWaitlistConfirmationEmail` ainda existe. O endpoint de waitlist não a chama.

E-mails #2 e #3 (D+3 / D+7) não entram no app. Copy antiga falava em "quando lançar" e em números de bastidor não revalidados.

---

## 2. Sequência 2 — Anúncio de lançamento (arquivada)

T-7 / T-1 / T0 com calendário, live e desconto vitalício **não** entram no produto. Ofertas e datas precisariam de decisão nova do founder antes de qualquer disparo.

---

## 3. Sequência 3 — Onboarding trial (D+0 no produto)

**Trigger:** verificação de e-mail + `activateSignupTrialForOwner` retorna `activated`.
**Objetivo:** levar o trial até a 1ª Peça revisada no Estúdio.
**Janela:** créditos, não calendário.

### 3.1 E-mail #7 — Boas-vindas no produto (D+0)

Implementado em `sendWelcomeEmail`. Copy viva em `transactionalEmails.welcome`.

**Assunto:** Entrou. Agora gera.
**Pré-header:** 500 créditos. Sem cartão. Sem prazo.
**CTA:** Abrir o Estúdio → app.

1. Briefing de verdade (objetivo, público, oferta). Pedido vago vira retrabalho.
2. Referência opcional — sem ela a IA preenche o vazio, e quase nunca no tom da marca.
3. Gerar em lote, depois decidir o que sobe. Humano escolhe; IA faz o operacional.

### 3.2 E-mail #8 — Case real (D+2) — não enviar

Bloqueado pelo gate de claims: sem prova de cliente real, sem números de agência. Reavaliar só com case autorizado e evidência.

### 3.3 E-mail #9 — Recursos avançados (D+5) — não enviar nesta rodada

Restyling, landing e biblioteca existem em graus diferentes. Sem drip até o D+0 estar estável e a copy citar só o que o workspace realmente tem.

### 3.4 E-mail #10 — Lembrete final (D+10) — substituído

Trial não tem data de fim. Usar **créditos baixos** (`sendLowCreditsEmail`) quando o saldo passa do limiar.

---

## 4. Conformidade LGPD/CAN-SPAM

Todo e-mail DEVE ter:

- Identificação do remetente (nome + ADScale).
- Honestidade no assunto.
- Consentimento: auth e welcome só pra quem criou conta; waitlist só pra quem optou (histórico).

**Rodapé padrão (welcome):**

```
Abraço,
Jhonatan
Founder, ADScale
Você recebeu este e-mail porque criou uma conta no ADScale.
```

---

## 5. Métricas (quando houver volume)

| Sequência | Abertura | Clique (CTOR) | Conversão objetivo |
|-----------|----------|---------------|---------------------|
| Welcome D+0 | ≥ 40% | ≥ 8% | 1ª Peça gerada no Estúdio |
| Créditos baixos | ≥ 30% | ≥ 6% | recarga ou plano |

---

## 6. O que continua de fora

| Cortado | Por quê |
|---------|---------|
| Sequência waitlist D+3/D+7 | Waitlist fechada; copy de pré-lançamento. |
| Sequência lançamento T-7/T0 | Produto já aberto. |
| Recuperação de trial inativo | Sem relógio de 14 dias. |
| Lógica condicional de case | Sem prova de cliente. |

**Quando trazer de volta:** waitlist só se reabrir captura. Case só com autorização e evidência. Drip D+5 só depois do welcome D+0 estável.

---

*Mantido em `marketing/2026-Q3/` · PT-BR · Última atualização: 2026-09-02*
