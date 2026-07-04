export interface AnnotatedRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  comment: string;
}

/**
 * Builds the deterministic, numbered instruction text that accompanies an
 * annotated revision. The format is stable so the model and a human reviewer
 * see the exact same region mapping:
 *
 *   Region 1 [x=0.120,y=0.200,w=0.300,h=0.180]: Reduce headline size.
 *
 * Comments belong ONLY in this text (which goes into the prompt), never in the
 * SVG overlay, so the model never renders the comment onto the image.
 */
export function buildAnnotationInstructionText(
  regions: AnnotatedRegion[]
): string {
  return regions
    .map((region, index) => {
      const fmt = (n: number) => n.toFixed(3);
      return `Region ${index + 1} [x=${fmt(region.x)},y=${fmt(region.y)},w=${fmt(region.width)},h=${fmt(region.height)}]: ${region.comment}`;
    })
    .join("\n");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Builds an SVG overlay containing one rectangle stroke and a numeric label per
 * region, scaled to the source image's pixel dimensions. The overlay is
 * composited onto the source image and passed to image edit alongside the
 * instruction text; the prompt must tell the model the rectangles/numbers are
 * instructions and must not appear in the output.
 *
 * Returns the SVG string (composited into a PNG buffer by the caller via Sharp).
 * Comment text is deliberately omitted from the SVG.
 */
export function buildAnnotationOverlaySvg(input: {
  width: number;
  height: number;
  regions: AnnotatedRegion[];
}): { svg: string } {
  const { width, height, regions } = input;
  const rectangles = regions
    .map((region, index) => {
      const pxX = Math.round(region.x * width);
      const pxY = Math.round(region.y * height);
      const pxW = Math.round(region.width * width);
      const pxH = Math.round(region.height * height);
      const labelX = pxX + 6;
      const labelY = pxY + 18;
      return [
        `<rect x="${pxX}" y="${pxY}" width="${pxW}" height="${pxH}" fill="none" stroke="#ff3b30" stroke-width="6" />`,
        `<text x="${labelX}" y="${labelY}" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#ff3b30">${index + 1}</text>`,
      ].join("");
    })
    .join("");

  // No comment text is emitted — the label number is the only text in the SVG.
  // XML-special characters cannot appear here (only numbers and fixed markup),
  // but escapeXml is kept for safety if the structure ever changes.
  void escapeXml;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rectangles}</svg>`;

  return { svg };
}

/**
 * Composes the full revision prompt: the instruction that rectangles/numbers
 * are guides plus the numbered region instructions. The model receives this
 * alongside the base+overlay image pair.
 */
export function buildAnnotatedRevisionPrompt(
  regions: AnnotatedRegion[]
): string {
  return [
    "The numbered red rectangles overlaid on the image are revision instructions; they must NOT appear in the output.",
    "Apply each region's instruction:",
    buildAnnotationInstructionText(regions),
  ].join("\n");
}
