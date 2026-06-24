# Setup Checklist — Fase 0 (começar segunda-feira)

> Passo-a-passo pra deixar tudo pronto antes de D+0.
> Ordem importa: faz nessa sequência que cada passo depende do anterior.
> Tempo total: ~3h35 (uma tarde de sábado).

---

## Bloco 1 — Identidade visual (1h35)

### 1.1 Foto de perfil (10 min)

- [ ] Selfie em ambiente bem iluminado (luz natural de janela serve)
- [ ] Fundo neutro (parede branca ou cor sólida)
- [ ] Rosto centralizado, sorriso leve
- [ ] Crop quadrado (1:1)
- [ ] Salvar 2 versões: 320×320 (avatar pequeno) e 1080×1080 (alta res)

**Origem:** foto do Jhonatan (perfil pessoal, não stock photo).

### 1.2 Bio IG (5 min)

```
Jhonatan Soares
Construindo ADScale — IA que escala criativos para agências.
BR + EUA 🇧🇷🇺🇸
[link do site/blog — pode ser só o GitHub do ADScale por enquanto]
```

### 1.3 Bio LinkedIn EN (10 min)

```
Founder, ADScale
Building AI that helps marketing agencies ship 10x more ad creatives
without scaling headcount.
🇧🇷🇺🇸 BR + US
```

**Dica:** manter "Founder" + nome do produto + 1 linha de descrição + localização. Não encher.

### 1.4 Brand Kit no Canva (20 min)

1. Canva → Brand Kit (ícone de livro no menu lateral)
2. **Fonts:** adicionar:
   - **Inter** (weight 400, 600, 800) — Google Fonts
   - **Space Mono** (weight 400, 700) — Google Fonts
   - **Press Start 2P** (weight 400) — Google Fonts
3. **Colors:** adicionar os 12 hex codes (arquivo `tokens/design-tokens.json` tem todos):

| Onde | Hex |
|------|-----|
| Light bg | `#fafafa` |
| Light surface | `#ffffff` |
| Light surface raised | `#f5f5f5` |
| Text primary | `#0a0a0a` |
| Text secondary | `#444444` |
| Text muted | `#525252` |
| Accent green | `#00b34a` |
| Accent green bright | `#00e85e` |
| Accent green dark | `#007a33` |
| Accent rose | `#d43d5c` |
| Accent amber | `#c7920a` |
| Ink | `#0a0a0a` |

4. **Logo:** upload do `assets/wordmark-adscale.svg` (vou gerar pra você)

### 1.5 Logo — wordmark (5 min)

- [ ] Importar `assets/logo-oficial.svg` no Canva (logo oficial que o Jhonatan tem)
- [ ] Conferir se tá como o esperado
- [ ] Salvar 2 versões:
  - **Light mode:** logo preta em fundo claro
  - **Dark mode:** `assets/logo-oficial-dark.svg` (logo branca em fundo ink)
- [ ] Upload no Brand Kit como logo oficial

### 1.6 Avatar IG/LinkedIn (5 min)

- [ ] Importar `assets/logo-avatar-1080.svg` no Canva (já tem accent verde)
- [ ] Exportar como PNG 1080×1080
- [ ] Upload no perfil IG + LinkedIn
- [ ] Versão secundária (favicon, watermark): `assets/logo-avatar.svg` (tamanho 163×142)

---

## Bloco 2 — Templates (1h15)

### 2.1 Template carrossel (45 min)

1. Canva → Create design → Custom size → **1080×1350** (4:5, formato que mais entrega no IG)
2. Background: `#fafafa` (cor do Brand Kit)
3. Criar 6 slides com estrutura:

**Slide 1 (gancho):**
- Background: `#fafafa`
- Label seção: Space Mono, 14pt, MAIÚSCULAS, cor `#00b34a`, alinhado topo-esquerda
  - Texto: `(01) EDUCAÇÃO`
- Título principal: Inter 800, 64pt, cor `#0a0a0a`, alinhado esquerda, padding 60px
  - Texto: seu gancho
- Pixel accent no canto inferior direito: retângulo 24×24px, `#00b34a`

**Slides 2-5 (conteúdo):**
- Background: `#ffffff`
- Número grande: Press Start 2P, 80pt, cor `#00b34a` (ou Inter 800, 96pt)
  - Texto: `01`, `02`, `03`, `04`, `05`
- Texto: Inter 600, 28pt, cor `#0a0a0a`
  - Texto: 1 ideia por slide
- Padding: 60px

**Slide 6 (CTA):**
- Background: `#0a0a0a` (dark mode contrast)
- Texto: Inter 600, 28pt, cor `#ffffff`
  - Texto: pergunta de engajamento ("Qual desses é seu maior vilão?")
- Botão: bg `#00b34a`, texto `#0a0a0a`, radius 8px
  - Texto: "Comenta aqui 👇"

4. Salvar como template: **"Carrossel ADScale 6 slides"**
5. Testar export: PNG (1080×1350)

### 2.2 Template Reels (30 min)

1. CapCut → New project → **1080×1920** (9:16)
2. Background: `#0a0a0a` (dark mode studio vibe)
3. Layer de texto: Inter 800, 72pt, cor `#ffffff`, centralizado, fundo semi-transparente preto (`rgba(0,0,0,0.6)`)
4. Accent: número ou palavra-chave em `#00e85e` (verde brilhante)
5. Duração: 15-30s (curtos) ou 30-60s (longos)
6. Salvar como preset
7. Testar export: MP4 1080×1920

### 2.3 Ícone "AD" secundário (10 min)

- [ ] Importar `assets/monogram-adscale.svg` no Canva
- [ ] Usar como favicon, watermark, ou marca d'água em post mais neutro
- [ ] Salvar separado

---

## Bloco 3 — Infraestrutura externa (1h05)

### 3.1 CapCut desktop (15 min)

- [ ] Download: https://www.capcut.com/pt-br (desktop)
- [ ] Instalar
- [ ] Configurar atalhos básicos (recomendo: `,` = split, `i` = adicionar marker)
- [ ] Criar pasta `~/Videos/adscale-reels/` pra organizar exports

### 3.2 Meta Business Suite (20 min)

- [ ] Acessar https://business.facebook.com/
- [ ] Conectar conta pessoal do Instagram do Jhonatan
- [ ] Verificar permissões: postar, agendar, responder DMs
- [ ] Testar: postar 1 imagem de teste (pode deletar depois)
- [ ] Agendar 1 post no Meta Business Suite (teste de fluxo)

### 3.3 Resend (30 min)

- [ ] Login no Resend
- [ ] **Verificar domínio** (se ainda não tá): DNS settings, SPF + DKIM + DMARC
- [ ] Criar 1 template de teste
- [ ] Enviar 1 e-mail de teste pra você mesmo
- [ ] Confirmar que **NÃO vai pro spam** (checar pasta de spam)
- [ ] **Não ativar nenhuma sequência ainda.** Sequência fica escrita em `sequencia-emails.md`, mas sem trigger.

---

## Bloco 4 — Kanban (10 min)

### 4.1 Confirmar arquivos prontos

- [ ] `kanban/01-ideias.md` — banco infinito (já tem 20 seeds)
- [ ] `kanban/02-briefs.md` — **3 briefs prontos pra semana 1** (já preenchido acima)
- [ ] `kanban/03-prontos.md` — vazio, vai ser preenchido conforme produz
- [ ] `kanban/04-publicados.md` — vazio, vai ser preenchido domingo à noite

### 4.2 Adicionar 10 ideias iniciais no `01-ideias.md`

- [ ] Abrir `01-ideias.md`
- [ ] Adicionar 10 ideias (puxar dos 20 prompts-base em `automacao-conteudo-kanban.md` seção 6.5)
- [ ] Não filtrar — banco é infinito

---

## Checklist pré-D+0 (D-1, domingo à noite)

- [ ] Os 4 blocos acima estão **todos concluídos**
- [ ] Os 3 briefs da semana 1 estão em `02-briefs.md` (já estão)
- [ ] Brand Kit do Canva está completo (3 fontes + 12 cores + logo)
- [ ] Template de carrossel salvo
- [ ] Template de Reels salvo
- [ ] Meta Business Suite conectado
- [ ] Resend testado
- [ ] Você tem clareza do que vai produzir segunda de manhã

**Se algum item não estiver ✅:** não tem problema, **faz durante a semana 1 mesmo**. O importante é **começar segunda com a mentalidade de produzir**, não com tudo perfeito.

---

## Tempo total de setup

| Bloco | Tempo |
|-------|-------|
| Identidade visual | 1h35 |
| Templates | 1h15 |
| Infra externa | 1h05 |
| Kanban | 10 min |
| **Total** | **~4h05** |

Mais folgado do que eu tinha estimado antes (3h35). Reservei 1 tarde de sábado (5h) com folga.

---

## Próximo passo (D+0, segunda de manhã)

1. 09h: abrir `02-briefs.md` → Slot 1 (carrossel "5 coisas que travam...")
2. 60 min produzindo no Canva com o template salvo
3. 17h: agendar no Meta Business Suite
4. Mover card de `02-briefs.md` pra `03-prontos.md`

Boa produção.

---

*Mantido em `marketing/2026-Q3/` · PT-BR · Última atualização: 2026-06-23*
