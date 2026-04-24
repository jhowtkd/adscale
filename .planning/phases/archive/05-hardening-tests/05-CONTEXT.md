# Phase 5: Hardening, Security & Tests

**Gathered:** 2026-04-24
**Status:** Ready for planning
**Mode:** Auto-generated

<domain>
## Phase Boundary

Lock down security, fill test coverage, and ensure the MVP passes all quality gates.
</domain>

<decisions>
## Implementation Decisions

### Security
- Every API route validates workspace membership before any DB query
- No ID can access data from another workspace
- Input validation on all boundaries

### Tests
- Unit: env validation, Zod schemas, repositories (mocked), prompt parser, R2 key sanitization
- Integration with mocks: signup→workspace, campaign CRUD, upload, plan, derivation job, review/export
- Config: `app/config/vitest.config.ts`
- Tests in `app/tests/`

### Quality Gates
- `npm test` passes
- `npm run lint` passes
- `npm run build` passes
- `npx @Codex-flow/cli@latest security scan` passes

</decisions>

<code_context>
## Existing Code Insights

- All prior phases complete
- Full codebase available for security audit
- Vitest already in devDependencies
</code_context>

<specifics>
## Specific Ideas

- Create `app/tests/` structure
- Mock R2, OpenAI, Inngest for integration tests
- Security scan with Codex-flow CLI
</specifics>
