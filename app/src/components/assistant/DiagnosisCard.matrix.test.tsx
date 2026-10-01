// The failed-diagnosis card against every combination of what it can be told (ticket 13, D-12): failure code × latest × disabled × language. The way to a
// person exists only for the credit case and only on the newest card; a disabled card cannot be clicked; a code the card does not know is the generic failure.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DiagnosisCard from "./DiagnosisCard";
import { parseEquipeCard } from "./EquipeCard";
import ptBR from "../../../messages/pt-BR.json";
import en from "../../../messages/en.json";
import type { EquipeCardPayload } from "@/server/repositories/assistant-types";

const mockRequestSupport = vi.fn();
vi.mock("@/lib/equipe/commands", () => ({ requestEquipeSupport: (...args: unknown[]) => mockRequestSupport(...args) }));
vi.mock("@/lib/equipe/use-equipe", () => ({ useEquipeAccountState: () => ({ data: undefined, isLoading: false }) }));
beforeEach(() => { vi.clearAllMocks(); mockRequestSupport.mockResolvedValue({}); });
afterEach(() => cleanup());

const CODES = ["budget_exceeded", "provider_error", "model_truncated", "diagnosis_invalid", "execution_blocked", "model_refused", "diagnosis_unavailable", "something_new", "BUDGET_EXCEEDED", "", undefined] as const;
const LOCALES = { "pt-BR": ptBR, en } as const;
const card = (code: string | undefined, suggestions: string[] = []): EquipeCardPayload =>
  ({ kind: "diagnosis", status: "failed", accountId: "acc-1", title: "Diagnóstico da marca", items: [], suggestions, ...(code !== undefined ? { failureCode: code } : {}) });

describe.each(["pt-BR", "en"] as const)("%s", (locale) => {
  const copy = LOCALES[locale].assistant.equipe.diagnosis;
  for (const code of CODES) for (const latest of [true, false]) for (const disabled of [false, true]) {
    it(`code ${JSON.stringify(code)}, latest=${latest}, disabled=${disabled}`, () => {
      render(
        <NextIntlClientProvider locale={locale} messages={LOCALES[locale]}>
          <QueryClientProvider client={new QueryClient()}><DiagnosisCard card={card(code)} threadId="t1" latest={latest} disabled={disabled} /></QueryClientProvider>
        </NextIntlClientProvider>,
      );
      const root = screen.getByTestId("equipe-diagnosis");
      const credit = code === "budget_exceeded";
      expect(root).toHaveTextContent(credit ? copy.budgetIntro : copy.failedIntro);
      expect(root).not.toHaveTextContent(credit ? copy.failedIntro : copy.budgetIntro);
      const button = screen.queryByRole("button", { name: copy.talkToPerson });
      if (credit && latest) {
        expect(button).toBeInTheDocument();
        if (disabled) { expect(button).toBeDisabled(); fireEvent.click(button!); expect(mockRequestSupport).not.toHaveBeenCalled(); }
        else { expect(button).toBeEnabled(); fireEvent.click(button!); expect(mockRequestSupport).toHaveBeenCalledWith("acc-1", { purpose: "plan" }); }
      } else {
        expect(button).not.toBeInTheDocument();
        expect(screen.queryByTestId("diagnosis-budget-exit")).not.toBeInTheDocument();
      }
      expect(root.textContent).not.toMatch(/budget_exceeded|undefined|\[object/);
    });
  }
});

describe("parseEquipeCard keeps the failure code", () => {
  it("for every shape of it: a text survives, anything else is dropped, and the card stays a diagnosis", () => {
    for (const code of CODES) {
      const parsed = parseEquipeCard(card(code) as never);
      expect(parsed?.kind).toBe("diagnosis");
      if (typeof code === "string") expect(parsed?.failureCode).toBe(code); else expect(parsed?.failureCode).toBeUndefined();
    }
    for (const bad of [42, null, {}, [], true]) expect(parseEquipeCard({ ...card("budget_exceeded"), failureCode: bad } as never)?.failureCode).toBeUndefined();
  });
});
