# Landing Page Match Design

Date: 2026-05-17
Status: Approved

## Goal

Add a new ADScale function that turns an approved ad creative into a complete exportable landing page. The first version should generate a full HTML file that can be downloaded and moved into Webflow, Framer, or a client website.

## Product Direction

The source of truth is an approved derivation plus the campaign briefing. The approved creative provides the visual and message anchor. The briefing provides audience, offer, CTA, tone, constraints, platforms, and client context.

This is a new delivery function, not an improvement to the existing ad-generation flow. It should create a new asset type: a landing page matched to the winning ad.

## UX Flow

1. User approves a derivation in the campaign gallery.
2. The approved derivation card shows a "Generate landing page" action.
3. User triggers generation from that card.
4. ADScale reads the campaign briefing and the approved derivation metadata.
5. The model generates a structured landing page with multiple sections.
6. The server renders the structure into standalone HTML with embedded CSS.
7. The HTML is saved to storage.
8. The user receives a download link for the HTML file.

The first version should avoid a landing editor. The output is a complete downloadable HTML artifact.

## Landing Page Structure

The model should return structured JSON, not raw HTML. Required sections:

- hero
- problem
- solution
- benefits
- social proof or trust
- offer
- FAQ
- final CTA

Each section should include concise copy and layout intent. The renderer owns the actual HTML and CSS so the app can keep output safer and consistent.

## Data Model

Add a `landing_pages` table:

- `id`
- `workspaceId`
- `campaignId`
- `sourceDerivationId`
- `status`
- `title`
- `structure`
- `htmlKey`
- `error`
- `createdAt`
- `updatedAt`

Suggested statuses:

- `queued`
- `completed`
- `failed`

The first version can generate synchronously in the API if latency is acceptable, but the design should keep the repository and status model compatible with an async job later.

## API

Add `POST /api/derivations/[id]/landing-page`.

Rules:

- require workspace access;
- require the derivation to exist in the workspace;
- require `status === "approved"`;
- require the derivation to have an image/output key;
- require the campaign to exist;
- generate structure from campaign plus derivation;
- render HTML server-side;
- upload HTML as `text/html`;
- persist the landing page record;
- return `{ landingPage, downloadUrl, expiresAt }`.

## Generation Rules

The prompt should preserve:

- campaign offer;
- CTA text when present;
- target audience;
- tone and constraints;
- client/brand context;
- the approved derivation's concept and message.

The model must not invent unsupported guarantees, fake testimonials, fabricated legal claims, or unavailable discounts. When proof is missing, the landing page should use generic trust placeholders or omit specific proof.

## HTML Renderer

Use an internal renderer that converts validated structure into HTML. The renderer should:

- produce a full HTML document;
- include responsive CSS inline;
- include semantic sections;
- reference the approved creative image when possible;
- avoid external JS;
- avoid remote fonts in the first version;
- keep copy editable after export.

The exported file should work when opened directly in a browser.

## UI Placement

Add the action to approved derivation cards near export and delivery-package actions. The user should understand this as another output generated from the winner.

Show loading while generation runs. On success, open the download URL or expose it through the same export behavior used elsewhere.

## Errors And Edge Cases

If the derivation is not approved, return a 409-style error and do not generate.

If the derivation has no output image, block generation.

If the model returns invalid JSON, persist failure state and return a clear error.

If storage upload fails, do not claim success.

If the campaign has weak briefing fields, generate conservative copy and avoid fake specificity.

## Testing Strategy

Cover the feature with focused tests:

- prompt builder includes campaign and derivation context;
- structure normalizer rejects invalid model output and fills safe defaults;
- HTML renderer creates a complete standalone document;
- repository creates and updates landing-page records scoped to workspace;
- API rejects missing, unapproved, or image-less derivations;
- API returns a download URL on success;
- hook posts to the API and opens/downloads the returned artifact;
- derivation card shows the action only for approved derivations with images.

## Later Extension

After Landing Page Match ships, Persona Simulator should analyze the generated landing page plus the source ad. It can report what each persona understands, rejects, wants, and would click.
