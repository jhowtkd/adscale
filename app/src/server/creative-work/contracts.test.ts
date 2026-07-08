import { describe, expect, it } from "vitest";
import { createCreativeWorkSchema, resolveCreativeWorkStatus } from "./contracts";

describe("creative work contracts", () => {
  it("accepts a social post brief with one supported format", () => {
    expect(
      createCreativeWorkSchema.parse({
        clientProfileId: "00000000-0000-4000-8000-000000000001",
        toolKind: "social_post",
        format: "4:5",
        brief: {
          theme: "Novo produto",
          objective: "Gerar interesse",
          audience: "Empreendedores digitais",
          offer: "Teste gratuito",
        },
      }).format,
    ).toBe("4:5");
  });

  it("resolves partial when at least one output failed and one completed", () => {
    expect(resolveCreativeWorkStatus(["completed", "failed", "completed"])).toBe("partial");
  });

  it("resolves completed only when all three outputs completed", () => {
    expect(resolveCreativeWorkStatus(["completed", "completed", "completed"])).toBe("completed");
  });
});