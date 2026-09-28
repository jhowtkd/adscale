import { describe, expect, it } from "vitest";
import { isTestDatabaseUrl, resolveEquipeTestDatabaseUrl } from "./test-database";

// Sem banco: cobre só a resolução da URL (qual env vence, quando pula).
describe("resolveEquipeTestDatabaseUrl", () => {
  const LOCAL = "postgres://test:test@localhost:5433/adscale_test";
  const CI = "postgres://test:test@localhost:5432/adscale_test";

  it("usa TEST_DATABASE_URL quando definida (precedência local)", () => {
    expect(resolveEquipeTestDatabaseUrl({ TEST_DATABASE_URL: LOCAL, DATABASE_URL: CI })).toBe(
      LOCAL
    );
  });

  it("usa DATABASE_URL do CI quando termina com _test e não há explícita", () => {
    expect(resolveEquipeTestDatabaseUrl({ DATABASE_URL: CI })).toBe(CI);
  });

  it("pula quando DATABASE_URL não termina com _test", () => {
    expect(
      resolveEquipeTestDatabaseUrl({
        DATABASE_URL: "postgres://test:test@localhost:5432/adscale",
      })
    ).toBeNull();
  });

  it("pula quando nenhum env está definido", () => {
    expect(resolveEquipeTestDatabaseUrl({})).toBeNull();
  });

  it("nunca executa contra TEST_DATABASE_URL fora do padrão _test", () => {
    expect(
      resolveEquipeTestDatabaseUrl({
        TEST_DATABASE_URL: "postgres://test:test@localhost:5433/adscale",
        DATABASE_URL: CI,
      })
    ).toBeNull();
  });

  it("rejeita URL inválida e string vazia como ausente", () => {
    expect(isTestDatabaseUrl("não-é-url")).toBe(false);
    expect(resolveEquipeTestDatabaseUrl({ DATABASE_URL: "" })).toBeNull();
    expect(resolveEquipeTestDatabaseUrl({ TEST_DATABASE_URL: "", DATABASE_URL: CI })).toBe(CI);
  });
});
