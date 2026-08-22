import { describe, expect, it } from "vitest";
import { buildDashboardV6Greeting } from "./build-dashboard-v6-labels";
import ptBR from "../../../../messages/pt-BR.json";
import en from "../../../../messages/en.json";

const t = (key: string, values?: { firstName?: string }) =>
  values?.firstName ? `${key}:${values.firstName}` : key;

describe("buildDashboardV6Greeting", () => {
  it("names the managerial surface and featured work canonically", () => {
    expect(ptBR.navigation.dashboard).toBe("Visão geral");
    expect(ptBR.dashboard.v6.heroProduction).toBe("Trabalho em destaque");
    expect(en.navigation.dashboard).toBe("Overview");
    expect(en.dashboard.v6.heroProduction).toBe("Featured work");
  });

  it.each(["", "User", " user "])("uses the nameless greeting for %j", (firstName) => {
    expect(buildDashboardV6Greeting(t as never, firstName, 9)).toBe("greetingNoName");
  });

  it("greets a named user", () => {
    expect(buildDashboardV6Greeting(t as never, "Ana", 9)).toBe("greetingMorning:Ana");
  });
});
