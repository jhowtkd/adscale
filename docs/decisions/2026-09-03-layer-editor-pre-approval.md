# Layer Editor before approval

Accepted 2026-09-03. This decision partially supersedes
`docs/decisions/2026-08-21-native-layer-editor-access.md` and the
2026-08-21 native Layer Editor spec: Layerize and the Layer Editor no
longer require a selected (approved) Peça.

A workspace member with an active `layer_editor_v1` entitlement may
decompose and edit any completed creative-work output that has an
`outputKey`. Entitlement and monthly quota still gate every Layerize
and regeneration unit. Seedream Layerize remains a fail-closed
post-processing provider, never an image-generation route. Diagnostic
ZIP remains owner/ops-only.

Publication is unchanged: the editor creates a completed child with
`isSelected = false`. Approving that child uses the existing selection
flow.

Selecting another Peça is no longer blocked while a Layerize attempt is
queued or pre-submit. A running decomposition stays attached to its
source output even if the operator later approves a different proposal.
