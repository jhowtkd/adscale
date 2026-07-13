import { describe, expect, it } from "vitest";
import { mapWorkspaceDerivations } from "./map-workspace-derivations";

describe("mapWorkspaceDerivations", () => {
  it("maps queued status to generating and labels format adaptations", () => {
    const rows = mapWorkspaceDerivations(
      [
        {
          id: "d1",
          campaignId: "c1",
          status: "queued",
          generationMode: "format_adaptation",
          format: "1:1",
          variantIndex: 0,
          cost: 240,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      { generationMode: "format_adaptation" },
      (key) => (key === "format" ? "Formato" : "Peça")
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("generating");
    expect(rows[0].name).toBe("Formato 1:1");
    expect(rows[0].creditCost).toBe(2.4);
  });
});
