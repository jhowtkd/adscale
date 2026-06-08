# Design: Waitlist no Site de Apresentação

**Data:** 2026-06-08  
**Status:** Aprovado (brainstorming)  
**Repos:** `jhowtkd/site-adscale` (marketing) · `ADScale_2` (app/API)

---

## 1. Objetivo

Substituir o CTA principal "Criar conta" no site de apresentação por uma waitlist que captura leads interessados antes do lançamento público. Quem já tem acesso (beta, convite) continua entrando pelo login/signup via link discreto.

---

## 2. Decisões de produto

| Tópico | Decisão |
|--------|---------|
| Signup público | Waitlist no CTA principal; link discreto "Já tenho acesso" → `{app}/login` |
| UX de captura | Modal no `site-adscale` ao clicar no CTA principal |
| Campos | Nome, email, setor, WhatsApp |
| Setor | Lista fixa + opção "Outro" com campo de texto livre |
| LGPD | Checkbox obrigatório com link para `{app}/privacy` |
| Armazenamento | Híbrido: Postgres (fonte da verdade) + Resend Audiences |
| Email pós-cadastro | Confirmação transacional |
| Email duplicado | Informar que já está na lista (HTTP 409) |

---

## 3. Arquitetura

```
[site-adscale]                         [ADScale_2]
  CTA "Entrar na waitlist"       →     Modal com formulário
  Link "Já tenho acesso"         →     {app}/login
        │
        │ POST /api/waitlist (JSON + CORS)
        ▼
                                   Validar → Rate limit
                                   Checar email duplicado
                                   INSERT waitlist_signups
                                   resend.contacts.create (segment waitlist)
                                   sendWaitlistConfirmationEmail()
        ◄─────────────────────────
  201 | 409 | 400 | 429
```

**Abordagem escolhida:** Modal no site → API pública no app (com CORS). Alternativas descartadas: página `/waitlist` no app (quebra UX escolhida); só Resend sem Postgres (não atende requisito híbrido).

**Fronteira repos (inalterada em espírito):**
- `site-adscale`: UI, copy, modal, CTAs
- `ADScale_2`: persistência, API, email, Resend sync

---

## 4. Modelo de dados

### Tabela `waitlist_signups`

| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | uuid PK | |
| `name` | text | obrigatório |
| `email` | text | único, normalizado lowercase |
| `sector` | text | valor interno do enum |
| `sectorOther` | text nullable | obrigatório quando `sector = other` |
| `whatsapp` | text | normalizado (só dígitos, com DDI) |
| `consentAt` | timestamp | momento do aceite LGPD |
| `consentVersion` | text | ex. `"2026-06-08"` |
| `locale` | text | `pt-BR` ou `en` |
| `source` | text | default `"marketing-site"` |
| `resendContactId` | text nullable | ID retornado pelo Resend |
| `createdAt` | timestamp | |

Índice único em `email`.

### Setores (enum)

| Valor interno | Label PT |
|---------------|----------|
| `agency` | Agência de marketing / performance |
| `ecommerce` | E-commerce |
| `saas` | SaaS / Tecnologia |
| `infoproduct` | Infoproduto / Educação |
| `retail` | Varejo |
| `other` | Outro |

---

## 5. API

### `POST /api/waitlist`

Público, sem autenticação. Rate limit: categoria `auth` (10 req/min por IP).

**Request body:**
```json
{
  "name": "Maria Silva",
  "email": "maria@empresa.com",
  "sector": "ecommerce",
  "sectorOther": null,
  "whatsapp": "+5511999999999",
  "consent": true,
  "locale": "pt-BR"
}
```

**Respostas:**

| Status | Corpo | Quando |
|--------|-------|--------|
| `201` | `{ "status": "created" }` | Cadastro novo |
| `409` | `{ "status": "already_registered", "message": "..." }` | Email já existe |
| `400` | `{ "error": "invalidInput", ... }` | Validação falhou |
| `429` | rate limit padrão | Muitas tentativas |

**Ordem de execução (cadastro novo):**
1. Validar campos + `consent === true`
2. Checar duplicata no Postgres
3. Inserir registro
4. Criar/atualizar contato no Resend Audiences — falha logada, não reverte insert
5. Enviar email de confirmação — falha logada, não reverte insert

### CORS

Aplicar apenas em `POST /api/waitlist` e `OPTIONS /api/waitlist`:
- `Access-Control-Allow-Origin`: origens em `MARKETING_ALLOWED_ORIGINS`
- `Access-Control-Allow-Methods`: `POST, OPTIONS`
- `Access-Control-Allow-Headers`: `Content-Type`

### Validação

| Campo | Regra |
|-------|-------|
| `name` | 2–100 caracteres |
| `email` | formato válido, max 254 |
| `sector` | enum da lista |
| `sectorOther` | obrigatório se `sector === "other"`, max 100 |
| `whatsapp` | 10–15 dígitos após normalização |
| `consent` | deve ser `true` |

### Honeypot

Campo invisível `website` no modal. Se preenchido, API retorna `201` com `{ "status": "created" }` sem persistir nem enviar email (silent discard anti-bot).

---

## 6. Site de apresentação (`site-adscale`)

### CTAs

| Local | Antes | Depois |
|-------|-------|--------|
| Hero, Navbar, FinalCTA, Pricing, Footer | "Criar conta" → `/signup` | "Entrar na waitlist" → abre modal |
| Navbar (discreto) | — | "Já tenho acesso" → `{app}/login` |
| Footer | link signup | "Já tenho acesso" → `{app}/login` |

Copy de pricing/beta atualizado: waitlist como caminho principal; quem tem código beta acessa pelo login.

### Componente `WaitlistModal`

**Estados:** `idle` → `submitting` → `success` | `error` | `duplicate`

**Campos:** nome, email, setor (select), setor outro (condicional), WhatsApp (máscara BR), checkbox LGPD.

**Mensagens:**
- Sucesso: "Você está na lista! Confira seu email."
- Duplicata (409): "Este email já está na nossa lista de espera."
- Erro genérico: "Algo deu errado. Tente novamente."

**Acessibilidade:** focus trap, `Esc` fecha, `aria-labelledby`, foco no primeiro campo ao abrir.

### Config (`src/config/site.ts`)

```ts
waitlistApiUrl: `${appUrl}/api/waitlist`,
// signupUrl permanece para referência interna se necessário
```

---

## 7. Resend Audiences

### Setup manual (Dashboard, antes do deploy)

1. Criar segmento `waitlist`
2. Configurar `RESEND_WAITLIST_SEGMENT_ID` no app
3. (Opcional) Contact properties: `sector`, `whatsapp`, `source`

### Sincronização

```ts
resend.contacts.create({
  email,
  firstName: name.split(" ")[0],
  lastName: name.split(" ").slice(1).join(" ") || undefined,
  unsubscribed: false,
  properties: { sector, whatsapp, source: "marketing-site" },
  segments: [{ id: RESEND_WAITLIST_SEGMENT_ID }],
});
```

Se contato já existir no Resend: `contacts.update` + garantir segmento. Falha Resend: log estruturado; Postgres mantém o registro.

---

## 8. Email de confirmação

Reutiliza `email-template.ts` + `email-i18n.ts`.

| Campo | PT-BR | EN |
|-------|-------|-----|
| Subject | Você está na lista de espera do ADScale | You're on the ADScale waitlist |
| Corpo | Agradecimento + expectativa de contato no lançamento | equivalente |
| CTA | Nenhum | |

Locale: campo `locale` do formulário; fallback `pt-BR`.

---

## 9. Variáveis de ambiente

| Variável | Repo | Obrigatória | Exemplo |
|----------|------|-------------|---------|
| `RESEND_WAITLIST_SEGMENT_ID` | ADScale_2 | sim (prod) | `seg_abc123` |
| `MARKETING_ALLOWED_ORIGINS` | ADScale_2 | sim (prod) | `https://www.adscale.com.br,http://localhost:5173` |
| `VITE_APP_URL` | site-adscale | sim | `https://app.adscale.com.br` |

`RESEND_API_KEY` e `EMAIL_FROM` já existem no app.

---

## 10. Segurança

- Rate limit por IP (categoria `auth`)
- Honeypot no formulário
- Email normalizado lowercase
- Sem PII em logs (preferir `id` do registro)
- CORS restrito a origens configuradas

---

## 11. Fora do escopo v1

- Painel admin para ver/exportar leads
- Convite automático waitlist → signup
- Double opt-in por email
- Desabilitar rota `/signup` no app

---

## 12. Testes

**ADScale_2:**
- Unit: schema Zod, normalização WhatsApp/email
- Integration: `POST /api/waitlist` — 201, 409, 400 sem consent, honeypot
- Mock Resend em testes

**site-adscale:**
- `typecheck` + `lint`
- Smoke manual: modal, submit, duplicata, validação

---

## 13. Ordem de implementação sugerida

1. Migration + repository + schema Zod (`ADScale_2`)
2. API route + CORS + rate limit
3. Serviço Resend + email de confirmação + i18n
4. Testes da API
5. `WaitlistModal` + alteração de CTAs (`site-adscale`)
6. Configurar env vars em staging/prod
7. Smoke E2E local (`site-adscale` :5173 → app :3000)
