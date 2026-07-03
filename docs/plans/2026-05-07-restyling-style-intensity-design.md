# Restyling Style Intensity - Design

## Context

ADScale already has a Restyling quick tool. The current restyling flow creates a normal campaign behind the scenes, stores the base image and style reference, analyzes the base image as content, analyzes the reference image as visual style, and generates a fresh ad through the restyling pipeline.

The missing control is how strongly the style reference should influence the final image. Today the prompt has one default behavior, so users cannot choose between a subtle restyle and a more expressive style transfer.

## Goal

Add a simple intensity control to Restyling so users can choose how much of the reference image's visual language should affect the generated ad.

The control should change style strength only. It must not change CTA, offer, target content, generation mode, or factual campaign details.

## Product Behavior

Restyling gets three levels:

- `soft`: apply palette, texture, and mood lightly while keeping the result close to the base ad.
- `medium`: balance the base ad with the reference's palette, typography, treatment, visual rhythm, and composition. This is the default.
- `strong`: apply the reference's visual language more strongly, allowing more noticeable changes in typography, texture, composition, and energy.

The user-facing labels are:

- Suave
- Médio
- Forte

The first version uses three levels rather than a slider. This keeps the quick tool fast and avoids implying precision the model cannot guarantee.

## Non-Goals

- Do not replace `creativeLevel`.
- Do not add a separate advanced settings screen.
- Do not block generation based on intensity.
- Do not allow style reference content to become campaign content.
- Do not let intensity modify CTA, offer, format, or generation mode.

## Data Model

Add a persisted campaign field:

```txt
styleIntensity: soft | medium | strong
```

Default:

```txt
medium
```

The field is relevant primarily when `generationMode = restyling`, but it can safely default on all campaigns to keep schema and repository handling simple.

## API and Data Flow

The Restyling quick tool accepts `styleIntensity` in the multipart request.

Flow:

1. User opens `RestylingModal`.
2. Modal defaults intensity to `medium`.
3. User selects `soft`, `medium`, or `strong`.
4. Quick tool API validates the value.
5. Campaign is created with `generationMode = restyling` and the selected `styleIntensity`.
6. Derivation job loads the campaign.
7. Restyling prompt builder receives `styleIntensity`.
8. Image generation uses the corresponding intensity instruction.

If the value is missing, use `medium`. If the value is invalid at an API boundary, reject the request. If a lower-level helper receives an invalid value defensively, normalize to `medium`.

## UI Design

Add a compact segmented control in `RestylingForm`.

Label:

```txt
Intensidade do estilo
```

Options:

- `Suave`
- `Médio`
- `Forte`

Helper text changes by selected value:

- Suave: `Aplica cores, textura e clima sem afastar muito da peça base.`
- Médio: `Equilibra a peça base com tipografia, tratamento e ritmo da referência.`
- Forte: `Puxa mais a linguagem visual da referência sem copiar seu conteúdo.`

Place the control near the style image input, because it describes how the style reference should be used.

## Prompt Behavior

<!-- VERIFY: `buildRestylingPrompt` receives `styleIntensity`. — no definition found; restyling prompt logic lives in prompt-builder.ts (see verification in .planning/tmp/) -->

Prompt additions:

- `soft`: use the style reference lightly; prioritize the base content and layout; borrow mainly palette, subtle texture, and mood.
- `medium`: balance base content with reference style; apply palette, typography, photo treatment, rhythm, and moderate composition influence.
- `strong`: apply the reference visual language with high presence; allow stronger typography, texture, composition, and energy shifts.

Fixed rules stay unchanged:

- do not copy content from the style reference
- do not import text, brand, product, person, or factual claims from the style reference
- preserve base/campaign content, CTA, offer, and brand intent
- respect the target output format
- generate a fresh ad, not a collage or pasted overlay

## Error Handling

- Missing intensity defaults to `medium`.
- Invalid API input returns a controlled validation error.
- Invalid lower-level prompt input falls back to `medium`.
- Restyling generation fallback behavior remains unchanged if vision analysis fails.

## Testing Strategy

Unit tests:

- prompt builder includes the `soft` intensity instruction
- prompt builder includes the `medium` intensity instruction
- prompt builder includes the `strong` intensity instruction
- prompt builder defaults invalid or missing intensity to `medium`

API/repository tests:

- quick tool accepts `styleIntensity`
- quick tool defaults missing value to `medium`
- invalid value is rejected
- campaign create/update stores and returns `styleIntensity`

Job tests:

- restyling generation passes campaign `styleIntensity` into `buildRestylingPrompt`

UI tests:

- modal renders the intensity control
- default selected level is `medium`
- selecting another level sends it in the quick tool request

## Acceptance Criteria

- User can choose Suave, Médio, or Forte in the Restyling quick tool.
- Médio is selected by default.
- The selected value is saved on the created campaign.
- The restyling job passes the value to the prompt builder.
- The prompt meaningfully changes between soft, medium, and strong.
- The style reference remains style-only and never becomes copied content.
- CTA, offer, base content, target format, and generation mode contracts remain preserved.
