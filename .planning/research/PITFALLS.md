# Research: Pitfalls for v11.7.1 Stabilization

## Common Pitfalls

- Treating TypeScript casts as runtime validation for API payloads.
- Fixing `next build` by suppressing type errors instead of updating exhaustive maps.
- Leaving first-load projection upserts as select-then-insert when the route can be requested concurrently.
- Adding query parameters to CTAs without wiring the destination page to consume them.
- Declaring beta readiness before migration and UAT evidence are complete.

## Prevention Strategy

- Keep `npm run build` as a hard acceptance gate.
- Add negative tests for invalid mission insight payloads.
- Add concurrency or conflict-path coverage for progression snapshot persistence.
- Validate mission resume behavior manually or with focused component/hook tests.
- Record migration and UAT evidence in the phase 74 artifacts before completing the milestone.
