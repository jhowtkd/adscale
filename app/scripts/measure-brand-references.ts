/**
 * Measure a brand's reference set deterministically and report whether the
 * approved pieces actually cluster as one visual family.
 *
 * This is the acceptance evidence for #177: the measurement must DISCRIMINATE,
 * not merely describe. Approved references should sit together; archived ones
 * (a different visual identity) should fall outside.
 *
 * Assets are never committed. Point this at a local, git-ignored folder:
 *
 *   tmp/preceptoria-refs/
 *     approved/   <- the 4 approved references
 *     archived/   <- the 3 archived CENBRAP Pós-EAD pieces
 *
 *   npx tsx scripts/measure-brand-references.ts tmp/preceptoria-refs
 *   npx tsx scripts/measure-brand-references.ts tmp/preceptoria-refs --anonymize
 *
 * Output: a human-readable table plus `measurement.json` (numbers only) written
 * into the input folder, suitable for pasting as evidence on the ticket.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  DETERMINISTIC_MEASUREMENT_VERSION,
  measureImageBuffer,
  type ColorTarget,
  type DeterministicImageMeasurement,
} from "@/server/brand-training/measure-image";

/**
 * PreceptorIA palette, taken from the brand kit as cadastrado. Swap this set to
 * run the same check for another profile.
 */
const PRECEPTORIA_PALETTE: readonly ColorTarget[] = [
  { hex: "#071522", label: "navy-principal" },
  { hex: "#0D1D2C", label: "azul-card" },
  { hex: "#FFC914", label: "amarelo-institucional" },
  { hex: "#FFFFFF", label: "branco" },
  { hex: "#D8DEE5", label: "cinza-claro" },
  { hex: "#F4F0E6", label: "off-white" },
];

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

type Group = "approved" | "archived";

interface Measured {
  group: Group;
  file: string;
  measurement: DeterministicImageMeasurement;
}

async function readGroup(
  root: string,
  group: Group,
  optional = false,
): Promise<Measured[]> {
  const dir = join(root, group);
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => IMAGE_EXT.test(n)).sort();
  } catch {
    if (optional) return [];
    throw new Error(`Missing folder: ${dir}`);
  }
  if (names.length === 0) {
    if (optional) return [];
    throw new Error(`No images in ${dir}`);
  }

  const out: Measured[] = [];
  for (const name of names) {
    const buffer = await readFile(join(dir, name));
    const measurement = await measureImageBuffer(buffer, {
      colorTargets: PRECEPTORIA_PALETTE,
    });
    out.push({ group, file: basename(name), measurement });
  }
  return out;
}

/** Coverage percentages in palette order — the feature vector for clustering. */
function coverageVector(m: DeterministicImageMeasurement): number[] {
  return PRECEPTORIA_PALETTE.map(
    (target) =>
      m.colorCoverage.find(
        (c) => c.hex.toLowerCase() === target.hex.toLowerCase(),
      )?.coveragePercent ?? 0,
  );
}

function centroid(vectors: number[][]): number[] {
  return vectors[0].map(
    (_, i) => vectors.reduce((sum, v) => sum + v[i], 0) / vectors.length,
  );
}

function euclidean(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(
    values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1),
  );
}

function pct(n: number): string {
  return `${n.toFixed(2).padStart(6)}%`;
}

async function main() {
  const [rootArg, ...flags] = process.argv.slice(2);
  if (!rootArg) {
    console.error(
      "usage: npx tsx scripts/measure-brand-references.ts <folder> [--anonymize]",
    );
    process.exit(1);
  }
  const anonymize = flags.includes("--anonymize");
  const root = resolve(rootArg);

  const approved = await readGroup(root, "approved");
  // Optional control group. Without it the discrimination test cannot run —
  // the script reports internal cohesion only and says so explicitly.
  const archived = await readGroup(root, "archived", true);
  const all = [...approved, ...archived];

  const label = (m: Measured, index: number) =>
    anonymize ? `${m.group}-${index + 1}` : m.file;

  // --- per-image table -----------------------------------------------------
  console.log(
    `\nMeasurement v${DETERMINISTIC_MEASUREMENT_VERSION} — ${all.length} pieces ` +
      `(${approved.length} approved, ${archived.length} archived)\n`,
  );
  for (const group of ["approved", "archived"] as const) {
    console.log(group.toUpperCase());
    all
      .filter((m) => m.group === group)
      .forEach((row, i) => {
        const m = row.measurement;
        console.log(`  ${label(row, i)}`);
        console.log(
          `    ${m.width}×${m.height}  ratio ${m.aspectRatio.toFixed(3)}` +
            `  luminance ${m.meanLuminance.toFixed(1)}` +
            `  realAlpha ${m.hasRealTransparency ? "yes" : "no"}`,
        );
        for (const target of PRECEPTORIA_PALETTE) {
          const cov =
            m.colorCoverage.find(
              (c) => c.hex.toLowerCase() === target.hex.toLowerCase(),
            )?.coveragePercent ?? 0;
          console.log(
            `    ${(target.label ?? target.hex).padEnd(24)} ${pct(cov)}`,
          );
        }
        if (m.margins) {
          const g = m.margins;
          console.log(`    margins L${g.left} T${g.top} R${g.right} B${g.bottom}`);
        }
      });
    console.log("");
  }

  // --- per-colour group comparison ----------------------------------------
  const hasControl = archived.length > 0;

  console.log("COVERAGE BY GROUP (mean ± sd)\n");
  const groupSummary = PRECEPTORIA_PALETTE.map((target, i) => {
    const a = approved.map((m) => coverageVector(m.measurement)[i]);
    const b = archived.map((m) => coverageVector(m.measurement)[i]);
    const row = {
      hex: target.hex,
      label: target.label ?? target.hex,
      approvedMean: mean(a),
      approvedSd: stdDev(a),
      archivedMean: hasControl ? mean(b) : null,
      archivedSd: hasControl ? stdDev(b) : null,
    };
    const control =
      row.archivedMean === null || row.archivedSd === null
        ? "   archived (no control group)"
        : `   archived ${pct(row.archivedMean)} ± ${row.archivedSd.toFixed(2).padStart(5)}`;
    console.log(
      `  ${row.label.padEnd(24)} approved ${pct(row.approvedMean)} ± ${row.approvedSd
        .toFixed(2)
        .padStart(5)}${control}`,
    );
    return row;
  });

  // --- discrimination verdict ---------------------------------------------
  // Nearest-centroid check: every piece should sit closer to its own group's
  // centroid than to the other's. This is the claim #177 has to earn — that the
  // measurement separates families rather than just describing each piece.
  const approvedCentroid = centroid(
    approved.map((m) => coverageVector(m.measurement)),
  );
  const archivedCentroid = hasControl
    ? centroid(archived.map((m) => coverageVector(m.measurement)))
    : null;

  const assignments = archivedCentroid
    ? all.map((m, idx) => {
        const v = coverageVector(m.measurement);
        const own = m.group === "approved" ? approvedCentroid : archivedCentroid;
        const other = m.group === "approved" ? archivedCentroid : approvedCentroid;
        const dOwn = euclidean(v, own);
        const dOther = euclidean(v, other);
        return {
          file: label(m, idx),
          group: m.group,
          distanceToOwnCentroid: dOwn,
          distanceToOtherCentroid: dOther,
          correct: dOwn < dOther,
        };
      })
    : [];

  const misassigned = assignments.filter((a) => !a.correct);
  const separation = archivedCentroid
    ? euclidean(approvedCentroid, archivedCentroid)
    : null;
  const discriminates = archivedCentroid ? misassigned.length === 0 : null;

  // Internal cohesion — how tightly the approved set holds together. Always
  // computed; it is the only claim available without a control group.
  const spread = approved.map((m) =>
    euclidean(coverageVector(m.measurement), approvedCentroid),
  );
  const cohesion = {
    meanDistanceToCentroid: mean(spread),
    maxDistanceToCentroid: Math.max(...spread),
  };

  console.log("\nCOHESION (approved set)\n");
  console.log(`  mean distance to centroid   ${cohesion.meanDistanceToCentroid.toFixed(2)}`);
  console.log(`  max  distance to centroid   ${cohesion.maxDistanceToCentroid.toFixed(2)}`);

  console.log("\nDISCRIMINATION\n");
  if (!archivedCentroid) {
    console.log("  SKIPPED — no control group in archived/.");
    console.log(
      "  Cohesion alone cannot show the measurement is meaningful: a ruler that",
    );
    console.log(
      "  returns the same number for everything would also look perfectly cohesive.",
    );
    console.log(
      "  Add any off-brand pieces to archived/ to turn this into a real test.\n",
    );
  } else {
    console.log(`  centroid separation      ${separation?.toFixed(2)}`);
    console.log(
      `  correctly grouped        ${all.length - misassigned.length}/${all.length}`,
    );
    for (const bad of misassigned) {
      console.log(
        `  MISGROUPED  ${bad.file} (${bad.group}) — own ${bad.distanceToOwnCentroid.toFixed(
          2,
        )} vs other ${bad.distanceToOtherCentroid.toFixed(2)}`,
      );
    }
    console.log(
      `\n  VERDICT: ${
        discriminates
          ? "measurement DISCRIMINATES — approved cluster, control falls outside"
          : "measurement DOES NOT discriminate — investigate measure-image before merging"
      }\n`,
    );
  }

  // --- evidence file (numbers only) ---------------------------------------
  const report = {
    measuredAt: new Date().toISOString(),
    measurementVersion: DETERMINISTIC_MEASUREMENT_VERSION,
    anonymized: anonymize,
    palette: PRECEPTORIA_PALETTE,
    images: all.map((m, idx) => ({
      group: m.group,
      file: label(m, idx),
      width: m.measurement.width,
      height: m.measurement.height,
      aspectRatio: m.measurement.aspectRatio,
      orientationApplied: m.measurement.orientationApplied,
      hasRealTransparency: m.measurement.hasRealTransparency,
      meanLuminance: m.measurement.meanLuminance,
      margins: m.measurement.margins,
      coverage: Object.fromEntries(
        m.measurement.colorCoverage.map((c) => [c.hex, c.coveragePercent]),
      ),
    })),
    groupSummary,
    cohesion,
    discrimination: {
      controlGroupPresent: hasControl,
      centroidSeparation: separation,
      assignments,
      discriminates,
    },
  };

  const out = join(root, "measurement.json");
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`  evidence written to ${out}\n`);

  // Non-zero exit only on a real failure. A skipped test is not a pass, but it
  // is not a failure either — exit 3 marks "inconclusive" distinctly.
  if (discriminates === false) process.exit(2);
  if (discriminates === null) process.exit(3);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
