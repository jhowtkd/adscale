# Delivery Package Multi-Format - Design

## Context

ADScale can already generate campaign derivations, score them, approve/reject outputs, regenerate weak pieces, and adapt a campaign asset into one target format through `format_adaptation`.

The next product improvement is to let a user turn an approved winner into a final delivery package. The user should not need to create a separate format-adaptation campaign manually. The app should use the approved generated image as the visual source of truth and create final versions for paid-social formats.

## Goal

Create a package-generation flow that starts from an approved derivation and generates selected final formats from that winner.

The first version should:

- expose a `Generate package` action on approved derivations
- show `1:1`, `4:5`, and `9:16` selected by default
- let the user unselect formats before confirming
- skip generation for the source derivation's own format
- create child derivations for the selected target formats
- use the approved derivation output as the visual input for `format_adaptation`
- keep package outputs inside the existing campaign gallery/review workflow

## Non-Goals

- Do not create a separate delivery-package page.
- Do not create a new campaign for the package.
- Do not change the existing manual `format_adaptation` campaign flow.
- Do not add ZIP export in the first version.
- Do not add package version history in the first version.
- Do not require a creative QA gate before package generation.

## Product Contract

The mental model is:

> This is the approved winning creative. Generate final platform-ready formats from this exact piece.

The package flow must preserve:

- product/service identity
- offer
- CTA text
- visible copy
- brand cues
- core layout intent from the winner

The flow may reposition and resize elements so the creative feels native to each selected format.

## User Flow

1. User generates variations in a campaign.
2. User approves one derivation.
3. Approved derivation shows `Generate package`.
4. User opens the package modal.
5. Modal shows `1:1`, `4:5`, and `9:16` selected by default.
6. If the approved derivation already matches one format, that format appears as already ready and does not consume a new generation.
7. User may unselect formats.
8. User confirms.
9. App creates child derivations for selected formats that need generation.
10. Gallery shows package versions with normal queued/processing/completed/failed states.
11. User reviews, downloads, regenerates, or exports the package versions through existing gallery actions.

## UX Design

### Entry Point

Add the package action to approved derivations in the current gallery/card/preview surfaces.

The action should be hidden or disabled unless:

- derivation status is `approved`
- derivation has an `outputKey`
- no package generation is already in progress for the same source derivation

### Package Modal

The modal should be compact and operational:

- title: `Generate delivery package`
- short context: selected creative name/format if available
- three format rows: `1:1`, `4:5`, `9:16`
- all rows selected by default
- source format row marked as already ready and not queued for generation
- confirm button disabled when no generatable format is selected
- cancel button closes without side effects

Avoid long education copy. The UI should feel like a delivery action, not a new planning step.

### Gallery States

Package derivations should appear in the existing derivation gallery. The user should see normal status behavior:

- queued
- processing
- completed
- failed

If one format fails, the others remain usable. Regeneration should work on failed or weak package derivations through the existing regeneration path.

## Backend Design

Add a dedicated route:

```text
POST /api/derivations/[id]/delivery-package
```

Request body:

```json
{
  "formats": ["1:1", "4:5", "9:16"]
}
```

Validation:

- source derivation must exist in the current workspace
- source derivation should be `approved`
- source derivation must have `outputKey`
- `formats` must be a non-empty array
- `formats` can only contain `1:1`, `4:5`, `9:16`
- duplicate formats should be normalized away
- formats matching the source format should be returned as already ready, not queued
- if any package child is already queued/processing for the same source and format, do not create a duplicate

Created child derivations:

- `campaignId`: source campaign
- `workspaceId`: current workspace
- `planId`: source plan if present
- `parentId`: source derivation id
- `generationMode`: `format_adaptation`
- `variantIndex`: source variant index if present
- `ctaText`: source CTA text
- `format`: target format
- `status`: `queued`

The route should send one Inngest event per created child derivation.

Response shape:

```json
{
  "source": {
    "id": "derivation-id",
    "format": "1:1"
  },
  "readyFormats": ["1:1"],
  "queued": [
    {
      "id": "child-derivation-id",
      "format": "4:5"
    }
  ],
  "skipped": []
}
```

The exact response can follow existing API conventions, but it should let the UI update without guessing which formats were queued.

## Generation Design

The derivation job currently downloads a campaign asset as its visual reference. Package generation needs a more specific source.

When a derivation has:

- `generationMode === "format_adaptation"`
- `parentId`

the job should:

1. Load the parent derivation.
2. Verify the parent belongs to the same workspace and campaign.
3. Verify the parent has `outputKey`.
4. Download `parent.outputKey`.
5. Use that buffer as the reference image for `openai.images.edit()`.
6. Build a format-adaptation prompt that treats the parent output as the approved winner.
7. Normalize the result to final dimensions with existing `sharp` logic.
8. Save output and score as a normal derivation.

If the parent output is unavailable, fail the child derivation with a clear prompt/status message instead of silently falling back to the original campaign asset.

## Prompt Behavior

Reuse the existing `format_adaptation` mode but make the package source explicit when `parentId` is present.

The prompt should say:

- the input image is the approved winning creative
- preserve all visible copy, CTA, offer, product, brand cues, and visual identity
- only rearrange layout to fit the target format
- do not invent new copy, offers, products, or logos
- make the result feel native to the target format

The existing literal CTA contract still applies.

## Data Model

The first version can use existing derivation fields:

- `parentId` links package versions to the approved winner
- `generationMode = "format_adaptation"` identifies generated format variants
- `format` stores the target format
- `status`, `outputKey`, score fields, and review fields work as they do today

No new table is required for the first version.

If package-level grouping becomes necessary later, add a `deliveryPackageId` or package table after the workflow proves useful.

## Error Handling

- If the source derivation is missing, return `404`.
- If the source is not approved, return `400` or `409` with a concise error.
- If the source has no output image, return `400`.
- If no generatable formats remain after skipping the source format and duplicates, return a successful response with no queued derivations and clear `readyFormats`/`skipped` data.
- If Inngest send fails for one format, mark that child derivation as failed and continue reporting the rest.
- If generation fails for one package version, keep the other versions available.

## Testing Strategy

Unit/API tests:

- rejects invalid formats
- rejects source derivation without `outputKey`
- rejects non-approved source derivation
- deduplicates selected formats
- skips source format
- creates one child derivation per selected generatable format
- sends Inngest events with `generationMode: "format_adaptation"`
- does not duplicate queued/processing package child for same parent and format

Job tests:

- `format_adaptation` with `parentId` downloads `parent.outputKey`
- missing parent output fails clearly
- existing campaign-asset format adaptation still works
- prompt builder includes approved-winner language when package source is used

UI tests:

- `Generate package` appears for approved derivations
- modal shows all three formats selected by default
- source format is marked ready
- confirm is disabled when no generatable format is selected
- successful submit creates package request and refreshes derivations

Manual smoke:

1. Create or open an `art_variation` campaign.
2. Generate variations.
3. Approve one completed derivation.
4. Open `Generate package`.
5. Keep `1:1`, `4:5`, `9:16` selected.
6. Confirm.
7. Verify child package derivations appear in gallery.
8. Verify generated outputs use the approved winner as source, not the original campaign asset.
9. Verify download/export still works.

## Open Decisions

- Whether to allow package generation from `completed` but not approved derivations. Recommended first version: require `approved`.
- Whether to display package children with a visual grouping under the winner. Recommended first version: use existing gallery plus parent relationship; add grouping only if the gallery becomes confusing.
- Whether to add ZIP/package export. Recommended later version after package generation quality is proven.

## Acceptance Criteria

- Approved derivations can generate selected multi-format packages.
- `1:1`, `4:5`, and `9:16` are shown by default and can be unselected.
- The source format does not trigger unnecessary generation.
- Package outputs are child derivations of the approved winner.
- Package generation uses the approved output image as the `images.edit()` input.
- Existing format adaptation campaigns continue to work.
- Failed package versions do not block successful versions.
