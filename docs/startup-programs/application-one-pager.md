# ADScale — application one-pager

Documento-base para formulários de programas de startups. Claims comerciais, funding e métricas ficam deliberadamente como campos a confirmar.

## Short description (English)

ADScale is a SaaS AI-powered creative-derivation platform for marketing teams. Teams upload a base ad creative and campaign brief, receive a structured creative plan, and generate visually consistent, platform-ready static variations for Meta, TikTok and Google Ads, with review, quality gates and export workflows.

## Descrição curta (português)

O ADScale transforma um criativo base e um briefing em planos criativos e variações estáticas visualmente consistentes para Meta, TikTok e Google Ads, com revisão, gates de qualidade e exportação.

## Product and stack

- Next.js/React application with TypeScript.
- OpenAI text and image models for planning and derivation.
- Render web service, image worker and managed PostgreSQL.
- Cloudflare R2 for creative assets; Inngest for asynchronous jobs.
- Stripe for subscriptions, Resend for transactional email and Sentry for optional monitoring.
- GitHub Actions for CI.

## Reusable application answers (draft)

**What does the company build?**

ADScale is a SaaS platform for marketing teams that turns one base creative and a campaign brief into a structured creative plan and visually consistent static ad variations. Teams can review quality, compare outputs and export assets for Meta, TikTok and Google Ads.

**How would credits or program access be used?**

We would use the benefit for the product’s existing AI inference, creative-asset storage and bounded observability workloads, plus isolated benchmarks where relevant. We will measure usage before any provider change and will not migrate production or accept paid overages solely to consume credits.

**What is the current technical setup?**

The application uses Next.js/React and TypeScript, Render for web/worker/Postgres, Cloudflare R2 for assets, Inngest for durable jobs, OpenAI for text/image generation, Stripe and Resend for product operations, and GitHub Actions for CI.

These answers are drafts only; do not add customer names, revenue, funding, team size or performance claims until the founder confirms them.

## First batch under the personal-email rule

- **Microsoft for Startups:** the official application accepts a personal Microsoft account; the founder's business facts are ready, but Microsoft's account-creation flow blocked the authorized attempt for unusual activity. Reopen only after manual account creation or support resolution.
- **JetBrains Startups:** excluded because the founder explicitly opted not to request the program.
- **Sentry Startup:** excluded from the first batch because the founder confirmed prior payment; the published discount requires being new to paying. Reopen only if Sentry confirms an exception.

AWS, OpenAI, Cloudflare, GitHub, Notion and Framer remain blocked because their current routes require a business/domain email or a partner condition incompatible with the current rule.

## Intended use of benefits

| Program family | Bounded use | No commitment implied |
| --- | --- | --- |
| Cloudflare | Asset storage and edge experiments around the existing R2 workload | No production migration to Workers without a separate decision |
| AWS / Azure / Google Cloud | Isolated benchmark or future workload after cost and data-residency review | No provider switch solely to consume credits |
| OpenAI | Text/image inference already used by the product | No fixed credit amount claimed; partner eligibility must be confirmed |
| Sentry / Datadog / Grafana | Error, latency and job observability | Choose one expansion; do not duplicate telemetry by default |
| GitHub / JetBrains / Notion | CI, development and operating documentation | No paid renewal accepted automatically |

## Facts to complete before submission

```text
Legal company name:
Registration / CNPJ (enter only in the provider form):
Country and headquarters:
Incorporation date/year:
Funding status, total, round/date, investor or accelerator:
Annual revenue/ARR and currency:
Team size:
Founder personal email for forms (provide at submission time; do not infer from local config):
Company LinkedIn / X / GitHub:
Existing provider accounts and prior startup credits:
```

## Evidence links

- Public product: <https://adscale.jhonatansoares.com/hi>
- Terms: <https://adscale.jhonatansoares.com/terms>
- Privacy: <https://adscale.jhonatansoares.com/privacy>
- Public privacy contact: `privacidade@adscale.io` (reference only; this is not the founder's application email).
- Application email: use the founder's personal email supplied at submission time. Some programs still require a business/domain email, so eligibility must be checked per form.
- Name-collision guard: use only the legal entity and domains belonging to this ADScale. Do not claim results or company facts from unrelated “AdScale” sites.

## Submission gate

This document is a draft. Before filling any provider form, show every proposed value to the founder and obtain explicit confirmation. Do not paste secrets, API keys or card details here. Creating an account, accepting paid terms, enabling a trial, migrating a workload or submitting a form requires explicit human approval.
