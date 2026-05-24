# Layers Design Session — 2026-05-24

## Framework

Using the Layers of Product Design framework:

1. Observed behaviour
2. Domain
3. User needs
4. Product & service strategy
5. Conceptual model
6. Interaction structure and flow
7. Surface

Lower layers are foundations for upper layers. Before resolving an upper-layer decision, check whether the relevant lower-layer decisions are stable.

## Project Notes

- Separate true new product features from incremental flow improvements.
- When touching translated surfaces, verify the whole surface rather than only the first missing key.

## Session Focus

Orient ADScale geral as an existing product with a problematic flow.

## Layer Audit

| Layer | State | Notes |
| --- | --- | --- |
| Observed behaviour | Weak | The repo contains many product/design plans and implementation proofs, but little evidence of direct user observation, interviews, analytics-derived behaviour, or real agency workflow traces. Pain points are plausible, but mostly product/team inferred. |
| The domain | Partial | The product domain is recognizable: campaigns, creatives, formats, briefings, references, derivations, QA, landing pages, personas, credits, workspaces. However, the real-world agency/client handoff model is not yet explicit enough to explain which artefacts belong to campaign work vs client memory vs final delivery. |
| User needs | Assumed | Several needs are stated in feature docs, such as reducing manual briefing, choosing winners faster, preserving references, and producing delivery packages. These are useful but not yet organized as underlying jobs with evidence and priority. |
| Product & service strategy | Partial | The product direction is clear enough for an AI ad-creative SaaS with billing, credits, campaign generation, review, export, and reference workflows. The strongest strategic question is still which primary workflow should define the product: campaign creation, creative improvement, client asset memory, or delivery packaging. |
| Conceptual model | Partial / Risky | The data model is rich, but the user-facing model is carrying many objects: workspace, campaign, template, client profile, reference, asset, pending upload, plan, derivation, preview, QA, landing page, persona simulation, delivery package, export, credit. Some relationships are implicit or feature-local, which can make flows feel bolted together. |
| Interaction structure | Partial | There is a concrete wizard flow: Briefing -> Upload -> Plan -> Gallery, plus review/export-style actions from derivation cards. The interaction path exists, but post-generation actions compete for meaning: QA, approve/reject, save reference, landing page, persona simulation, package, export, regenerate. |
| Surface | Strong | The project has an approved flat/dense dashboard direction, component conventions, i18n, and many implemented surfaces. Surface quality is not the root bottleneck for the reported "problematic flow." |

## Bottleneck

The bottleneck is **Observed behaviour**.

The product has accumulated many plausible capabilities, but the foundation underneath them is thin: we do not yet have a clear record of what a real user actually does before, during, and after using ADScale. That makes upper-layer decisions riskier because every feature can argue that it helps "make ads," while the product lacks a shared behavioural spine for deciding which flow matters most.

The immediate design risk is that the product keeps improving individual surfaces while the main workflow remains conceptually crowded. A user may ask: am I creating a campaign, improving one creative, building a reusable client library, preparing a delivery package, or simulating market response? The app supports all of those, but the observed behaviour layer does not yet tell us which one should dominate the experience.

## Assumed Layers

- **User needs** are treated as known, but most are feature-local rather than evidence-backed jobs.
- **Conceptual model** is implemented in schema and APIs, but not yet cleanly articulated as a shared user-facing model.
- **Interaction structure** exists in code, but the meaning of secondary actions after generation is not yet clearly prioritized.

## Recommendation

Run `/layers-observed-behaviour` next.

Reason: before changing the wizard, dashboard, or object model, identify the actual behavioural sequence the product is trying to serve. The useful output should be a compact behavioural map: what the marketer/agency person starts with, what they are trying to transform it into, what decisions they make, what they hand off, and where ADScale currently interrupts or accelerates that sequence.

If we must move faster because the product needs a near-term release decision, the pragmatic alternative is `/layers-conceptual-model`: define the object model explicitly so the existing feature set stops feeling like a pile of adjacent tools. But that would still be design under behavioural uncertainty.

## Observed Behaviour Plan

Mode: **Plan from scratch**.

No user research, analytics review, interviews, support-ticket analysis, or session recordings were available in the repo during this session. Current observations are therefore **product-inferred**, not user-observed.

### Learning Goal

Understand the real workflow a marketer, designer, founder, or agency operator follows when turning existing campaign inputs into final paid-social creative assets, so ADScale can decide which flow should be primary and which capabilities should remain supporting actions.

Specific research questions:

1. When someone needs new paid-social creatives, what triggers the work and what starting materials do they actually have?
2. How do they decide whether a creative is "good enough" to ship, revise, adapt into more formats, or save as future reference?
3. Where does the workflow currently break down: briefing quality, visual consistency, client feedback, format adaptation, handoff/export, or confidence before spending media budget?

### Participants

Recommended first round: 6-8 qualitative participants.

Recruit across three behaviour types:

| Participant type | Why |
| --- | --- |
| Small agency operators / performance marketers | Likely to handle repeated client campaigns, references, approvals, and delivery packages. |
| In-house growth/marketing generalists | Likely to feel the pain of generating many variants without a full design team. |
| Founder/operator running ads personally | Likely to reveal low-setup, speed-driven behaviour and vocabulary. |

Prioritize people who created or requested ad creatives in the last 30 days. Avoid asking only hypothetical future users; this study needs real past behaviour.

### Study Method

Primary method: **JTBD interviews** about a recent real campaign.

Add-on if possible: **artifact walkthrough**. Ask the participant to show the brief, reference assets, generated/exported creatives, client comments, Slack/WhatsApp/Figma links, or final ad manager upload screen from one real campaign.

Why this method:

- JTBD interviews reveal triggers, anxieties, tradeoffs, and success criteria.
- Artifact walkthroughs reveal tacit behaviour users may forget to mention.
- This is better than a usability test first, because the current gap is not only "can they use ADScale?" but "what real work is ADScale trying to fit into?"

### Interview Guide

Opening:

- "Tell me about the last time you had to create or adapt paid-social creatives. Walk me through what was happening at that point."

Timeline:

- "What triggered the need for new creatives?"
- "What did you already have before starting: brief, old creative, landing page, product images, brand guide, client notes, examples?"
- "What did you do first?"
- "Where did the work move next: designer, AI tool, client chat, ad account, spreadsheet, Figma, Canva?"
- "What made you keep going, stop, restart, or ask someone else?"

Decision points:

- "How did you decide the creative was ready?"
- "What made you reject or revise a version?"
- "When did you need more formats, and how did you adapt them?"
- "What did you hand off at the end, and to whom?"
- "What did you save or reuse for the next campaign?"

Motivations and anxieties:

- "What were you hoping would be different after finishing this?"
- "What were you worried could go wrong?"
- "What almost slowed you down or made you abandon a version?"
- "Where did you feel you were guessing?"

Closing:

- "If you could remove one painful step from that process, which one would it be?"
- "Is there anything I did not ask that would help me understand how this work really happens?"

### What To Listen For

Nouns and natural language:

- campaign, ad, creative, peça, arte, variant, winner, brief, reference, client, brand, format, package, export, landing page, approval, feedback, CTA, offer, asset, product, audience, hook.

Workarounds:

- copying old campaigns
- checking WhatsApp/Slack for client preferences
- using Canva/Figma as the real source of truth
- manually resizing winners into formats
- asking AI for ideas, then fixing by hand
- keeping client references in folders instead of structured libraries
- exporting many assets before knowing which one is approved

Confidence signals:

- repeated behaviour across participants
- real artifacts shown during interview
- examples from campaigns completed in the last 30 days
- workarounds users already spend time on

Weak signals:

- statements about what they "would" do
- generic praise for AI speed
- opinions about features without a recent story
- needs described only in product vocabulary, not their own workflow language

### Candidate Job Stories

These are not validated yet; they are research hypotheses.

| Job story | Confidence | Notes |
| --- | --- | --- |
| When I have an existing ad or rough reference and need more campaign variants quickly, I want to generate options that preserve the core offer and CTA, so I can test creative directions without starting from scratch. | Assumed | Strongly implied by art variation, CTA literal contracts, briefing doctor, and reference image flows. Needs real behaviour evidence. |
| When one creative is approved, I want to turn it into all required paid-social formats, so I can deliver or launch without rebuilding the same idea manually. | Assumed | Implied by delivery package design. Needs evidence that this is a frequent handoff pain. |
| When I work repeatedly for the same client, I want to reuse prior winners and brand references, so new creatives stay on-brand without a heavy setup process. | Assumed | Implied by client reference library. Needs evidence of how users currently store and reuse this memory. |
| When I am unsure whether a creative will persuade the intended audience, I want a quick critique before spending ad budget, so I can revise weak messages earlier. | Assumed | Implied by persona simulator and QA features. Needs evidence that this is a real pre-launch decision point, not only a nice-to-have analysis. |
| When the campaign brief is incomplete, I want help spotting missing context before generation, so I avoid generic or unusable outputs. | Assumed | Implied by Briefing Doctor. Needs evidence of whether users blame bad outputs on bad briefing, model quality, or unclear product flow. |
| When I need to create a campaign but do not know what to write in the brief, I want guided help turning vague intent into usable campaign inputs, so I can start generation without pretending I already have a complete strategy. | Assumed | Current focal hypothesis for in-house marketing generalists starting from blank or weak briefings. |
| When I know the product or offer I need to promote but do not know how to brief a creative, I want the product to guide me from that offer into audience, angle, CTA, and visual direction, so I can generate useful ad options without writing a professional creative brief from scratch. | Assumed | Refined focal hypothesis for the current behavioural path. |

### Synthesis Plan

Capture one observation per note. Do not summarize directly into recommendations.

Suggested tags:

- `trigger`
- `starting-material`
- `decision-point`
- `approval`
- `revision`
- `format-adaptation`
- `handoff`
- `reuse`
- `confidence`
- `workaround`
- `language`
- `tool-chain`

For each interview, record:

- participant type
- recent campaign context
- raw observations / quotes
- artifacts shown
- workflow timeline
- decisions made
- tools used
- workarounds
- open questions

### Research Gaps

- Which starting point is most common: blank brief, existing ad, landing page, client reference folder, or approved winner?
- Who is the actual user: solo operator, agency strategist, designer, media buyer, founder, or client-facing account person?
- What is the real "done" state: approved creative, exported files, launched ads, client signoff, or performance-learning loop?
- Is confidence before launch a major buying reason, or is speed of production the dominant pain?
- Does the user think in campaigns, creatives, clients, assets, packages, or tasks?
- Which existing ADScale action should be the main path after generation: approve, export, package, landing page, persona simulation, QA, regenerate, or save reference?

### Current Working Assumption

The session will focus first on the behavioural path where the user starts from a **blank or weak briefing**, rather than from an existing ad, approved winner, landing page, or client reference folder.

Confidence: **Assumed**.

Implication: the next design work should prioritize what the user knows at the moment they begin, what information is missing, how they currently fill that gap, and what "ready enough to generate" means from their perspective.

Primary user for this path: **in-house marketing generalist**.

Confidence: **Assumed**.

Implication: the workflow should account for someone who may own positioning, campaign setup, creative requests, tool operation, and performance accountability, but may not have deep design support available at the moment of creation.

Primary starting pain: **the user does not know what to write in the briefing**.

Confidence: **Assumed**.

Implication: the product should not treat the briefing as a normal form-filling task. The first behavioural problem is helping the user articulate campaign intent, audience, offer, CTA, constraints, and creative direction from uncertainty.

Likely cause: **the user knows the campaign strategy, but does not know how to translate it into a creative briefing**.

Confidence: **Assumed**.

Implication: the product should bridge from business/marketing intent into creative instructions. The research should look for the user's natural strategy language and where it fails to become visual/copy direction.

Likely strategy input already known: **offer/product**.

Confidence: **Assumed**.

Implication: the guided starting point should probably ask "what are you promoting?" before asking for a complete campaign brief. From there, the system can help derive audience, angle, CTA, constraints, and creative direction.

Desired first output: **a briefing ready to generate**.

Confidence: **Assumed**.

Implication: the product should optimize this path for turning offer/product knowledge into a generation-ready brief, not for open-ended ideation or a full campaign plan. Creative angles and campaign suggestions can support the path, but should not become the main outcome of this first moment.

Preferred creation mode: **guided questions one at a time**.

Confidence: **Assumed**.

Implication: the experience should reduce blank-page pressure by asking one understandable question at a time, using the user's product/offer answer to guide the next decision. A dense all-at-once form is likely the wrong starting shape for this behavioural path.

## Decisions

- Use `/layers-orient` to diagnose ADScale geral as an existing product with a problematic flow.
- Treat observed behaviour as the lowest unstable layer.
- Recommend `/layers-observed-behaviour` as the next skill unless release constraints force a conceptual-model pass first.
- Use `/layers-observed-behaviour` in Plan mode because no direct user research was available.
- Treat current job stories as assumptions until interviews or artifact walkthroughs validate them.
- Focus the first behavioural path on users starting from a blank or weak briefing.
- Use the in-house marketing generalist as the primary participant/user lens for this behavioural path.
- Treat "does not know what to write in the briefing" as the primary starting pain for this path.
- Treat strategy-to-creative-brief translation as the likely cause of the starting pain.
- Treat product/offer as the likely known input at the start of the flow.
- Treat "briefing ready to generate" as the desired first output for this path.
- Treat guided one-question-at-a-time input as the preferred creation mode for the initial brief.

## Open Questions

- What real workflow evidence do we have from target users or agency/client work?
- Is ADScale primarily a campaign-creation workflow, a creative-improvement workflow, a client-memory system, or a delivery-packaging workflow?
- Which post-generation action is the product's main success path: approve, export, package, landing page, persona simulation, or save as reference?

## Review

Ran a repo-grounded orientation using existing plans, architecture docs, schema, and campaign workspace flow. Then produced an observed-behaviour research plan from scratch. No product code was changed.
