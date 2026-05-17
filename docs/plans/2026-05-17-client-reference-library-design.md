# Client Reference Library Design

Date: 2026-05-17
Status: Approved

## Goal

Build a lightweight client reference library for ADScale. The feature should give each client a small reusable brand memory made of visual references and concise notes, then let campaigns select those references as generation context.

## Product Direction

The approved direction is a lean hybrid:

- keep the library close to the campaign flow;
- store a simple client/brand profile;
- attach reusable visual references to that profile;
- let approved derivations be saved back as references;
- avoid building a full digital asset manager.

The library should help the user reuse what has worked for a client without forcing heavy setup before the first campaign.

## UX Flow

In the campaign briefing, the user can choose or create a client profile. When a client is selected, the briefing shows a "Client references" area with saved images and short labels. The user selects which references should guide this campaign.

Supported first-version reference kinds:

- `style`
- `product`
- `layout`
- `logo`
- `negative`
- `other`

The reference library is assistive. Generation remains available when no client or reference is selected.

After a derivation is approved, the card exposes a discreet "Save as reference" action. The user can choose the client, reference kind, label, and notes. This lets the library grow naturally from successful work.

## Data Model

Add `client_profiles`.

- `id`
- `workspaceId`
- `name`
- `description`
- `visualNotes`
- `toneNotes`
- `constraints`
- `createdAt`
- `updatedAt`

Add `client_references`.

- `id`
- `workspaceId`
- `clientProfileId`
- `assetKey`
- `label`
- `kind`
- `notes`
- `sourceDerivationId`
- `createdAt`

Add campaign fields:

- `clientProfileId`
- `selectedReferenceIds`

The physical image files should continue to use the existing storage path. The new tables only add reusable metadata and relationships.

## Generation Behavior

Selected references are auxiliary context, not replacements for the campaign's primary image.

For `art_variation`, the uploaded campaign image remains the visual source of truth. Selected references provide style, layout, product, or negative guidance. The prompt should name the selected references and explain how each may influence the result.

For `restyling`, style references influence visual treatment only. They must not copy factual content, offer text, CTA text, or layout details that conflict with the base creative.

For `format_adaptation`, references should be text-only context in the first version. The winner image remains the source to preserve the approved asset and target format.

Existing contracts stay intact:

- preserve CTA text exactly when supplied;
- preserve selected target format;
- preserve generation mode behavior;
- do not use references to override campaign constraints.

## Errors And Edge Cases

If a selected reference is missing in storage, skip that reference and surface a light warning. The campaign should still generate with the remaining references.

If a client profile is deleted later, old campaigns and derivations remain intact. They may lose the reusable profile link, but generated outputs are not modified.

If no references are selected, generation continues exactly as it does today.

If a user tries to save a derivation without an image as a reference, block the action.

## Testing Strategy

Cover the feature through focused tests:

- schema and repository tests for client profiles and client references;
- route tests for listing, creating, and deleting profiles/references;
- route test for saving an approved derivation as a reference;
- briefing tests for selecting a client and references;
- prompt-builder tests proving selected references enter the prompt without changing CTA, format, or generation mode;
- card tests showing "Save as reference" only for approved derivations with images.

## Open Decisions For Implementation

The first implementation plan should decide whether manual reference upload is included in the first slice or deferred until after saving approved derivations works.

The first implementation plan should keep UI scope small: campaign briefing selection plus save-from-card is enough for the first release.
