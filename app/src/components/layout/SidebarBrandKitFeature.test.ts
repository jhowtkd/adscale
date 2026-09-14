import { describe, expect, it } from "vitest";
import type { BrandTrainingStatus } from "@/lib/hooks/use-brand-training";
import ptBR from "../../../messages/pt-BR.json";
import en from "../../../messages/en.json";
import { brandStatusKey, brandKitSidebarStatus } from "./SidebarBrandKitFeature";

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
    expect(brandStatusKey(null, undefined, true)).toBe("brandKitStatusSetup");
    expect(brandStatusKey("brand-1", training({}))).toBe("brandKitStatusSetup");
    expect(brandStatusKey("brand-1", training({ trained: true }))).toBe("brandKitStatusReady");
    expect(brandStatusKey("brand-1", training({ needsReview: true }))).toBe("brandKitStatusReview");
  });

  it("does not keep Consultando while brand training is still fetching", () => {
    expect(brandKitSidebarStatus({
      profilesLoading: false,
      profilesError: false,
      trainingError: false,
      activeClientProfileId: "brand-1",
      training: undefined,
    })).toBe("brandKitStatusSetup");
    expect(brandKitSidebarStatus({
      profilesLoading: true,
      profilesError: false,
      trainingError: false,
      activeClientProfileId: null,
    })).toBe("loading");
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
      cortex: ptBR.navigation.cortexLabel,
      noWorksMatch: ptBR.common.noWorksMatch,
      noWorksYet: ptBR.common.noWorksYet,
      errorLoadingWorks: ptBR.common.errorLoadingWorks,
      unavailable: ptBR.navigation.brandKitStatusUnavailable,
    }).toEqual({
      home: "Estúdio",
      works: "Trabalhos",
      overview: "Visão geral",
      brand: "Marca",
      states: ["Não configurada", "Incompleta", "Pronta", "Precisa de revisão"],
      cortex: "CORTEX",
      noWorksMatch: "Nenhum trabalho corresponde à sua busca",
      noWorksYet: "Nenhum trabalho ainda",
      errorLoadingWorks: "Erro ao carregar trabalhos",
      unavailable: "Estado indisponível",
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
      cortex: en.navigation.cortexLabel,
      noWorksMatch: en.common.noWorksMatch,
      noWorksYet: en.common.noWorksYet,
      errorLoadingWorks: en.common.errorLoadingWorks,
      unavailable: en.navigation.brandKitStatusUnavailable,
    }).toEqual({
      home: "Studio",
      works: "Works",
      overview: "Overview",
      brand: "Brand",
      states: ["Not configured", "Incomplete", "Ready", "Needs review"],
      cortex: "CORTEX",
      noWorksMatch: "No work matches your search",
      noWorksYet: "No work yet",
      errorLoadingWorks: "Error loading work",
      unavailable: "Status unavailable",
    });
  });
});
