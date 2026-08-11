# Design Audit — ADScale landing

Capturado em **2026-08-10 07:00-07:13 BRT** usando o Chrome real do Jhonatan via Kimi WebBridge (desktop) + agent-browser (mobile, viewport 390×844).

## O que tem aqui

```
.design-audit/2026-08-10/
├── README.md                            ← você está aqui
├── _capture.sh                          ← helper de screenshot (reutilizável)
│
├── 01-landing-01-hero.png               DESKTOP — hero, "De um criativo, [typewriter]"
├── 01-landing-02-problema.png           DESKTOP — §(01) Problema + lista numerada
├── 01-landing-03-solucao.png            DESKTOP — §(02) Solução (dark)
├── 01-landing-04-features.png           DESKTOP — §(03) Features (6 cards)
├── 01-landing-05-como-funciona.png      DESKTOP — §(04) Processo 5 passos
├── 01-landing-06-precos.png             DESKTOP — §(06) Preços (3 planos + beta card)
├── 01-landing-07-faq.png                DESKTOP — §(07) FAQ (acordeão)
├── 01-landing-08-cta-final.png          DESKTOP — §(08) CTA final
├── 01-landing-09-footer.png             DESKTOP — footer + redes
│
├── 02-privacy-01-top.png                DESKTOP — /privacy, hero
├── 02-privacy-02-mid.png                DESKTOP — /privacy, meio
├── 02-privacy-03-bottom.png             DESKTOP — /privacy, footer
│
├── 03-terms-01-top.png                  DESKTOP — /terms, hero
├── 03-terms-02-mid.png                  DESKTOP — /terms, meio
├── 03-terms-03-bottom.png               DESKTOP — /terms, footer
│
├── 04-mobile-landing-01-hero.png        MOBILE 390×844 — hero (hamburger)
├── 04-mobile-landing-02.png             MOBILE — §problema
├── 04-mobile-landing-03.png             MOBILE — §solução
├── 04-mobile-landing-04.png             MOBILE — §features
├── 04-mobile-landing-05.png             MOBILE — §como-funciona
├── 04-mobile-landing-06.png             MOBILE — §preços
├── 04-mobile-landing-07.png             MOBILE — §faq
├── 04-mobile-landing-08-footer.png      MOBILE — footer
│
├── 05-mobile-privacy-full.png           MOBILE 390×full — /privacy completo
└── 06-mobile-terms-full.png             MOBILE 390×full — /terms completo
```

## Notas técnicas

- **Desktop viewport**: o Chrome do Jhonatan está em 3024×1560 (retina 2x em tela ~1512px wide). Cada PNG está em 2x do tamanho lógico.
- **Animações desabilitadas** nos screenshots desktop via CSS injetado (`animation-duration: 0.001s !important`) — caso contrário, reveal-on-scroll deixava seções com opacity 0 no momento da captura.
- **Typewriter no hero** estava vivo durante a captura (palavra cicla: "infin..." → "dezenas" → "centenas" → ...). Hero pode variar entre screenshots.
- **Mobile full page** da landing tem 16.314px de altura — lazy-load não rolou bem, então capturei em 8 pedaços via scrollIntoView.
- **Privacy/Terms** são páginas curtas (1737px e 1715px), cabem quase inteiras no viewport desktop — por isso top e bottom ficaram visualmente próximos.

## Observações iniciais de design (você pediu pra auditar, anotei o que pulou o olho)

- **Tipografia do hero** tá cortada em viewport estreito (palavra "infin..." vira "dezenas" em desktop wide) — efeito de typewriter ok, mas o line-break pode ficar feio em larguras intermediárias.
- **CTA "Entrar no waitlist"** repete no nav, hero, beta card e CTA final — pelo menos 4 vezes. Saturado ou conversão otimizada? Vale revisar.
- **Métricas do hero (10x, 20', 72x, 0)** usam fonte mono/retro com aspas estranhas ("20'" sem "min") — pode confundir.
- **Pricing**: Growth tá marcado como "POPULAR" (corpo central, fundo claro no tema dark). Funciona, mas o card Starter e Scale ficam meio apagados.
- **Botão "Voltar ao topo"** não vi — landing tem 12k+ de altura, vai ser navegação cansativa.
- **Cookie banner** aparece em /privacy e /terms logo de cara — quebra a primeira dobra. Pode incomodar auditoria jurídica de primeira impressão.
- **Mobile menu**: hamburger presente, mas o transform do estado de "fechado" sumia no override. Vale testar manualmente.

## Como refazer

```bash
# Tudo via Kimi WebBridge (mesmo Chrome):
curl -X POST http://127.0.0.1:10086/command -H 'Content-Type: application/json' \
  -d '{"action":"navigate","args":{"url":"https://adscale.jhonatansoares.com/hi"},"session":"adscale-audit"}'

# Ou mobile via agent-browser:
agent-browser set viewport 390 844
agent-browser open https://adscale.jhonatansoares.com/hi
agent-browser wait --load networkidle
agent-browser screenshot --full out.png
```

{{ status: rascunho — auditoria visual ainda não feita }}
