# Testing Guide

This document covers the testing strategy, configuration, and patterns for the ADScale application.

## Testing Stack

| Tool | Purpose |
|------|---------|
| **Vitest** | Test runner and framework |
| **jsdom** | Browser-like DOM environment for component tests |
| **@testing-library/react** | React component rendering and interaction utilities |
| **@testing-library/jest-dom** | Custom DOM matchers (`toBeInTheDocument`, `toHaveAttribute`, etc.) |
| **@vitejs/plugin-react** | Fast Refresh and JSX transform during tests |

### Why Vitest over Jest?

- Native ESM support (no `transformIgnorePatterns` hacks)
- Fast cold start and watch mode via Vite
- Compatible `vi` API that mirrors Jest's `jest` object
- Built-in mocking, spying, and module resolution

---

## Configuration

### Vitest Config

**File:** `app/config/vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../src"),
    },
  },
});
```

Key settings:
- `environment: "jsdom"` — provides `window`, `document`, and DOM APIs
- `globals: true` — exposes `describe`, `it`, `expect`, `vi` globally (no per-file imports required, though explicit imports are still used)
- `setupFiles` — runs `app/tests/setup.ts` before every test file

### Test Setup File

**File:** `app/tests/setup.ts`

```ts
import "@testing-library/jest-dom";
```

This registers jest-dom matchers like `toBeInTheDocument()`, `toHaveClass()`, and `toBeDisabled()`.

---

## How to Run Tests

All commands should be run from the `app/` directory.

### Run all tests once (CI mode)

```bash
cd app && npm test
# or explicitly:
npx vitest run --config config/vitest.config.ts --passWithNoTests
```

### Watch mode (development)

```bash
cd app && npx vitest --config config/vitest.config.ts
```

### Run a single test file

```bash
npx vitest run --config config/vitest.config.ts tests/unit/schemas.test.ts
```

### Run tests matching a pattern

```bash
npx vitest run --config config/vitest.config.ts -t "campaign creation"
```

### Generate coverage report

```bash
npx vitest run --config config/vitest.config.ts --coverage
```

> Note: `@vitest/coverage-v8` must be installed for coverage reports.

---

## Test Directory Structure

```
app/tests/
├── setup.ts                          # Global test setup (jest-dom)
├── SECURITY_SCAN_NOTE.md             # Security audit reference
├── unit/
│   ├── schemas.test.ts               # Zod schema validation
│   ├── env-validation.test.ts        # Environment variable schemas
│   ├── prompt-builder.test.ts        # AI prompt generation logic
│   ├── prompt-parser.test.ts         # Prompt parsing utilities
│   ├── briefing-doctor.test.ts       # Briefing analysis logic
│   ├── briefing-doctor-ui.test.tsx   # BriefingDoctor React component
│   ├── restyling-modal.test.tsx      # RestylingModal React component
│   ├── creative-diagnosis.test.ts    # Creative diagnosis logic
│   ├── creative-score.test.ts        # Heuristic scoring logic
│   ├── billing-schema.test.ts        # Billing/Stripe schema tests
│   ├── r2-*.test.ts                  # R2 storage utility tests
│   ├── ai/
│   │   ├── image-analysis.test.ts    # Placeholder for image analysis
│   │   └── creative-score.test.ts    # AI creative scoring
│   └── repositories/
│       ├── campaign.test.ts          # Campaign repository (unit)
│       ├── asset.test.ts             # Asset repository
│       └── derivation.test.ts        # Derivation repository
└── integration/
    ├── campaign-crud.test.ts         # Campaign CRUD + workspace isolation
    ├── auth-workspace-access.test.ts # Auth + workspace middleware
    ├── signup-workspace.test.ts      # Signup workspace creation flow
    ├── upload-flow.test.ts           # Upload validation schemas
    ├── upload-size-header.test.ts    # Upload size constraints
    ├── derivation-job.test.ts        # Derivation job orchestration
    ├── plan-generation.test.ts       # Plan generation flow
    ├── briefing-doctor.test.ts       # Briefing Doctor API route
    ├── restyling.test.ts             # Restyling API flow
    ├── quick-tools-restyling.test.ts # Quick tools restyling
    ├── review-export.test.ts         # Review + export flow
    ├── asset-complete-cleanup.test.ts# Asset completion + cleanup
    ├── asset-listing-signed-url.test.ts    # Signed URL generation
    └── derivation-listing-signed-url.test.ts
```

### Unit vs Integration Split

| Type | Location | Focus | External deps |
|------|----------|-------|---------------|
| **Unit** | `tests/unit/` | Pure functions, components, repositories in isolation | Heavy mocking (DB, AI, storage) |
| **Integration** | `tests/integration/` | API routes, multi-module workflows, auth guards | Partial mocking; tests module interaction |

---

## Unit Test Patterns

### 1. Pure Function Tests

No mocking needed. Test inputs and outputs directly.

```ts
// tests/unit/prompt-builder.test.ts
import { describe, it, expect } from "vitest";
import { buildDerivationPrompt } from "@/server/ai/prompt-builder";

describe("buildDerivationPrompt", () => {
  it("art_variation + conservative contains CREATIVITY LEVEL: conservative", () => {
    const prompt = buildDerivationPrompt({
      generationMode: "art_variation",
      creativeLevel: "conservative",
    });
    expect(prompt).toContain("CREATIVITY LEVEL: conservative");
  });
});
```

### 2. Zod Schema Tests

Validate that schemas accept/reject expected shapes.

```ts
// tests/unit/schemas.test.ts
import { describe, it, expect } from "vitest";
import { z } from "zod";

const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  client: z.string().optional(),
});

describe("campaign creation schema", () => {
  it("accepts valid campaign input", () => {
    const result = createCampaignSchema.safeParse({
      name: "Summer Sale",
      client: "Acme",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createCampaignSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});
```

### 3. React Component Tests

Render components, query the DOM, and simulate user interactions.

```tsx
// tests/unit/restyling-modal.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RestylingModal from "@/components/workspace/RestylingModal";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("RestylingModal", () => {
  it("renders style intensity control with medium selected by default", () => {
    render(<RestylingModal open onOpenChange={vi.fn()} />);
    expect(screen.getByText("styleIntensityLabel")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "styleIntensity.medium" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("allows selecting different style intensity", () => {
    render(<RestylingModal open onOpenChange={vi.fn()} />);
    const strongButton = screen.getByRole("button", { name: "styleIntensity.strong" });
    fireEvent.click(strongButton);
    expect(strongButton).toHaveAttribute("aria-pressed", "true");
  });
});
```

### 4. Repository Unit Tests

Mock the Drizzle ORM `db` object and assert on query construction.

```ts
// tests/unit/repositories/campaign.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { db } from "@/server/db";
import { createCampaign } from "@/server/repositories/campaign";

describe("campaign repository", () => {
  it("createCampaign inserts with workspaceId", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "camp-1" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const result = await createCampaign("ws-123", { name: "Test Campaign" });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-123", name: "Test Campaign" })
    );
    expect(result).toEqual({ id: "camp-1" });
  });
});
```

---

## Integration Test Patterns

Integration tests verify API routes and multi-step workflows by importing route handlers directly and invoking them with `Request` objects.

### API Route Testing

```ts
// tests/integration/briefing-doctor.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    workspace: { id: "workspace-1" },
  }),
}));

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: class MockOpenAI {
    responses = { create: mockCreate };
  },
}));

import { POST } from "@/app/api/briefing-doctor/analyze/route";

describe("POST /api/briefing-doctor/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns structured analysis from AI response", async () => {
    mockCreate.mockResolvedValue({
      output_text: JSON.stringify({ overallScore: 82, /* ... */ }),
    });

    const request = new Request("http://localhost/api/briefing-doctor/analyze", {
      method: "POST",
      body: JSON.stringify({ briefing: { /* ... */ } }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.analysis.overallScore).toBe(82);
  });
});
```

### Multi-Module Workflow Tests

Tests that span repositories, job queues, and storage:

```ts
// tests/integration/derivation-job.test.ts
vi.mock("@/server/jobs/client", () => ({
  inngest: {
    send: vi.fn().mockResolvedValue(undefined),
    createFunction: vi.fn().mockReturnValue({}),
  },
}));

import { inngest } from "@/server/jobs/client";
import { createDerivation } from "@/server/repositories/derivation";

it("derivation creation emits Inngest event", async () => {
  // ... mock db.insert ...
  const derivation = await createDerivation({ campaignId, workspaceId, status: "queued" });

  await inngest.send({
    name: "derivation.generate",
    data: { derivationId: derivation.id, campaignId, workspaceId },
  });

  expect(inngest.send).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "derivation.generate",
      data: expect.objectContaining({ derivationId: "deriv-1" }),
    })
  );
});
```

---

## Mocking Patterns

### Module-Level Mocks with `vi.mock()`

Place `vi.mock()` calls **before** imports. Vitest hoists them to the top of the file.

```ts
vi.mock("@/server/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { db } from "@/server/db"; // Must come AFTER vi.mock
```

### Mocking External Libraries

#### OpenAI

```ts
vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: vi.fn() } };
    images = { generate: vi.fn(), edit: vi.fn() };
    responses = { create: vi.fn() };
  },
  toFile: vi.fn(),
}));
```

#### Framer Motion

Simplify motion components to plain HTML elements to avoid animation overhead in tests:

```ts
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
    form: ({ children, ...props }) => <form {...props}>{children}</form>,
  },
}));
```

#### next-intl

```ts
// For components
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// For server routes
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
```

#### next/navigation

```ts
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
```

### Mocking Custom Hooks

```ts
const mockMutate = vi.fn();
const mockUseMutation = vi.fn();

vi.mock("@/lib/hooks/use-briefing-doctor", () => ({
  useBriefingDoctorAnalysis: () => mockUseMutation(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseMutation.mockReturnValue({
    mutate: mockMutate,
    data: undefined,
    isPending: false,
    isError: false,
  });
});
```

### Mocking Return Values per Test

Drizzle ORM uses a fluent API. Mock the chain method-by-method:

```ts
// Insert pattern
const mockReturning = vi.fn().mockResolvedValue([{ id: "camp-1" }]);
const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
(db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

// Select pattern
const mockLimit = vi.fn().mockResolvedValue([]);
const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
(db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

// Update pattern
const mockReturning = vi.fn().mockResolvedValue([{ id: "camp-1" }]);
const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
(db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });
```

### Resetting Mocks

Always reset mocks in `beforeEach` to prevent test leakage:

```ts
beforeEach(() => {
  vi.clearAllMocks();
});
```

---

## Test Utilities and Helpers

### Render Helpers

For components with repeated props, create a render helper:

```tsx
function renderBriefingStep(props = {}) {
  return render(
    <BriefingStep
      campaign={null}
      onContinue={vi.fn()}
      onSaveDraft={vi.fn()}
      {...props}
    />
  );
}
```

### Reusable Mock Factories

Extract mock data into constants:

```ts
const validPayload = {
  briefing: {
    name: "Summer Sale",
    client: "Acme",
    objective: "Drive purchases",
    // ...
  },
};
```

### Type Assertions for Mocked Functions

When mocking modules, cast mocked functions for TypeScript safety:

```ts
const mockGetSession = getSession as ReturnType<typeof vi.fn>;
const mockGetWorkspaceForUser = getWorkspaceForUser as ReturnType<typeof vi.fn>;
```

---

## How to Write New Tests

### Adding a Unit Test

1. Create a file in `tests/unit/` matching the module under test:
   - `src/lib/utils.ts` → `tests/unit/utils.test.ts`
   - `src/components/Button.tsx` → `tests/unit/button.test.tsx`

2. Import the function/component under test.

3. Mock external dependencies with `vi.mock()` (before other imports).

4. Write `describe` blocks grouping by behavior, `it` blocks for specific assertions.

5. Use `beforeEach` to reset state between tests.

### Adding an Integration Test

1. Create a file in `tests/integration/` describing the workflow.

2. Mock auth middleware (`requireWorkspaceAccess`) to skip real sessions.

3. Mock external services (OpenAI, R2, Stripe, Inngest).

4. Import API route handlers directly and invoke with `new Request(...)`.

5. Assert on response status, body, and side effects (DB calls, event emissions).

### Test Naming Conventions

- **Describe blocks:** Module or feature name (`describe("campaign repository")`)
- **It blocks:** Complete sentence describing behavior (`it("rejects empty name")`)
- **File names:** kebab-case matching the source file (`briefing-doctor-ui.test.tsx`)

---

## Common Testing Issues

### `vi.mock` hoisting surprises

`vi.mock` is hoisted to the top of the file. Any variables used inside the factory must also be hoisted with `vi.hoisted()`:

```ts
const mockCreate = vi.hoisted(() => vi.fn()); // ✅
vi.mock("openai", () => ({
  default: class MockOpenAI {
    responses = { create: mockCreate };
  },
}));
```

### React 19 + Testing Library compatibility

The project uses React 19.2.4 with `@testing-library/react` 16.x. If you encounter render warnings, ensure you're using the latest compatible versions of Testing Library packages.

### Drizzle chain mocking order

Drizzle's query builder is chainable. Mock each link in the chain in **reverse** order of the real call:

```ts
// Real code: db.insert(table).values({}).returning()
// Mock from the inside out:
const mockReturning = vi.fn().mockResolvedValue([{ id: 1 }]);
const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
db.insert.mockReturnValue({ values: mockValues });
```

### Multiple `db.select` calls in one function

When a function calls `db.select` more than once, use `mockReturnValueOnce` in reverse order:

```ts
(db.select as ReturnType<typeof vi.fn>)
  .mockReturnValueOnce({ from: mockMetricsFrom })  // Second select in code
  .mockReturnValueOnce({ from: mockCampaignFrom }); // First select in code
```

### `Request` and `Headers` in jsdom

jsdom does not implement the full `Request` constructor used by Next.js edge routes. For API route tests that use `Request`, the standard Web API `Request` class is usually sufficient because Vitest's jsdom environment includes basic fetch globals.

### Placeholder tests

Some AI-related test files contain placeholder tests until stable implementations are ready:

```ts
describe("analyzeImageContent placeholder", () => {
  it("exists as a placeholder until real tests are added", () => {
    expect(true).toBe(true);
  });
});
```

These are kept to maintain file structure and are skipped by `--passWithNoTests`.

---

## CI / Testing Best Practices

### Pre-commit Checklist

Before committing, run:

```bash
cd app && npm test
```

The test suite currently covers:
- Schema validation (Zod)
- Repository query construction (Drizzle mocks)
- Auth middleware and workspace isolation
- API route handlers (status codes, response shapes)
- React component rendering and interaction
- AI prompt building logic
- Storage key formatting and sanitization
- Upload validation (file types, size limits)
- Billing schema validation

### Test Coverage Goals

| Layer | Target | Notes |
|-------|--------|-------|
| Schema validation | High | Cheap, fast, prevents invalid data |
| Repository queries | High | Mock DB, assert query construction |
| API routes | Medium-High | Test happy path + common error cases |
| React components | Medium | Focus on interaction, not snapshots |
| AI prompt builders | Medium | Test prompt content, not API calls |
| External integrations | Low | Mock OpenAI, R2, Stripe, Inngest |

### What NOT to Test

- Do not test Next.js framework internals
- Do not test third-party library behavior (test your usage, not the library)
- Do not make real network calls or database connections in unit tests
- Do not test CSS pixel-perfect rendering

### Keeping Tests Fast

- Prefer unit tests over integration tests for edge cases
- Mock heavy dependencies (Framer Motion, charts, maps)
- Use `vi.clearAllMocks()` instead of re-importing modules
- Avoid `setTimeout`/`waitFor` loops when synchronous assertions suffice

### Test File Organization

- One `describe` per major function or component
- Group related tests with nested `describe` blocks
- Place mocks at the top of the file
- Keep setup logic in `beforeEach` / `afterEach`

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `Cannot find module '@/'` | Missing Vitest alias config | Ensure `config/vitest.config.ts` resolves `@` to `src/` |
| `expect(...).toBeInTheDocument is not a function` | jest-dom not loaded | Check `tests/setup.ts` imports `@testing-library/jest-dom` |
| Mock not applied | Import before `vi.mock` | Move `vi.mock` to top of file, imports after |
| `TypeError: db.insert is not a function` | Missing mock chain | Mock the full Drizzle chain: `insert` → `values` → `returning` |
| React act warnings | State update after unmount | Use `cleanup` from `@testing-library/react` or await async operations |
| Test timeouts | Real async operations | Ensure all promises are mocked and awaited |

---

## Coverage Requirements

No coverage threshold is currently configured in `vitest.config.ts` or `package.json`.

You can generate a coverage report locally using:

```bash
npx vitest run --config config/vitest.config.ts --coverage
```

> Note: `@vitest/coverage-v8` must be installed for coverage reports.

---

## CI Integration

Tests run in GitHub Actions via the **CI** workflow (`.github/workflows/ci.yml`).

**Triggers:**
- Push to `main`
- Pull requests targeting `main`

**Test job steps:**

| Step | Command |
|------|---------|
| Install dependencies | `cd app && npm ci` |
| Run lint | `cd app && npm run lint` |
| Run typecheck | `cd app && npm run typecheck` |
| Run migrations | `cd app && npx drizzle-kit migrate` |
| Run tests | `cd app && npm test -- --run` |
| Run build | `cd app && npm run build` |

The job runs on `ubuntu-latest` with a PostgreSQL 16 service container. The test database is provisioned from migrations using `DATABASE_URL=postgres://test:test@localhost:5432/adscale_test`.

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture and module boundaries
- [CONFIGURATION.md](./CONFIGURATION.md) — Environment variables and service configuration
- [Vitest Docs](https://vitest.dev/)
- [Testing Library Docs](https://testing-library.com/docs/react-testing-library/intro/)
