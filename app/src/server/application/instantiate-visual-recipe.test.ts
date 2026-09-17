import { beforeEach, describe, expect, it, vi } from "vitest";
import { instantiateVisualRecipe } from "./instantiate-visual-recipe";
import type { VisualRecipeDocument } from "@/server/creative-work/visual-recipe";
import { recipeGeometryFingerprint } from "@/server/creative-work/visual-recipe";

vi.mock("@/server/repositories/visual-recipe", () => ({
  getVisualRecipeInWorkspace: vi.fn(),
}));

vi.mock("@/server/repositories/creative-work", () => ({
  createCreativeWorkDraft: vi.fn(),
  setCreativeWorkCopy: vi.fn(),
}));

const envState: { threeFourCreation: string | undefined } = { threeFourCreation: undefined };
vi.mock("@/server/validation/env", () => ({
  env: {
    get CREATIVE_WORK_34_CREATION_ENABLED() {
      return envState.threeFourCreation;
    },
  },
}));

import { getVisualRecipeInWorkspace } from "@/server/repositories/visual-recipe";
import { createCreativeWorkDraft, setCreativeWorkCopy } from "@/server/repositories/creative-work";

const getRecipe = vi.mocked(getVisualRecipeInWorkspace);
const createDraft = vi.mocked(createCreativeWorkDraft);
const setCopy = vi.mocked(setCreativeWorkCopy);

const document: VisualRecipeDocument = {
  version: 1,
  format: "4:5",
  layout: "top",
  dimensions: { width: 1080, height: 1350 },
  fontAssetKey: "font-brand-sans",
  logo: {
    referenceId: "ref-logo",
    assetKey: "brands/a/logo.png",
    category: "logo",
    box: { left: 48, top: 1180, width: 216, height: 72 },
  },
  fixedAssets: [{
    referenceId: "ref-logo",
    assetKey: "brands/a/logo.png",
    category: "logo",
    box: { left: 48, top: 1180, width: 216, height: 72 },
  }],
  textBoxes: [{ role: "headline", box: { left: 64, top: 80, width: 952, height: 140 } }],
  fields: { headline: "Turma de setembro", body: "Vagas abertas", cta: "Inscreva-se" },
  originWorkId: "work-1",
  originOutputId: "out-1",
};

describe("instantiateVisualRecipe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.threeFourCreation = undefined;
    createDraft.mockResolvedValue({ id: "work-2" } as never);
    setCopy.mockImplementation(async (_ws, _id, copy) => ({ id: "work-2", copy } as never));
  });

  it("blocks instantiating a 3:4 recipe while creation is off (ICE-04B)", async () => {
    getRecipe.mockResolvedValue({
      id: "recipe-34",
      workspaceId: "ws-1",
      clientProfileId: "brand-a",
      version: 1,
      document: { ...document, format: "3:4" },
      originWorkId: "work-1",
      originOutputId: "out-1",
    } as never);

    const result = await instantiateVisualRecipe({
      workspaceId: "ws-1",
      userId: "user-1",
      clientProfileId: "brand-a",
      draftKey: "00000000-0000-4000-8000-000000000099",
      recipeId: "recipe-34",
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "format_creation_disabled", format: "3:4" },
    });
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("instantiates a 3:4 recipe once enabled (ICE-04B)", async () => {
    envState.threeFourCreation = "true";
    getRecipe.mockResolvedValue({
      id: "recipe-34",
      workspaceId: "ws-1",
      clientProfileId: "brand-a",
      version: 1,
      document: { ...document, format: "3:4" },
      originWorkId: "work-1",
      originOutputId: "out-1",
    } as never);

    const result = await instantiateVisualRecipe({
      workspaceId: "ws-1",
      userId: "user-1",
      clientProfileId: "brand-a",
      draftKey: "00000000-0000-4000-8000-000000000099",
      recipeId: "recipe-34",
    });

    expect(result.ok).toBe(true);
    expect(createDraft).toHaveBeenCalledWith(expect.objectContaining({ format: "3:4" }));
  });

  it("refuses to instantiate a recipe from another brand", async () => {
    getRecipe.mockResolvedValue({
      id: "recipe-1",
      workspaceId: "ws-1",
      clientProfileId: "brand-a",
      version: 2,
      document,
      originWorkId: "work-1",
      originOutputId: "out-1",
    } as never);

    const result = await instantiateVisualRecipe({
      workspaceId: "ws-1",
      userId: "user-1",
      clientProfileId: "brand-b",
      draftKey: "00000000-0000-4000-8000-000000000099",
      recipeId: "recipe-1",
    });

    expect(result).toEqual({ ok: false, error: { code: "brand_mismatch" } });
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("creates a new piece that keeps recipe origin, version, font and geometry", async () => {
    getRecipe.mockResolvedValue({
      id: "recipe-1",
      workspaceId: "ws-1",
      clientProfileId: "brand-a",
      version: 2,
      document,
      originWorkId: "work-1",
      originOutputId: "out-1",
    } as never);

    const result = await instantiateVisualRecipe({
      workspaceId: "ws-1",
      userId: "user-1",
      clientProfileId: "brand-a",
      draftKey: "00000000-0000-4000-8000-000000000099",
      recipeId: "recipe-1",
      fields: { headline: "Turma de outubro" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.recipeVersion).toBe(2);
    expect(createDraft).toHaveBeenCalledWith(expect.objectContaining({
      clientProfileId: "brand-a",
      format: "4:5",
      inputSnapshot: expect.objectContaining({
        visualRecipe: expect.objectContaining({
          recipeId: "recipe-1",
          version: 2,
          originWorkId: "work-1",
          originOutputId: "out-1",
          fontAssetKey: "font-brand-sans",
          geometryFingerprint: recipeGeometryFingerprint(document),
          logo: document.logo,
          fixedAssets: document.fixedAssets,
        }),
      }),
    }));
    expect(setCopy).toHaveBeenCalledWith("ws-1", "work-2", expect.objectContaining({
      headline: "Turma de outubro",
      body: "Vagas abertas",
    }));
  });
});
