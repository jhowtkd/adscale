import { describe, expect, it } from "vitest";
import type { BrandTrainingStatus } from "@/lib/hooks/use-brand-training";
import ptBR from "../../../messages/pt-BR.json";
import en from "../../../messages/en.json";
import { brandStatusKey } from "./SidebarBrandKitFeature";

const training = (overrides: Partial<BrandTrainingStatus>): BrandTrainingStatus => ({
  profile: { id: "brand-1", name: "Acme" },
  trained: false,
  missing: ["logo"],
  needsReview: false,
  voice: { configured: false, reviewStatus: null },
  ...overrides,
});

describe("brandStatusKey", () => {
  it("maps the available data to the four Brand states", () => {
    expect(brandStatusKey(null)).toBe("brandKitStatusSelect");
    expect(brandStatusKey("brand-1", training({}))).toBe("brandKitStatusSetup");
    expect(brandStatusKey("brand-1", training({ trained: true }))).toBe("brandKitStatusReady");
    expect(brandStatusKey("brand-1", training({ needsReview: true }))).toBe("brandKitStatusReview");
  });

  it("keeps canonical navigation and Brand states aligned in PT and EN", () => {
    expect({
      home: ptBR.navigation.home,
      works: ptBR.navigation.works,
      overview: ptBR.navigation.dashboard,
      brand: ptBR.navigation.brandKit,
      states: [
        ptBR.navigation.brandKitStatusSelect,
        ptBR.navigation.brandKitStatusSetup,
        ptBR.navigation.brandKitStatusReady,
        ptBR.navigation.brandKitStatusReview,
      ],
    }).toEqual({
      home: "Início",
      works: "Trabalhos",
      overview: "Visão geral",
      brand: "Marca",
      states: ["Não configurada", "Incompleta", "Pronta", "Precisa de revisão"],
    });
    expect({
      home: en.navigation.home,
      works: en.navigation.works,
      overview: en.navigation.dashboard,
      brand: en.navigation.brandKit,
      states: [
        en.navigation.brandKitStatusSelect,
        en.navigation.brandKitStatusSetup,
        en.navigation.brandKitStatusReady,
        en.navigation.brandKitStatusReview,
      ],
    }).toEqual({
      home: "Home",
      works: "Works",
      overview: "Overview",
      brand: "Brand",
      states: ["Not configured", "Incomplete", "Ready", "Needs review"],
    });
  });
});
