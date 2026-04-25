import { describe, it, expect } from "vitest";
import { z } from "zod";

const planSchema = z.object({
  strategy: z.string(),
  angles: z.array(z.string()),
  hooks: z.array(z.string()),
  ctas: z.array(z.string()),
});

describe("plan generation", () => {
  it("returns valid structured JSON for valid OpenAI response", () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              strategy: "Focus on urgency",
              angles: ["Flash sale", "Limited stock"],
              hooks: ["Don't miss out"],
              ctas: ["Shop now"],
            }),
          },
        },
      ],
    };

    const rawContent = mockResponse.choices[0]?.message?.content;
    expect(rawContent).toBeDefined();

    const jsonMatch = rawContent!.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonString = jsonMatch ? jsonMatch[1].trim() : rawContent!.trim();

    const parsedJson = JSON.parse(jsonString);
    const validated = planSchema.safeParse(parsedJson);

    expect(validated.success).toBe(true);
  });

  it("rejects invalid JSON from OpenAI", () => {
    const rawContent = "this is not json { broken";

    expect(() => {
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1].trim() : rawContent.trim();
      JSON.parse(jsonString);
    }).toThrow();
  });

  it("rejects JSON missing required fields", () => {
    const rawContent = JSON.stringify({
      strategy: "Only strategy",
      // missing angles, hooks, ctas
    });

    const parsedJson = JSON.parse(rawContent);
    const validated = planSchema.safeParse(parsedJson);

    expect(validated.success).toBe(false);
  });

  it("extracts JSON from markdown code block", () => {
    const rawContent =
      '```json\n{"strategy":"A","angles":["a1"],"hooks":["h1"],"ctas":["c1"]}\n```';

    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    expect(jsonMatch).not.toBeNull();

    const jsonString = jsonMatch![1].trim();
    const parsedJson = JSON.parse(jsonString);
    const validated = planSchema.safeParse(parsedJson);

    expect(validated.success).toBe(true);
  });
});
