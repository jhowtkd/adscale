# Copy de e-mails — execução

> **Status:** em produção (transacionais + welcome de trial) · rascunho arquivado (waitlist/lançamento)
> **Última revisão:** 2026-09-02
> **Fonte canônica no app:** `app/messages/pt-BR.json` (`transactionalEmails`, `notifications`)
> **Tom:** founder-cientista, PT-BR, tese *inteligência criativa em escala*. Sem cockpit, sem 14 dias, sem case de cliente inventado.

Cada e-mail: 1 objetivo, 1 CTA, assunto ≤ 50 caracteres, pré-header que complementa (não repete). Assinatura: Jhonatan, Founder, ADScale.

---

## A. Transacionais (disparam hoje)

### Confirmação de e-mail

- **Quando:** signup / reenvio de verificação
- **Assunto:** Confirme seu e-mail no ADScale
- **Pré-header:** Um clique pra entrar no Estúdio e gerar a primeira Peça.
- **CTA:** Confirmar e-mail → link do Better Auth

### Welcome no produto (D+0)

- **Quando:** primeira ativação do trial, depois da verificação de e-mail (`status: activated`)
- **Não dispara** em re-verificação (`already_active`) nem se o usuário não for owner elegível
- **Assunto:** Bem-vindo. 3 passos pra ver valor agora
- **Pré-header:** 500 créditos no Estúdio. Sem cartão e sem prazo.
- **CTA:** Abrir o Estúdio → `APP_URL` (`/`)
- **Passos:** briefing no Estúdio → referência opcional → gerar, revisar, aprovar
- **Falha de envio:** não bloqueia a ativação do trial

### Redefinir senha / magic link / convite de workspace

Mesmo layout, mesma assinatura. Copy em `transactionalEmails.reset`, `.magicLink`, `.invite`.

---

## B. Notificações de produto (disparam hoje)

| E-mail | Objetivo | CTA |
|--------|----------|-----|
| Peças prontas | Revisar e decidir o que sobe | Abrir o Estúdio |
| Briefing pronto | Revisar ângulos/ganchos/CTAs e decidir o que gerar | Abrir o Estúdio |
| Créditos baixos | Recarregar antes da geração parar | Abrir o Estúdio |
| Período de teste acabando | Stripe `trialing` legado — 3 caminhos, sem pressão | Abrir o Estúdio |

O trial público atual **não expira** (500 créditos). O e-mail de teste acabando só vale se ainda existir assinatura Stripe `trialing`.

---

## C. Sequências de marketing (não disparar)

Waitlist está fechada (`POST /api/waitlist` → 410). Lançamento já ocorreu. Sequências 1 e 2 ficam em [`../2026-Q3/sequencia-emails.md`](../2026-Q3/sequencia-emails.md) como arquivo histórico.

Não reativar:

- Case de agência com números de cliente (sem prova)
- Contagem regressiva de lançamento
- Lembrete de trial por calendário (o trial agora é por crédito)

---

## D. Conformidade

Transacionais: identificação do remetente + opção de ignorar se não pediu.

Welcome e waitlist: motivo do envio no rodapé. Resposta cai na caixa de `EMAIL_FROM`.

---

*Subpasta de `marketing/copy/` · PT-BR*
