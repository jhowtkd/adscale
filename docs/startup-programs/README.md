# ADScale — fila de programas para startups

Atualizado em 2026-08-30 a partir do índice [awesome-startup-deals](https://github.com/DobroslavRadosavljevic/awesome-startup-deals). O índice contém 190 ofertas e uma linha-modelo de contribuição. Ele é um mapa de descoberta, não a fonte final: o próprio projeto informa que parte da coleta é assistida por IA e pode estar desatualizada.

## Como ler a fila

O arquivo [`adscale-application-queue.csv`](adscale-application-queue.csv) dá uma disposição a cada oferta:

- `APPLY`: candidato coerente com o produto e a infraestrutura atual; ainda exige confirmação dos fatos e aprovação humana antes do envio.
- `BLOCKED`: pode ser útil, mas falta elegibilidade, parceiro, decisão de produto, conta nova ou validação oficial atual.
- `SKIP`: incompatível com o produto atual, duplicado, exige uma migração desproporcional ou não é uma candidatura de fornecedor.

A saúde HTTP dos endereços foi registrada em [`url-health-2026-08-30.md`](url-health-2026-08-30.md). Um `2xx` não transforma uma oferta em elegível; um `403` também não prova que ela acabou.

## Snapshot da fila (2026-08-30)

Dos 190 itens de fornecedor, 0 estão como `APPLY`, 123 como `BLOCKED` e 67 como `SKIP`; a linha 191 é apenas o modelo de contribuição. Todas as ofertas de fornecedor têm validação `official-current`; a linha-modelo permanece `index-only`.

## Revalidação da fonte

Em 2026-08-30, a fonte ao vivo foi conferida no commit [`51a6053`](https://github.com/DobroslavRadosavljevic/awesome-startup-deals/commit/51a6053d537a4bf849c9b0a4af27de9ecfeba481), datado de 2026-05-12. Ela contém os mesmos 190 registros de fornecedor; 110 URLs foram normalizadas para páginas oficiais canônicas e quatro nomes de oferta foram alinhados (Civo, Estuary, Figma e SendGrid). Não há registro de fornecedor faltante ou extra na fila local.

## Evidência atual do produto

- Produto: plataforma de derivação de criativos estáticos para marketing, com planejamento e geração via OpenAI.
- Copy pública observada na landing page: “Transforme um criativo base em dezenas de variações prontas para campanhas pagas”, do briefing ao pacote de entrega.
- Produção: Render (web, worker e Postgres gerenciado), Cloudflare R2, Inngest, Stripe, Resend e Sentry opcional. Ver [`README.md`](../../README.md) e [`render.yaml`](../../render.yaml).
- Site público observado: <https://adscale.jhonatansoares.com/hi> respondeu HTTP 200 em 2026-08-30.
- Os termos e a política públicas estão em <https://adscale.jhonatansoares.com/terms> e <https://adscale.jhonatansoares.com/privacy>; a política exibe `privacidade@adscale.io`. Esse é apenas um contato público de privacidade, não o e-mail pessoal do fundador para candidaturas.
- A landing page, termos e política não declaram perfis sociais oficiais; LinkedIn/X/GitHub da empresa continuam pendentes de confirmação.
- Não confirmados no repositório/site público: entidade jurídica/CNPJ, data de constituição, sede, funding/rodada, receita, tamanho da equipe, parceiros, créditos anteriores e perfis sociais oficiais.
- Há várias empresas não relacionadas usando o nome “AdScale” em outros domínios. Em formulários, usar somente o domínio `adscale.jhonatansoares.com`, a entidade jurídica confirmada e o e-mail pessoal do fundador fornecido para a candidatura; não reutilizar métricas, logos ou cases de `adscale.com`, `adscale.co.in` ou outros homônimos.

## Primeira fila

Nenhum programa está em `APPLY` neste momento: o Microsoft for Startups permanece o próximo candidato, mas a criação autorizada da conta foi bloqueada pelo portal por “atividade incomum” em 2026-08-31. Sentry foi retirado porque o fundador confirmou pagamento anterior; JetBrains foi retirado por opção expressa do fundador. Cloudflare, AWS, OpenAI, GitHub e Notion estão bloqueados pela exigência de e-mail empresarial/domínio sob a preferência atual por e-mail pessoal. A fila também mantém alternativas condicionais, como PostHog, Datadog/Grafana, Google Cloud, Vercel, DigitalOcean, Neon, HubSpot e os demais itens do índice.

| Programa | Benefício/critério observado na página oficial | Estado para ADScale |
| --- | --- | --- |
| [Cloudflare for Startups](https://www.cloudflare.com/startups/) | Tier bootstrapped até US$10 mil; tiers maiores dependem de funding/parceiro; R2 tem limite próprio | `BLOCKED` — exige e-mail de domínio, incompatível com a preferência atual por e-mail pessoal |
| [AWS Activate](https://aws.amazon.com/startups/credits/) | Founders até US$5 mil; Portfolio até US$200 mil, com requisitos de conta e parceiro | `BLOCKED` — aplicação exige e-mail empresarial; sem migração automática |
| [Microsoft for Startups](https://learn.microsoft.com/en-us/startups/microsoft-for-startups/overview) | Créditos Azure progressivos até US$150 mil para produto próprio elegível | `BLOCKED` — criação da conta Microsoft bloqueada por “atividade incomum” |
| [Sentry Startup](https://sentry.zendesk.com/hc/en-us/articles/25290106838811-Do-you-offer-a-discount-to-Startups) | US$5 mil por 1 ano para empresa recente, <$5M VC e novo pagante | `SKIP` — pagamento anterior confirmado; não atende ao requisito de novo pagante |
| [OpenAI for Startups](https://openai.com/business/why-openai/startups/) | Créditos e suporte via VC parceiro; valor não é público/fixo | `BLOCKED` — contatos exigem e-mail empresarial |
| [GitHub for Startups](https://github.com/enterprise/startups) | Até US$10 mil em créditos flexíveis por até 12 meses, via parceiro/eligibilidade | `BLOCKED` — exige e-mail de domínio; GitHub/Actions já usados |
| [Notion for Startups](https://www.notion.com/startups) | 3–6 meses conforme parceria e elegibilidade; rejeita Gmail/Yahoo/e-mail pessoal comum | `BLOCKED` — exige e-mail de trabalho/domínio |
| [JetBrains Startups](https://www.jetbrains.com/startups/) | 50% de desconto por até 5 anos, sujeito à comprovação | `SKIP` — fundador optou por não solicitar |

Não há autorização implícita para criar contas, ativar trials, adicionar método de pagamento, aceitar cobrança, migrar infraestrutura ou clicar em `Submit`. Cada uma dessas ações permanece como gate humano.

Antes de preencher qualquer formulário, apresentar ao fundador a lista completa de valores propostos (incluindo o e-mail pessoal) e aguardar confirmação explícita. Não inferir, reutilizar ou completar dados ausentes.

## Campos confirmados nos formulários

- **Cloudflare:** e-mail empresarial que corresponda ao domínio, website público, presença em LinkedIn/X/GitHub, data de constituição, funding e confirmação de que é primeira candidatura. A página também exige método de pagamento e informa cobrança automática de excedentes após o benefício; Tier 3 diz “sem funding mínimo”, enquanto os critérios gerais mencionam funding nos últimos 12 meses — confirmar essa contradição no formulário.
- **AWS:** o Builder ID é um perfil pessoal, mas o guia atual pede e-mail empresarial correspondente ao domínio no perfil e na aplicação, além de conta AWS vinculada; a resposta indicada é de 5–10 dias úteis. Por isso fica `BLOCKED` sob a preferência por e-mail pessoal.
- **Microsoft:** o processo oficial aceita conta Microsoft pessoal (e rejeita conta corporativa no primeiro login), pede telefone e dados da entidade/endereço e depois configuração Azure; produto próprio, empresa privada com fins lucrativos, país com Azure e histórico de créditos são critérios. Sem referral, o fluxo segue para créditos iniciais e a configuração Azure pede método de pagamento; a assinatura pode virar pay-as-you-go quando os créditos acabarem ou expirarem. Referral de parceiro é opcional para benefícios maiores.
- **OpenAI:** código de referral único do VC, descrição do produto e uso da API, nome da empresa e contatos-chave com e-mail empresarial válido, funding básico e Organization ID; créditos dependem de VC parceiro.
- **GitHub:** vínculo com parceiro, funding externo (até Series B), conta Enterprise nova ou sem Enterprise nos últimos 6 meses e ausência de créditos/licenças anteriores; o benefício é aplicado à conta Enterprise enviada.
- **Notion:** cliente não pagante, menos de 100 pessoas, sem promoção anterior e e-mail de trabalho válido (a página exclui Gmail/Outlook). A oferta publicada é 6 meses com parceiro, 3 meses com website/e-mail de domínio ou 1 mês quando a informação é incompleta/empresa muito pequena; um e-mail pessoal comum pode inviabilizar este item.
- **PostHog:** é preciso ter conta PostHog; a página publica critérios de menos de US$5M em funding, menos de 20 pessoas, menos de 2 anos e domínio de e-mail empresarial. O benefício anunciado é US$50 mil por 12 meses, com exclusões de alguns recursos de IA.
- **Vercel:** o formulário pede nome completo, e-mail de trabalho, tamanho da empresa, website, país e necessidade; a página publica até US$30 mil em compromisso flexível. O envio é apenas interesse, sem autorizar migração do Render.
- **Neon/Databricks:** a página anuncia até US$200 mil em créditos para startups qualificadas e direciona para formulário externo; confirmar investidor, conta e uso pretendido antes de abrir o formulário.
- **HubSpot Bootstrap:** nome, sobrenome, e-mail, país da entidade, website, tamanho da empresa, ano de fundação, setor e faixa de receita anual. O Brasil está na lista elegível; a rota exige bootstrapping, até 5 anos e 1–25 pessoas.
- **Asana Startup Program:** desconto anual de 12 meses para early-stage até Series A; exige usuário novo/free, código de parceiro e checkout com dados de pagamento. Conta paga ou upgrade nos últimos 60 dias é inelegível.
- **DigitalOcean Startups:** antes de aplicar, exige nova team account, e-mail corporativo do domínio e cartão válido; o valor é definido pelo parceiro, tem limite mensal e exclui GPU/inferência de terceiros. Não criar a conta ou cartão por causa do programa.
- **OVHcloud Startup Program:** Start level anuncia US$14 mil/12 meses e 6 horas de engenharia para pre-seed/seed com MVP/POC e necessidade de cloud; exige decisão de infraestrutura.
- **Akamai Cloud Rise:** US$500 imediato e até US$120 mil no primeiro ano, mas exige conta nova, e-mail de domínio, cartão e uso/expansão da Akamai Cloud; bloqueado pela preferência de e-mail pessoal e pelo stack atual no Render.
- **Huawei Cloud Startup:** voucher mínimo de US$5 mil e possibilidade de até US$150 mil para empresa <5 anos não listada; requer verificação empresarial e eventual migração.
- **Google for Startups Cloud/AI:** a página atual publica até US$200 mil, ou US$350 mil para AI, com janelas de funding/idade e limite de créditos prévios; o track AI espera uso de Gemini. Não migrar Render/OpenAI por crédito sem decisão separada.
- **Render for Startups:** oferta Founder de US$500 para novo cliente com seed mínimo de US$25 mil, menos de 5 anos e pré-Series B; tiers maiores exigem parceiro. A conta atual do ADScale torna a elegibilidade incerta.
- **MongoDB for Startups:** startup de software com menos de 7 anos, Series A ou anterior, site e LinkedIn ativos; a aplicação pede e-mail corporativo, nome legal, URL, LinkedIn e funding. Usuários Atlas existentes podem ser elegíveis, mas isso não autoriza trocar o backend atual.
- **Civo Startups:** até US$50 mil em créditos por estágio, com suporte; GPU não é coberta e a conta atual do ADScale está no Render, portanto qualquer uso depende de decisão de infraestrutura.
- **Koyeb Startup Program:** página oficial de 2024 anuncia até US$30 mil e suporte, mas o plano Startup foi sucedido por Pro/Scale; confirmar vigência antes de considerar candidatura.
- **Scalingo Startup Program:** até €1.800/9 meses, mas requer nova hospedagem e critérios adicionais não expostos publicamente; manter bloqueado até confirmar necessidade e termos.
- **Alchemy for Startups:** página atual exige produto on-chain/Web3; mantido `SKIP` porque não há caso de uso on-chain confirmado para o ADScale.
- **Redis Startup Program:** Redis gratuito por 6 meses, suporte e acesso antecipado; limites e critérios de qualificação precisam ser confirmados antes de conta/trial.
- **Appwrite Startups:** Appwrite Cloud Pro por 12 meses, créditos, suporte e treinamento; exige produto próprio, até 5 anos e funding pré-seed–Series A ou receita até US$5M, com projeto novo/migração.
- **Pinecone for Startups:** Standard e Pro Support gratuitos, créditos/descontos e Slack dedicado; exige menos de 100 pessoas e Series A ou anterior. Não há uso Pinecone confirmado no ADScale.
- **Algolia Startup Program:** US$10 mil em créditos por 12 meses para novo cliente; a página atual mostra critérios amplos, mas o FAQ mantém <3 anos e <US$5M. Confirmar a divergência e a necessidade de busca antes de aplicar.
- **Snowflake Startup Accelerator:** créditos e mentoria para cohort seletivo de apps customer-facing sobre o AI Data Cloud, com máximo de 6 meses; exige use case Snowflake.
- **Airbyte YC Promotion:** US$75 mil, mas exclusivo para empresas de qualquer batch YC, <US$5M e cliente novo; confirmar vínculo YC e uso de data integration.
- **Estuary for Startups:** US$2 mil em créditos por 12 meses, sem aceleradora, para empresas <US$5M e não clientes atuais/anteriores; confirmar necessidade de pipelines.
- **Vast.ai Startup Program:** até US$2.500 em GPU e suporte, mas requer mover workload para a marketplace e controlar pré-pagamento/auto-cobrança; não ativar sem orçamento.
- **Nebius for Startups:** créditos de compute somente via VC parceiro, normalmente ≥US$5M, produto AI, <5 anos e e-mail da empresa; há waitlist sem prazo garantido.
- **Perplexity for Startups:** 3 meses Enterprise Pro (até 50 assentos) + US$5 mil API para <5 anos, até US$20M e parceiro aprovado; uso é complementar, não substitui OpenAI.
- **Veridion:** 30 mil créditos por até 3 meses para produto baseado em company intelligence, com pricing pago depois; só faz sentido com use case aprovado.
- **Browse AI/Fivetran:** Browse AI apenas orienta startups a consultar suporte, sem benefício fixo; Fivetran tem promoção limitada para clientes/prospects Databricks, não inscrição startup genérica.
- **Atlassian for Startups:** a página atual publica até 50 assentos Premium por 12 meses; pede que a empresa não seja cliente pagante, tenha funding ou vínculo com VC/aceleradora/incubadora e tenha levantado até US$10M. Pode solicitar prova pública da elegibilidade.
- **ClickUp Startup Program:** a página atual publica crédito de US$3.000 para workspace Enterprise; exige parceiro de funding aprovado, no máximo Series B, entidade incorporada há menos de 5 anos e conta nova ou Free Forever. A rota de aplicação é externa ao site principal.
- **Linear Startup Program:** é voltado a startups afiliadas a parceiros; a aplicação pública encontrada é para organizações que querem ser parceiras, não para resgate direto por uma startup. Mantido `BLOCKED` para não preencher o formulário errado.
- **AWS Activate Offers (Coda, Notion, Ada, DevRev, Grammarly e Slack):** são entradas do diretório de benefícios, não seis inscrições independentes. O benefício e os termos só aparecem depois da elegibilidade/conta AWS Activate; revisar no console antes de qualquer resgate.
- **Formaloo for Startups:** US$1.000; conta Free nova, até US$5M captados, menos de 5 anos, independente e menos de 50 pessoas. O formulário pede e-mail, LinkedIn pessoal, site e funding.
- **GanttPRO Startup Program:** 50% no primeiro plano anual; menos de 3 anos, até 30 pessoas, até Series B, site/domínio próprio e nunca ter pago. Requer e-mail de domínio e pode iniciar assinatura.
- **Pilot Booster:** US$750 no primeiro ano para startup tech recém-incorporada, pré-receita e despesas mensais abaixo de US$15.001; depois vira serviço pago. Não avançar sem necessidade contábil e autorização de cobrança.
- **Reclaim:** 20% por 3 anos; mínimo de 5 assentos, menos de 100 pessoas, menos de US$10M e menos de 5 anos. Confirmar assentos e eventual contato comercial.
- **Miro:** US$500 independente ou US$1.000 via parceiro; conta Free, limites de equipe/funding e domínio próprio. Gmail/Yahoo/Hotmail não são aceitos; fica bloqueado sob a preferência por e-mail pessoal.
- **Intercom Early Stage:** até 93% no primeiro ano, para até US$10M e menos de 15 pessoas; compromisso de assentos e extras pagos permanecem. Confirmar necessidade e cobrança.
- **Zendesk for Startups:** até 2 anos grátis do Suite Professional (até 50 agentes), mas exige novo assinante, funding/equipe/idade e e-mail de trabalho; fica bloqueado com e-mail pessoal.
- **Navan e Front:** as rotas do índice não são programas startup atuais verificáveis; Navan aponta para plano Travel Free e Front para preços gerais. Mantidos `SKIP`.
- **GitLab for Startups:** desconto Ultimate conforme seed/Series A/B, mas exige funding externo verificável, cliente novo e aplicação; self-funded não é elegível.
- **Pulumi for Startups:** até US$10 mil por 12 meses para pré-Series A/receita <US$1M; confirmar estágio, receita e conta.
- **Auth0/Clerk:** benefícios de autenticação dependem de funding/idade, conta e aplicação; não instalar ou trocar o Better Auth sem decisão de produto.
- **Retool:** até US$60 mil/1 ano para cliente novo e funding <US$10M; exige novo plano e possível cobrança após o benefício.
- **Datadog/Grafana/New Relic:** alternativas de observabilidade com créditos/planos, mas exigem referral/conta/critério e escolha de stack; Sentry permanece a opção já integrada.
- **Make/n8n:** descontos exigem conta, domínio/equipe e compromisso pago/self-hosting; não ativar sem autorização de cobrança.
- **AWS Activate Offers de CrowdStrike/Scytale/Temporal:** são benefícios condicionais no portal AWS, não candidaturas independentes; Sonatype exige compromisso pago de 18 meses e Bubble está fora do stack.
- **1Password/CircleCI:** as páginas atuais são programas open source, não startup; mantidos `SKIP` para o produto comercial.
- **ComplyCube/Signzy/Memberstack/Stytch/Ansys/Cursor/Zenduty/Alloy:** as rotas atuais são fora do escopo, obsoletas ou sem benefício público verificável; mantidos `SKIP`.
- **Sentry:** a página pública anuncia US$5 mil em créditos por 1 ano (expiram ao fim do ano), exige conta gratuita antes do formulário e costuma responder em 2–3 dias úteis; a fonte de desconto está protegida por login. O fundador confirmou pagamento anterior, então não atende ao requisito de novo pagante. Só reabrir se o Sentry confirmar uma exceção. Ofertas específicas de YC/a16z speedrun não acumulam.
- **Beefree SDK:** oferece 90% de desconto por 12 meses, mas somente para SaaS que embute um editor de conteúdo para seus próprios usuários; não é aderente ao ADScale atual.
- **Figma:** a página oficial encontrada é de Service Partner para consultorias/agências/integradores, sem benefício startup público; mantido `SKIP`.
- **Framer:** oferece um ano de Pro, mas exige Company Email/domínio, pre-seed/seed, parceiro aprovado e nunca ter usado Framer; fica `BLOCKED` com a preferência por e-mail pessoal.
- **Shopify/Squarespace:** as páginas atuais são promoções gerais de loja ou Google Workspace para sites Squarespace pagos, não programas startup; mantidos `SKIP` sem abrir conta.
- **Chargebee for Startups:** Billing grátis até US$1M de faturamento cumulativo para cliente novo ligado a aceleradora/VC parceiro e com funding <US$5M; fica `BLOCKED` até confirmar parceiro, necessidade e possível sobreposição com Stripe.
- **Stripe Atlas:** é incorporação paga nos EUA (US$500 de setup + US$100/ano), com dados legais sensíveis; não é crédito startup e só pode avançar após decisão legal/fiscal e autorização explícita.
- **Cacheflow:** a página oficial informa aquisição pela HubSpot e fim da venda standalone; a antiga oferta Startup Accelerator está indisponível.
- **RemotePass:** os IDs 184 e 185 apontavam para o mesmo programa; manter somente o ID 184 para evitar candidatura duplicada.
- **Alibaba, AWS ARRC, Cloudzy e OTC:** as rotas atuais são AI Catalyst, benefício via parceiro SMB, programa B2B sem valor publicado e TechBoost com até €100 mil/€10 mil, respectivamente; todos exigem confirmação de parceiro, workload e abordagem comercial.
- **Oracle, Akamai e Vultr:** créditos/trials exigem conta, identidade ou método de pagamento e podem gerar overage; o VIP Digital Start-up da Vultr também exige Series A–E e seis meses de invoices, incompatíveis com o funding 0 confirmado. O crédito promocional Vultr continua bloqueado até confirmar conta e controle de cobrança.
- **Vultr — link recebido:** `discover.vultr.com/startup-program` resolve para a mesma página "Startup Program | Vultr Discover" já registrada no ID 24. Os parâmetros `_gl`, `_gcl_au` e `_ga` são apenas rastreamento e foram omitidos; não criar uma entrada duplicada. O ID 24 foi marcado `SKIP` após a confirmação de funding 0, pois a página exige Series A–E e seis meses de invoices de compute.
- **Synadia, Heroku e Unity:** Synadia é trial técnico sem deal startup; Heroku é somente OSS; Multiplay da Unity tem aviso de fim do suporte direto. Mantidos `SKIP`.
- **CockroachDB, InfluxDB, MotherDuck e ScaleGrid:** há tiers/trials ou desconto atual, mas todos exigem conta, decisão de banco/infra e/ou billing; MotherDuck também rejeita e-mail pessoal.
- **DataStax/Astra:** produto continua ativo sob IBM, mas o claim histórico de US$300 não foi confirmado; manter `BLOCKED` e não migrar o Postgres sem decisão.
- **0x, Google Web3, thirdweb, Aleph, BlockPI, QuickNode e TiDB OSS:** rotas atuais são Web3, coortes encerradas ou benefícios open source sem fluxo aplicável; mantidos `SKIP`.
- **ScraperAPI, Lamini e Statsig:** têm uso potencial (scraping, LLM ou analytics), mas exigem workload/escala/conta e podem cobrar após créditos; mantidos `BLOCKED` até decisão de produto.
- **AssemblyAI, ElevenLabs, Murf, Rime e PlayAI:** ofertas atuais são voz/TTS, YC ou educação/nonprofit; não há caso de uso compatível no ADScale.
- **IonQ, Phospho e You.com:** IonQ é pesquisa acadêmica, Phospho está sem programa funcional e You.com encerrou a parceria; mantidos `SKIP`.
- **Reddit, Snapchat e TikTok:** créditos exigem gasto real, conta Ads e método de pagamento; mantidos `SKIP` enquanto mídia paga não estiver aprovada.
- **HootGiving e Slab:** descontos atuais são exclusivamente para nonprofits/escolas; ADScale é for-profit.
- **FounderPass, Secret, SeedReady, StartGround e Startup Stack:** são agregadores/intermediários, alguns com membership ou trial pago; priorizar o fornecedor direto e não criar contas.

### Entradas atuais dos formulários

- **AWS:** [AWS Activate Join](https://startups.aws.com/join?destination=%2Fcredits%2Fapply) — exige Builder ID e conta AWS.
- **Notion:** [Startup application](https://app.notion.com/startups-apply) — exige conta não pagante e e-mail de trabalho/domínio.
- **GitHub:** [lista de parceiros](https://github.com/enterprise/startups/partners) — a entrada é por referral de investidor, incubadora ou aceleradora.
- **Microsoft:** [Startups portal](https://startups.microsoft.com/) — o formulário e a elegibilidade são avaliados no portal.
- **Cloudflare:** a landing page está ativa, mas o CTA [Apply now](https://www.cloudflare.com/lp/startups) retorna 404; além disso, a página exige e-mail empresarial correspondente ao domínio. Manter bloqueado sob a preferência atual por e-mail pessoal, sem tentar contornar o requisito.
- **OpenAI:** a rota pública não expõe um formulário simples verificável; confirmar referral/conta e os campos na tela antes de qualquer preenchimento. JetBrains permanece fora da fila por opção do fundador; Sentry, por pagamento anterior confirmado.
- **Framer:** o formulário está embutido na página de Startups e pede Name, Company Email, Company, Domain, Country, City, Stage, Employees, Partner e Crunchbase/LinkedIn; não abrir sem confirmar o e-mail corporativo exigido.
- **Chargebee:** a página de Startups tem `Apply now` e revisão comercial; confirmar parceiro/aceleradora, funding e necessidade de billing antes de abrir a rota.
- **Stripe Atlas:** a documentação de Atlas exige dados legais e sensíveis do fundador e pagamento; não tratar como candidatura de benefício.

## Dados necessários para preencher formulários

### Matriz de confirmação do primeiro lote

Nenhum valor abaixo está preenchido. Antes de cada formulário, apresentar a linha completa ao fundador e aguardar confirmação explícita. O e-mail pessoal não será salvo neste repositório.

| Programa | Dados a confirmar antes do formulário | Regra de e-mail | Condição que interrompe o avanço |
| --- | --- | --- | --- |
| Cloudflare | E-mail pessoal, domínio/site, perfis públicos, constituição, funding e primeira candidatura | Domínio empresarial obrigatório; não aceita e-mail pessoal comum | CTA 404, e-mail incompatível ou método de pagamento sem autorização específica |
| AWS Activate | E-mail/Builder ID, conta AWS, produto, funding, idade e eventual Provider ID | E-mail profissional | Conta, billing ou parceiro não confirmados |
| Microsoft for Startups | Conta Microsoft pessoal, telefone, entidade/endereço, produto próprio, situação privada/for-profit, créditos Azure anteriores e referral | Confirmar no portal | Criação da conta, códigos de verificação ou método de pagamento não autorizados |
| OpenAI for Startups | E-mail, VC/referral code, Organization ID, produto/uso da API, contatos-chave e funding | E-mail empresarial válido | VC/referral ou e-mail empresarial não confirmado |
| GitHub for Startups | Parceiro, funding externo, conta Enterprise, administrador e créditos/licenças anteriores | Confirmar com a conta/parceiro | Parceiro, conta nova ou elegibilidade de funding não confirmados |
| Sentry Startup | Idade da empresa, funding, situação de novo pagante, equipe e contato | Não aplicar — pagamento anterior confirmado | Só reabrir com exceção explícita do Sentry |
| Notion for Startups | Conta não pagante, tamanho da equipe, website, promoções anteriores e e-mail | Domínio de trabalho; Gmail/Outlook excluídos | E-mail pessoal comum ou elegibilidade não confirmada |
| JetBrains Startups | Empresa, website, tamanho/equipe, prova de startup e conta de contato | Não aplicar — opção do fundador | Só reabrir com autorização explícita |
| Framer Startups | Empresa/domínio, país/cidade, pre-seed/seed, equipe, parceiro aprovado e Crunchbase/LinkedIn | Company Email/domínio obrigatório | E-mail pessoal, parceiro ou uso anterior não confirmados |
| Chargebee for Startups | Parceiro/aceleradora, funding, cliente novo, necessidade de billing e gateways | Confirmar no formulário | Sobreposição com Stripe, migração ou billing futuro não aprovados |
| Stripe Atlas | Decisão societária nos EUA, nome/DOB/endereço/ownership, EIN e pagamento | E-mail e dados legais do fundador | Decisão legal/fiscal, dados sensíveis ou US$500 não autorizados |
| Atlassian for Startups | Funding/vínculo com parceiro, valor total levantado, status de cliente pagante, conta e prova pública | Confirmar no formulário | Funding, parceiro ou ausência de conta paga não confirmados |
| ClickUp Startup Program | Parceiro de funding, rodada, data de incorporação, workspace novo/Free Forever e administrador | Confirmar no formulário | Elegibilidade, conta nova ou termos do crédito não confirmados |
| Asana Startup Program | Estágio, conta free/nova, código de parceiro e checkout anual | Confirmar no formulário | Cartão, conta paga ou código de parceiro não confirmados |
| DigitalOcean Startups | E-mail de domínio, team account nova, parceiro, cartão e uso pretendido | E-mail corporativo obrigatório | Conta/cartão ou termos de crédito não confirmados |
| OVHcloud Startup | Estágio, MVP/POC, workload, conta e necessidade de cloud | Confirmar no formulário | Migração ou critérios não confirmados |
| Akamai Rise | Idade, workload, conta nova, e-mail de domínio e cartão | Domínio corporativo obrigatório | E-mail pessoal, cartão ou migração não autorizados |
| Huawei Cloud Startup | Entidade, idade, verificação empresarial, conta e workload | Confirmar no portal | Verificação ou migração não confirmadas |
| Google Cloud/AI | Funding/rodada, idade, créditos prévios, projeto e uso de Gemini | Confirmar no portal | Migração, funding ou limite de créditos não confirmados |
| Render for Startups | Funding, idade, conta atual, parceiro e tier pretendido | Confirmar no formulário | Conta existente ou elegibilidade de funding não confirmada |
| MongoDB for Startups | Nome legal, URL, LinkedIn, funding, idade e status/conta Atlas | E-mail corporativo obrigatório | Entidade, LinkedIn ou necessidade de migração não confirmados |
| Redis Startup Program | Elegibilidade, conta, limites e workload de cache/estado | Confirmar no formulário | Critérios e cobrança não confirmados |
| Appwrite Startups | Idade, funding/ARR, conta, e-mail, projeto e migração | Confirmar no formulário | E-mail ou migração não confirmados |
| Pinecone for Startups | Funding, equipe, conta e workload de busca/embeddings | Confirmar no formulário | Conta e necessidade não confirmadas |
| Civo Startups | Estágio, conta, uso de compute, duração e termos de crédito | Confirmar no formulário | Necessidade de migração ou uso de GPU não confirmada |
| Koyeb Startup Program | Vigência, funding/parceiro, conta e workload | Confirmar com o programa | Página antiga/plano substituído ou migração não confirmados |
| Scalingo Startup Program | Elegibilidade, conta, workload e necessidade de nova hospedagem | Confirmar no formulário | Termos ou migração não confirmados |
| Formaloo for Startups | Idade, funding, equipe, conta Free, site, LinkedIn e e-mail | Confirmar no formulário | Conta nova ou e-mail não confirmados |
| GanttPRO Startup Program | Idade, funding, equipe, site, e-mail de domínio e plano anual | Domínio próprio obrigatório | E-mail, assinatura ou elegibilidade não confirmados |
| Pilot Booster | Data de incorporação, receita, despesas, necessidade contábil e compromisso após 1 ano | Confirmar no formulário | Serviço pago ou critérios não confirmados |
| Reclaim Startup Discount | Assentos, funding, idade, equipe e contato comercial | Confirmar na conta | Assinatura e elegibilidade não confirmadas |
| Miro Startup Program | Parceiro, funding, equipe, conta Free, domínio e e-mail | Domínio próprio obrigatório | E-mail pessoal ou conta paga bloqueiam o avanço |
| Intercom Early Stage | Funding, equipe, conta nova, assentos e extras pagos | Confirmar no signup | Compromisso/cobrança não autorizados |
| Zendesk for Startups | Funding, equipe, idade, parceiro, novo assinante e contato | E-mail de trabalho obrigatório | E-mail pessoal, trial ou cartão sem autorização |
| GitLab for Startups | Funding externo, estágio, conta nova, site e prova pública | Confirmar no formulário | Funding ou conta não confirmados |
| Pulumi for Startups | Estágio, receita, conta e workload IaC | Confirmar no formulário | Elegibilidade ou necessidade não confirmadas |
| Auth0/Clerk | Funding, idade, conta, domínio/e-mail e necessidade de auth | Confirmar no formulário | Migração do Better Auth não aprovada |
| Retool | Funding, idade, conta nova, plano e uso interno | Confirmar no formulário | Upgrade/cobrança não autorizados |
| Datadog/Grafana/New Relic | Referral, conta, funding, equipe e escolha de observabilidade | Confirmar no portal | Stack, marketing ou cobrança não aprovados |
| Make/n8n | Conta, domínio, equipe, funding e plano pago/self-hosted | Domínio de trabalho em Make | Assinatura, licença ou cobrança não autorizada |
| Sentry Startup | Idade, funding, conta, novo pagante e campos do formulário | Não aplicar — pagamento anterior confirmado | Exceção do Sentry ou correção do histórico de pagamento |
| Algolia Startup | Idade, funding, conta nova, cupons prévios e use case de busca | Confirmar no formulário | Critérios divergentes ou cobrança após créditos |
| Snowflake Accelerator | Use case customer-facing, conta/projeto e potencial para clientes Snowflake | Confirmar no formulário | Cohort seletivo ou uso não confirmados |
| Airbyte YC | Batch YC, funding, conta nova e pipelines | Confirmar no formulário | Vínculo YC ou migração não confirmados |
| Estuary for Startups | Funding, conta, fontes/destinos e necessidade de pipeline | Confirmar no formulário | Uso de data integration não confirmado |
| Vast.ai Startup | Workload GPU, orçamento, conta e política de pré-pagamento | Confirmar no formulário | Migração/auto-cobrança não autorizadas |
| Nebius for Startups | VC parceiro, funding, idade, produto AI e e-mail da empresa | Domínio corporativo obrigatório | Waitlist ou funding não confirmados |
| Perplexity for Startups | Parceiro, funding/idade, conta e uso complementar | Confirmar no formulário | Assinatura/uso não aprovados |
| Veridion Startup | Use case, receita, equipe, volume de API e pricing após créditos | Confirmar na scoping call | Compromisso pago não autorizado |

Somente após a confirmação de uma linha ela pode ser tratada como pronta para preenchimento; criar conta, adicionar cartão, aceitar cobrança ou clicar em `Submit` continua sendo um gate separado.

```text
Nome legal da empresa:
País/cidade e ano de constituição:
Bootstrapped ou funding (valor, rodada, data, investidor/accelerator):
Receita anual/ARR:
Número de pessoas:
Domínio do produto e e-mail pessoal do fundador (fornecer no envio):
LinkedIn / X / GitHub da empresa:
Contas existentes e créditos/promos já usados:
```

Não registrar segredos, tokens ou dados de cartão neste arquivo.
