import { describe, expect, it } from "vitest";
import {
  buildAnnotationInstructionText,
  buildAnnotationOverlaySvg,
  type AnnotatedRegion,
} from "./annotation-overlay";

const regions: AnnotatedRegion[] = [
  { x: 0.12, y: 0.2, width: 0.3, height: 0.18, comment: "Reduce headline size." },
  { x: 0.62, y: 0.58, width: 0.22, height: 0.24, comment: "Move CTA upward." },
];

describe("buildAnnotationInstructionText", () => {
  it("emits deterministic, numbered region instructions", () => {
    const text = buildAnnotationInstructionText(regions);
    expect(text).toContain("Region 1 [x=0.120,y=0.200,w=0.300,h=0.180]: Reduce headline size.");
    expect(text).toContain("Region 2 [x=0.620,y=0.580,w=0.220,h=0.240]: Move CTA upward.");
  });

  it("orders regions by their input order, not by position", () => {
    const reordered: AnnotatedRegion[] = [
      { x: 0.5, y: 0.5, width: 0.1, height: 0.1, comment: "second" },
      { x: 0.1, y: 0.1, width: 0.1, height: 0.1, comment: "first" },
    ];
    const text = buildAnnotationInstructionText(reordered);
    expect(text.indexOf("second")).toBeLessThan(text.indexOf("first"));
  });
});

describe("buildAnnotationOverlaySvg", () => {
  it("returns an SVG buffer and escapes comment text", () => {
    const { svg } = buildAnnotationOverlaySvg({
      width: 1000,
      height: 1000,
      regions: [
        { x: 0.1, y: 0.1, width: 0.2, height: 0.2, comment: "<script>x</script>" },
      ],
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    // Comment text must NOT appear in the SVG (it belongs in the prompt only).
    expect(svg).not.toContain("script");
    // The rectangle stroke + numeric label must be present.
    expect(svg).toContain("rect");
    expect(svg).toContain(">1<");
  });

  it("scales normalized coordinates to pixel space", () => {
    const { svg } = buildAnnotationOverlaySvg({
      width: 1000,
      height: 1000,
      regions: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4, comment: "c" }],
    });
    // x=0.1*1000=100, y=0.2*1000=200, w=0.3*1000=300, h=0.4*1000=400
    expect(svg).toContain('x="100"');
    expect(svg).toContain('y="200"');
    expect(svg).toContain('width="300"');
    expect(svg).toContain('height="400"');
  });
});
