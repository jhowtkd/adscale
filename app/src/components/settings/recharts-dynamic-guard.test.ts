import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// recharts 3 loops ("Maximum update depth exceeded") as soon as a chart has data
// when each of its components is wrapped in its own next/dynamic. A chart is
// lazy-loaded as one module instead (CreditUsageChart).
const PER_COMPONENT_DYNAMIC = /dynamic\(\s*\(\)\s*=>\s*import\(\s*["']recharts["']\s*\)/;

describe("settings charts", () => {
  it("never wrap individual recharts components in next/dynamic", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const offenders = readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .filter((file) => PER_COMPONENT_DYNAMIC.test(readFileSync(path.join(dir, file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
