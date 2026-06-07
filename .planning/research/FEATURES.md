# Research: Feature Behavior for v11.7.1 Stabilization

## Table Stakes

- Production build must remain a release gate.
- Runtime API validation must not rely on TypeScript casts for user-submitted data.
- Persistence for cached/projection tables should be conflict-safe when recalculated on read.
- Mission/progression CTAs should resume the user into the promised workflow context.
- UAT evidence should prove the path beta users will actually follow.

## Differentiators

- Keep stabilization narrow enough to ship before beta rather than expanding gamification.
- Treat CTA resume behavior as part of the activation experience, not polish.
- Include owner triage and credit-signal checks in UAT because the milestone goal includes insight capture and healthy credit consumption.

## Anti-Features

- Do not disable type checks to ship.
- Do not add another navigation surface if campaign workspace can consume a simple resume target.
- Do not add monetization mechanics before the existing credit-aware mission path is verified.
