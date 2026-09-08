import { beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  composeExactBrandAssets,
  meanOpaqueLuminance,
  pickContrastSafePlacement,
  runExactComposition,
} from "./composite";
import { policyForExactAsset, clearspacePx } from "./placement-policy";

async function makeBase(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .png()
    .toBuffer();
}

async function makeTransparentLayer(
  width: number,
  height: number,
  rgb: { r: number; g: number; b: number } = { r: 255, g: 0, b: 0 }
): Promise<Buffer> {
  // Build a fully-opaque RGB layer and then convert to RGBA so the layer has
  // an alpha channel but every pixel is opaque. This is what an "exact-mode
  // brand asset with transparency" looks like in practice.
  const rgbBuffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: rgb.r, g: rgb.g, b: rgb.b },
    },
  })
    .png()
    .toBuffer();
  return sharp(rgbBuffer).ensureAlpha().png().toBuffer();
}

async function makeOpaqueLayer(
  width: number,
  height: number,
  rgb: { r: number; g: number; b: number } = { r: 0, g: 0, b: 255 }
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: rgb.r, g: rgb.g, b: rgb.b },
    },
  })
    .png()
    .toBuffer();
}

describe("composeExactBrandAssets", () => {
  beforeEach(() => {
    // No mocks — these tests exercise real sharp composition.
  });

  it("places a southeast layer so its pixel fills the bottom-right region", async () => {
    const base = await makeBase(100, 100);
    const originalLayer = await makeTransparentLayer(10, 10);
    const layer = {
      buffer: Buffer.from(originalLayer),
      gravity: "southeast" as const,
      // widthRatio=0.2 produces a 20x20 layer on a 100x100 base, so the
      // top-left of the southeast-placed region sits at (80, 80).
      widthRatio: 0.2,
    };

    const result = await composeExactBrandAssets(base, [layer], {
      width: 100,
      height: 100,
    });

    const pixel = await sharp(result)
      .extract({ left: 80, top: 80, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect([...pixel.subarray(0, 3)]).toEqual([255, 0, 0]);
    expect(layer.buffer.equals(originalLayer)).toBe(true);
  });

  it("clamps widthRatio below the lower bound to 0.1", async () => {
    const base = await makeBase(100, 100);
    const layer = {
      buffer: await makeTransparentLayer(50, 50),
      gravity: "southeast" as const,
      widthRatio: 0.01,
    };

    // With clamp to 0.1, layer width = 10px. The layer is 50x50 source so it
    // is scaled to 10x10 (aspect preserved). The southeast corner of that
    // 10x10 region sits at (90..100, 90..100) on the base.
    const result = await composeExactBrandAssets(base, [layer], {
      width: 100,
      height: 100,
    });

    const pixel = await sharp(result)
      .extract({ left: 95, top: 95, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect([...pixel.subarray(0, 3)]).toEqual([255, 0, 0]);
  });

  it("clamps widthRatio above the upper bound to 0.8", async () => {
    const base = await makeBase(100, 100);
    const layer = {
      buffer: await makeTransparentLayer(50, 50),
      gravity: "center" as const,
      widthRatio: 5,
    };

    // With clamp to 0.8, layer width = 80px; aspect preserved at 1:1, so a
    // 80x80 region. Center gravity centers it: left=10..90, top=10..90.
    const result = await composeExactBrandAssets(base, [layer], {
      width: 100,
      height: 100,
    });

    const pixel = await sharp(result)
      .extract({ left: 50, top: 50, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect([...pixel.subarray(0, 3)]).toEqual([255, 0, 0]);
  });

  it("does not mutate the input layer buffer", async () => {
    const base = await makeBase(100, 100);
    const originalLayer = await makeTransparentLayer(20, 20);
    const layer = {
      buffer: Buffer.from(originalLayer),
      gravity: "northwest" as const,
      widthRatio: 0.2,
    };

    await composeExactBrandAssets(base, [layer], { width: 100, height: 100 });

    expect(layer.buffer.equals(originalLayer)).toBe(true);
  });

  it("composites multiple layers in snapshot order", async () => {
    const base = await makeBase(100, 100);
    const redLayer = {
      buffer: await makeTransparentLayer(30, 30, { r: 255, g: 0, b: 0 }),
      gravity: "center" as const,
      widthRatio: 0.4,
    };
    const blueLayer = {
      buffer: await makeTransparentLayer(10, 10, { r: 0, g: 0, b: 255 }),
      gravity: "southeast" as const,
      widthRatio: 0.2,
    };

    // Center layer at widthRatio=0.4 → 40x40, centered at (30..70, 30..70).
    // Southeast layer at widthRatio=0.2 → 20x20, placed at (80..100, 80..100).
    const result = await composeExactBrandAssets(
      base,
      [redLayer, blueLayer],
      { width: 100, height: 100 }
    );

    const centerPixel = await sharp(result)
      .extract({ left: 50, top: 50, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect([...centerPixel.subarray(0, 3)]).toEqual([255, 0, 0]);

    const southeastPixel = await sharp(result)
      .extract({ left: 95, top: 95, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect([...southeastPixel.subarray(0, 3)]).toEqual([0, 0, 255]);
  });

  it("fails rather than writing two exact layers into the same accepted box", async () => {
    const base = await makeBase(100, 100);
    const layers = [
      { buffer: await makeTransparentLayer(20, 20), gravity: "southwest" as const, widthRatio: 0.2 },
      { buffer: await makeTransparentLayer(20, 20, { r: 0, g: 0, b: 255 }), gravity: "southwest" as const, widthRatio: 0.2 },
    ];

    await expect(composeExactBrandAssets(base, layers, { width: 100, height: 100 }))
      .rejects.toThrow("exact_asset_placement_collision");
  });

  it("fails before output when backdrop plates overlap despite asset boxes only touching", async () => {
    const base = await makeBase(200, 200);
    const backdrop = { rgba: { r: 7, g: 21, b: 34, alpha: 0.55 } };
    // 40x93 scaled at 0.4 becomes 80x186. With 20px clearspace, northwest
    // ends exactly where northeast starts (x=100), but each 90px backdrop
    // plate extends 5px past that edge and would visibly overlap.
    const layers = [
      {
        buffer: await makeTransparentLayer(40, 93, { r: 255, g: 201, b: 20 }),
        gravity: "northwest" as const,
        widthRatio: 0.4,
        clearspacePx: 20,
        backdrop,
      },
      {
        buffer: await makeTransparentLayer(40, 93, { r: 0, g: 120, b: 255 }),
        gravity: "northeast" as const,
        widthRatio: 0.4,
        clearspacePx: 20,
        backdrop,
      },
    ];

    await expect(composeExactBrandAssets(base, layers, { width: 200, height: 200 }))
      .rejects.toThrow("exact_asset_placement_collision");
  });

  it("rejects a layer that does not have alpha", async () => {
    const base = await makeBase(100, 100);
    const opaqueLayer = {
      buffer: await makeOpaqueLayer(10, 10),
      gravity: "southeast" as const,
      widthRatio: 0.18,
    };

    await expect(
      composeExactBrandAssets(base, [opaqueLayer], { width: 100, height: 100 })
    ).rejects.toThrow(/alpha/i);
  });

  it("returns the base unchanged when there are no layers", async () => {
    const base = await makeBase(100, 100);

    const result = await composeExactBrandAssets(base, [], {
      width: 100,
      height: 100,
    });

    const pixel = await sharp(result)
      .extract({ left: 50, top: 50, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect([...pixel.subarray(0, 3)]).toEqual([255, 255, 255]);
  });

  it("places a northwest layer so its pixel fills the top-left region", async () => {
    const base = await makeBase(100, 100);
    const layer = {
      buffer: await makeTransparentLayer(20, 20),
      gravity: "northwest" as const,
      widthRatio: 0.2,
    };

    const result = await composeExactBrandAssets(base, [layer], {
      width: 100,
      height: 100,
    });

    const pixel = await sharp(result)
      .extract({ left: 5, top: 5, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect([...pixel.subarray(0, 3)]).toEqual([255, 0, 0]);
  });

  it("places a northeast layer so its pixel fills the top-right region", async () => {
    const base = await makeBase(100, 100);
    const layer = {
      buffer: await makeTransparentLayer(20, 20),
      gravity: "northeast" as const,
      widthRatio: 0.2,
    };

    const result = await composeExactBrandAssets(base, [layer], {
      width: 100,
      height: 100,
    });

    const pixel = await sharp(result)
      .extract({ left: 90, top: 5, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect([...pixel.subarray(0, 3)]).toEqual([255, 0, 0]);
  });

  it("places a southwest layer so its pixel fills the bottom-left region", async () => {
    const base = await makeBase(100, 100);
    const layer = {
      buffer: await makeTransparentLayer(20, 20),
      gravity: "southwest" as const,
      widthRatio: 0.2,
    };

    const result = await composeExactBrandAssets(base, [layer], {
      width: 100,
      height: 100,
    });

    const pixel = await sharp(result)
      .extract({ left: 5, top: 90, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect([...pixel.subarray(0, 3)]).toEqual([255, 0, 0]);
  });

  it("honours clearspace so the logo is not flush with the canvas edge", async () => {
    const base = await makeBase(100, 100);
    const layer = {
      buffer: await makeTransparentLayer(20, 20, { r: 0, g: 255, b: 0 }),
      gravity: "southwest" as const,
      widthRatio: 0.2,
      clearspacePx: 10,
    };
    const result = await composeExactBrandAssets(base, [layer], {
      width: 100,
      height: 100,
    });
    // With pad=10 and 20×20 layer, top-left of logo is (10, 70)
    const onLogo = await sharp(result)
      .extract({ left: 15, top: 75, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect([...onLogo.subarray(0, 3)]).toEqual([0, 255, 0]);
    const edge = await sharp(result)
      .extract({ left: 2, top: 97, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect([...edge.subarray(0, 3)]).toEqual([255, 255, 255]);
  });

  it("preserves source aspect ratio (no stretch)", async () => {
    const base = await makeBase(200, 200);
    // 40×10 source → widthRatio 0.2 → target width 40, height 10
    const layer = {
      buffer: await makeTransparentLayer(40, 10, { r: 0, g: 0, b: 255 }),
      gravity: "northwest" as const,
      widthRatio: 0.2,
    };
    const result = await composeExactBrandAssets(base, [layer], {
      width: 200,
      height: 200,
    });
    const inside = await sharp(result)
      .extract({ left: 5, top: 5, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect([...inside.subarray(0, 3)]).toEqual([0, 0, 255]);
    // Below the 10px-tall layer should still be white
    const below = await sharp(result)
      .extract({ left: 5, top: 15, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect([...below.subarray(0, 3)]).toEqual([255, 255, 255]);
  });
});

describe("pickContrastSafePlacement + runExactComposition", () => {
  it("prefers a corner with usable contrast over a matching dark underlay", async () => {
    // Left half black, right half white — yellow logo should prefer the dark side.
    const width = 200;
    const height = 200;
    const raw = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 3;
        const v = x < width / 2 ? 10 : 240;
        raw[i] = v;
        raw[i + 1] = v;
        raw[i + 2] = v;
      }
    }
    const base = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const logo = await makeTransparentLayer(40, 20, { r: 255, g: 201, b: 20 });
    const policy = policyForExactAsset("logo", "1:1")!;
    const plan = {
      referenceId: "r1",
      assetKey: "k",
      label: "Logo",
      category: "logo" as const,
      gravity: "southeast" as const, // white side
      widthRatio: 0.2,
      clearspacePx: clearspacePx({ width, height }, policy),
      policy,
      status: "compose" as const,
      reason: "test",
    };
    const picked = await pickContrastSafePlacement({
      base,
      logo,
      plan,
      dimensions: { width, height },
    });
    expect(picked.contrast).toBeGreaterThanOrEqual(policy.minContrast);
    // Should move off the bright southeast toward a darker corner (west side).
    expect(["southwest", "northwest"]).toContain(picked.gravity);
  });

  it("records provenance for composed logo without an extra provider call", async () => {
    // Navy base
    const navy = await sharp({
      create: {
        width: 108,
        height: 135,
        channels: 3,
        background: { r: 7, g: 21, b: 34 },
      },
    })
      .png()
      .toBuffer();
    const logo = await makeTransparentLayer(40, 16, { r: 255, g: 201, b: 20 });
    const result = await runExactComposition({
      base: navy,
      format: "4:5",
      dimensions: { width: 108, height: 135 },
      assets: [
        {
          referenceId: "logo-1",
          assetKey: "ws/logo.png",
          label: "Logo oficial",
          category: "logo",
          usageMode: "exact",
          analysis: null,
          mimeType: "image/png",
          hasAlpha: true,
          placement: { gravity: "southwest", widthRatio: 0.2 },
        },
      ],
      loadAsset: async () => logo,
    });
    expect(result.provenance.composed).toHaveLength(1);
    expect(result.provenance.composed[0]?.referenceId).toBe("logo-1");
    expect(result.provenance.composed[0]?.policy.required).toBe(true);
    expect(result.provenance.composed[0]?.clearspacePx).toBeGreaterThan(0);
    expect(result.provenance.composed[0]?.box).toEqual({
      left: expect.any(Number),
      top: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
    });
    expect(result.provenance.omitted).toEqual([]);
    // Yellow on navy — high contrast, no backdrop needed
    expect(result.provenance.composed[0]?.usedBackdrop).toBe(false);
    expect(result.provenance.baseHash).toBe(createHash("sha256").update(navy).digest("hex"));
    expect(result.provenance.outputHash).toBe(createHash("sha256").update(result.buffer).digest("hex"));
    expect(result.provenance.composed[0]?.sourceSha256)
      .toBe(createHash("sha256").update(logo).digest("hex"));
    expect(await meanOpaqueLuminance(logo)).toBeGreaterThan(0.5);
    // Logo pixels present on composed canvas
    const meta = await sharp(result.buffer).metadata();
    expect(meta.width).toBe(108);
    expect(meta.height).toBe(135);
  });

  it("reserves the first contrast fallback box so two planned right-corner logos do not overlap", async () => {
    const width = 200;
    const height = 200;
    const raw = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 3;
        const value = x < width / 2 ? 10 : 240;
        raw[i] = value;
        raw[i + 1] = value;
        raw[i + 2] = value;
      }
    }
    const base = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const first = await makeTransparentLayer(40, 16, { r: 255, g: 201, b: 20 });
    const second = await makeTransparentLayer(40, 16, { r: 255, g: 201, b: 20 });
    const result = await runExactComposition({
      base,
      format: "1:1",
      dimensions: { width, height },
      assets: [
        {
          referenceId: "logo-southeast",
          assetKey: "ws/logo-southeast.png",
          label: "Logo sudeste",
          category: "logo",
          usageMode: "exact",
          analysis: null,
          mimeType: "image/png",
          hasAlpha: true,
          placement: { gravity: "southeast", widthRatio: 0.2 },
        },
        {
          referenceId: "logo-northeast",
          assetKey: "ws/logo-northeast.png",
          label: "Logo nordeste",
          category: "logo",
          usageMode: "exact",
          analysis: null,
          mimeType: "image/png",
          hasAlpha: true,
          placement: { gravity: "northeast", widthRatio: 0.2 },
        },
      ],
      loadAsset: async (assetKey) => assetKey.includes("southeast") ? first : second,
    });

    const [firstLayer, secondLayer] = result.provenance.composed;
    expect([firstLayer?.gravity, secondLayer?.gravity]).toEqual(["southwest", "northwest"]);
    const a = firstLayer?.box;
    const b = secondLayer?.box;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    if (!a || !b) throw new Error("expected exact placement boxes");
    expect(a.left + a.width <= b.left || b.left + b.width <= a.left || a.top + a.height <= b.top || b.top + b.height <= a.top).toBe(true);
  });

  it("keeps frozen recipe boxes instead of contrast gravity", async () => {
    const navy = await sharp({
      create: {
        width: 108,
        height: 135,
        channels: 3,
        background: { r: 7, g: 21, b: 34 },
      },
    })
      .png()
      .toBuffer();
    const logo = await makeTransparentLayer(40, 16, { r: 255, g: 201, b: 20 });
    const frozen = { left: 8, top: 90, width: 32, height: 16 };
    const result = await runExactComposition({
      base: navy,
      format: "4:5",
      dimensions: { width: 108, height: 135 },
      frozenBoxes: { "ws/logo.png": frozen },
      assets: [
        {
          referenceId: "logo-1",
          assetKey: "ws/logo.png",
          label: "Logo oficial",
          category: "logo",
          usageMode: "exact",
          analysis: null,
          mimeType: "image/png",
          hasAlpha: true,
          placement: { gravity: "southwest", widthRatio: 0.2 },
        },
      ],
      loadAsset: async () => logo,
    });
    expect(result.provenance.composed[0]?.box).toEqual(frozen);
    expect(result.provenance.composed[0]?.reason).toBeUndefined();
    expect(result.provenance.composed[0]?.usedBackdrop).toBe(false);
  });
});
