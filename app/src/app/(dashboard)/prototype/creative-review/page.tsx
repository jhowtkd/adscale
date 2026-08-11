import { notFound } from "next/navigation";
import { CreativeReviewPrototype } from "@/components/quick-tools/create-post/CreativeReviewPrototype";
import type { CreativeWorkOutput } from "@/lib/hooks/use-creative-work";

function poster(format: string, width: number, height: number, accent: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#101114"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${width * .78}" cy="${height * .2}" r="${width * .16}" fill="#fff" opacity=".12"/><text x="8%" y="18%" fill="#fff" font-family="Arial" font-size="${width * .045}" font-weight="700">ADSCALE LAB</text><text x="8%" y="70%" fill="#fff" font-family="Arial" font-size="${width * .09}" font-weight="800">CRIATIVO</text><text x="8%" y="79%" fill="#fff" font-family="Arial" font-size="${width * .09}" font-weight="800">${format}</text><rect x="8%" y="86%" width="42%" height="6%" rx="${width * .02}" fill="#fff"/><text x="29%" y="90.5%" text-anchor="middle" fill="#101114" font-family="Arial" font-size="${width * .028}" font-weight="700">CONHEÇA AGORA</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const FIXTURE_SPECS: Array<[
  string,
  CreativeWorkOutput["targetFormat"],
  CreativeWorkOutput["creativeLevel"],
  number,
  number,
  string,
]> = [
  ["square", "1:1", "conservative", 1080, 1080, "#6d28d9"],
  ["portrait", "4:5", "balanced", 1080, 1350, "#0f766e"],
  ["story", "9:16", "bold", 1080, 1920, "#b45309"],
];

const FIXTURES: CreativeWorkOutput[] = FIXTURE_SPECS.map(([id, targetFormat, creativeLevel, width, height, accent]) => ({
  id: `prototype-${id}`,
  workspaceId: "prototype",
  workItemId: "prototype",
  creativeLevel,
  targetFormat,
  versionNumber: 1,
  parentOutputId: null,
  revisionInstruction: null,
  revisionAssetId: null,
  retryCount: 0,
  operationKey: `prototype:${targetFormat}`,
  status: "completed",
  outputKey: poster(targetFormat, width, height, accent),
  cost: null,
  failureCode: null,
  quality: null,
  isSelected: false,
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
}));

export default function CreativeReviewPrototypePage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--text-muted)]">Fixture local · decisão #201</p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">Revisão fiel de formatos</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Compare como 1:1, 4:5 e 9:16 são navegados, ampliados e aprovados sem corte.</p>
      </header>
      <CreativeReviewPrototype outputs={FIXTURES} />
    </div>
  );
}
