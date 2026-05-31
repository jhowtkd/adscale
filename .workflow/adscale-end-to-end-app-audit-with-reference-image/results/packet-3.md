# Packet 3: Findings synthesis

## Accepted findings
- Build passes, and the targeted restyling tests pass.
- The app does expose the main user-facing flows needed for a full creative workflow.
- The dashboard, restyling page, and campaign creation page are all reachable and coherent.

## Rejected findings
- No blocking runtime crash was observed in the live browser snapshots.
- The Next.js build completed successfully, so there is no build-time route/module failure at the moment.

## Final issues to report
1. Light-theme contrast on primary CTA and account controls is too low.
2. The restyling upload card is not keyboard accessible and the remove icon button lacks an accessible label.
3. The restyling image preview uses `URL.createObjectURL(...)` inline, which can leak object URLs if the user changes files repeatedly.
4. The `+ Nova Campanha` and account avatar affordances feel visually small and under-communicated for frequent navigation.
5. The full restyling submit flow reaches `Carregando...` after both uploads, but does not resolve to success or error in the live browser test.

## Improvements identified
- A reusable restyling smoke path is now clear: dashboard quick action -> restyling page -> two uploads -> metadata -> submit.
- The campaign creation modal is already well structured and could absorb the same reference-image workflow with minimal friction.
- The app would benefit from a small accessibility pass focused on icon buttons, upload affordances, and contrast in the light theme.
- The submit step needs an explicit end state so the live browser round-trip can complete instead of stalling.
