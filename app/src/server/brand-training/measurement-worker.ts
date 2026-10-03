/** Runs only inside the disposable raster child; no full-size pixels cross stdout. */
export const TRAINING_MEASUREMENT_SOURCE = `function scalarLinear(c) {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function rgbToLab(r, g, b) {
    const R = srgbToLinear(r);
    const G = srgbToLinear(g);
    const B = srgbToLinear(b);
    // sRGB D65
    let x = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
    let y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
    let z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;
    // D65 white
    x /= 0.95047;
    y /= 1;
    z /= 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(x);
    const fy = f(y);
    const fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function deltaE76(a, b) {
    const dL = a[0] - b[0];
    const dA = a[1] - b[1];
    const dB = a[2] - b[2];
    return Math.sqrt(dL * dL + dA * dA + dB * dB);
}
function parseHexColor(hex) {
    const raw = hex.trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw))
        return null;
    const full = raw.length === 3
        ? raw
            .split("")
            .map((c) => c + c)
            .join("")
        : raw;
    return {
        r: parseInt(full.slice(0, 2), 16),
        g: parseInt(full.slice(2, 4), 16),
        b: parseInt(full.slice(4, 6), 16),
    };
}
function luminance(r, g, b) {
    return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
function swapForExif(width, height, orientation) {
    if (orientation != null && orientation >= 5 && orientation <= 8) {
        return { width: height, height: width, orientationApplied: orientation };
    }
    return { width, height, orientationApplied: orientation ?? null };
}
const linear = Array.from({ length: 256 }, (_, c) => scalarLinear(c));
function srgbToLinear(c) { return linear[c]; }
function trainingMeasurement(data, info, meta, options) {
    const deltaETolerance = options.deltaETolerance ?? 4;
    const colorAssignment = options.colorAssignment ?? "nearest";
    const maxAssignDeltaE = options.maxAssignDeltaE;
    const regionGrid = Math.max(1, options.regionGrid ?? 3);
    const colorTargets = options.colorTargets ?? [];
    const { width, height, orientationApplied } = swapForExif(meta.width ?? 0, meta.height ?? 0, meta.orientation);
    const channels = info.channels;
    const pixelCount = info.width * info.height;
    const targetLabs = colorTargets.map((target) => {
        const rgb = parseHexColor(target.hex);
        if (!rgb)
            throw new Error(\`measureImageBuffer: invalid hex "\${target.hex}"\`);
        return {
            hex: target.hex.startsWith("#") ? target.hex.toUpperCase() : \`#\${target.hex.toUpperCase()}\`,
            label: target.label,
            lab: rgbToLab(rgb.r, rgb.g, rgb.b),
            count: 0,
        };
    });
    let opaqueCount = 0;
    let transparentCount = 0;
    let unassignedCount = 0;
    let sumLuma = 0;
    let minX = info.width;
    let minY = info.height;
    let maxX = -1;
    let maxY = -1;
    // Background ≈ mean of four corner samples — content bbox ignores near-bg pixels.
    const corner = (x, y) => {
        const i = (y * info.width + x) * channels;
        return rgbToLab(data[i], data[i + 1], data[i + 2]);
    };
    const bgLab = (() => {
        const samples = [
            corner(0, 0),
            corner(info.width - 1, 0),
            corner(0, info.height - 1),
            corner(info.width - 1, info.height - 1),
        ];
        return [
            (samples[0][0] + samples[1][0] + samples[2][0] + samples[3][0]) / 4,
            (samples[0][1] + samples[1][1] + samples[2][1] + samples[3][1]) / 4,
            (samples[0][2] + samples[1][2] + samples[2][2] + samples[3][2]) / 4,
        ];
    })();
    const contentDeltaE = Math.max(deltaETolerance, 8);
    const cellW = Math.ceil(info.width / regionGrid);
    const cellH = Math.ceil(info.height / regionGrid);
    const regionAcc = Array.from({ length: regionGrid * regionGrid }, () => ({
        sum: 0,
        sumSq: 0,
        n: 0,
    }));
    for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
            const i = (y * info.width + x) * channels;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = channels >= 4 ? data[i + 3] : 255;
            if (a < 8) {
                transparentCount += 1;
                continue;
            }
            opaqueCount += 1;
            const luma = luminance(r, g, b);
            sumLuma += luma;
            const lab = rgbToLab(r, g, b);
            if (deltaE76(lab, bgLab) > contentDeltaE) {
                if (x < minX)
                    minX = x;
                if (y < minY)
                    minY = y;
                if (x > maxX)
                    maxX = x;
                if (y > maxY)
                    maxY = y;
            }
            const cx = Math.min(regionGrid - 1, Math.floor(x / cellW));
            const cy = Math.min(regionGrid - 1, Math.floor(y / cellH));
            const cell = regionAcc[cy * regionGrid + cx];
            cell.sum += luma;
            cell.sumSq += luma * luma;
            cell.n += 1;
            if (targetLabs.length === 0)
                continue;
            let bestIdx = -1;
            let bestDe = Infinity;
            for (let t = 0; t < targetLabs.length; t += 1) {
                const de = deltaE76(lab, targetLabs[t].lab);
                if (de < bestDe) {
                    bestDe = de;
                    bestIdx = t;
                }
            }
            if (bestIdx < 0) {
                unassignedCount += 1;
                continue;
            }
            // nearest: join closest brand color (gradients stay in-family).
            // within_tolerance: only count if inside the radius (legacy / unit tests of radius).
            const withinRadius = bestDe <= deltaETolerance;
            const withinCeiling = maxAssignDeltaE == null || bestDe <= maxAssignDeltaE;
            const assign = colorAssignment === "nearest"
                ? withinCeiling
                : withinRadius;
            if (assign) {
                targetLabs[bestIdx].count += 1;
            }
            else {
                unassignedCount += 1;
            }
        }
    }
    const denom = opaqueCount > 0 ? opaqueCount : 1;
    const colorCoverage = targetLabs.map((t) => ({
        hex: t.hex,
        ...(t.label ? { label: t.label } : {}),
        coveragePercent: Math.round((t.count / denom) * 1000) / 10,
    }));
    const unassignedPercent = Math.round((unassignedCount / denom) * 1000) / 10;
    const hasAlphaChannel = meta.hasAlpha === true;
    // Real transparency: alpha channel present AND some pixels actually transparent.
    // Fully opaque RGBA must not report as transparent.
    const hasRealTransparency = hasAlphaChannel && transparentCount > 0;
    const transparentAreaPercent = Math.round((transparentCount / Math.max(pixelCount, 1)) * 1000) / 10;
    let contentBoundingBox = null;
    let margins = null;
    if (maxX >= minX && maxY >= minY) {
        contentBoundingBox = {
            left: minX,
            top: minY,
            width: maxX - minX + 1,
            height: maxY - minY + 1,
        };
        margins = {
            left: minX,
            top: minY,
            right: info.width - 1 - maxX,
            bottom: info.height - 1 - maxY,
        };
    }
    const regions = regionAcc.map((cell, index) => {
        const cx = index % regionGrid;
        const cy = Math.floor(index / regionGrid);
        const mean = cell.n > 0 ? cell.sum / cell.n : 0;
        const variance = cell.n > 0 ? Math.max(0, cell.sumSq / cell.n - mean * mean) : 0;
        return {
            x: cx / regionGrid,
            y: cy / regionGrid,
            width: 1 / regionGrid,
            height: 1 / regionGrid,
            meanLuminance: Math.round(mean * 1000) / 1000,
            contrast: Math.round(Math.sqrt(variance) * 1000) / 1000,
        };
    });
    return {
        version: 1,
        width,
        height,
        aspectRatio: Math.round((width / height) * 1000) / 1000,
        orientationApplied,
        colorSpace: meta.space ?? null,
        hasAlphaChannel,
        hasRealTransparency,
        transparentAreaPercent,
        colorCoverage,
        unassignedPercent,
        contentBoundingBox,
        margins,
        meanLuminance: Math.round((sumLuma / denom) * 1000) / 1000,
        regions,
    };
}
`;
