import { describe, expect, it } from "vitest";

import {
  getPlatformFilterLabel,
  getSortFilterLabel,
  getStatusFilterLabel,
} from "./filter-labels";

const t = (key: string) => {
  const map: Record<string, string> = {
    "status.draft": "Rascunho",
    "status.active": "Ativa",
    "platformNames.Meta": "Meta Ads",
    "platformNames.TikTok": "TikTok Ads",
    "platformNames.Google": "Google Ads",
  };
  return map[key] ?? key;
};

const tc = (key: string) => {
  const map: Record<string, string> = {
    allStatus: "Todos os status",
    allPlatforms: "Todas as plataformas",
    newest: "Mais recente",
    oldest: "Mais antigo",
    nameAsc: "Nome A-Z",
    nameDesc: "Nome Z-A",
    mostDerivations: "Mais variações criativas",
  };
  return map[key] ?? key;
};

describe("filter-labels", () => {
  it("maps status filter values to readable labels", () => {
    expect(getStatusFilterLabel("all", t, tc)).toBe("Todos os status");
    expect(getStatusFilterLabel("draft", t, tc)).toBe("Rascunho");
  });

  it("maps platform filter values to readable labels", () => {
    expect(getPlatformFilterLabel("all", t, tc)).toBe("Todas as plataformas");
    expect(getPlatformFilterLabel("Meta", t, tc)).toBe("Meta Ads");
  });

  it("maps sort options to readable labels", () => {
    expect(getSortFilterLabel("newest", tc)).toBe("Mais recente");
    expect(getSortFilterLabel("variations", tc)).toBe("Mais variações criativas");
  });
});
