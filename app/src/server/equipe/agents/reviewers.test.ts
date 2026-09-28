// Revisores: typed findings, visual image input, and reviewer/author
// model separation.

import { describe, expect, it } from "vitest";
import { runTextReview, runVisualReview } from "./reviewers";
import { resolveReviewerModel, resolveStrategistModel, resolveWriterModel } from "./roles";
import { FakeModelClient } from "./testing";

const REVIEW_JSON = JSON.stringify({
  findings: [
    { severity: "blocking", area: "factual", message: "Preço inventado: R$ 799 não está nos fatos.", suggestion: null },
    { severity: "info", area: "text", message: "CTA ok.", suggestion: "Manter." },
  ],
  summary: "Um bloqueio factual.",
});

describe("reviewers", () => {
  it("runs the text reviewer on a different model from the authors", () => {
    expect(resolveReviewerModel()).not.toBe(resolveStrategistModel());
    expect(resolveReviewerModel()).not.toBe(resolveWriterModel());
  });

  it("parses text review findings in the typed shape", async () => {
    const client = new FakeModelClient([{ content: REVIEW_JSON }]);
    const output = await runTextReview({
      client,
      copy: { headline: "Só R$ 799", body: "Compre agora", cta: "Comprar" },
      facts: ["Plano anual custa R$ 990"],
    });
    expect(output.findings).toHaveLength(2);
    expect(output.findings[0]).toMatchObject({ severity: "blocking", area: "factual" });
    expect(output.summary).toBe("Um bloqueio factual.");
    expect(client.requests[0]?.model).toBe(resolveReviewerModel());
  });

  it("sends the final image to the visual reviewer", async () => {
    const client = new FakeModelClient([{ content: REVIEW_JSON }]);
    await runVisualReview({ client, imageUrl: "https://assets.example.com/peca.png", brief: "Promo" });
    const request = client.requests[0];
    const userMessage = request?.messages.find((message) => message.role === "user");
    const parts =
      userMessage && userMessage.role === "user" && Array.isArray(userMessage.content)
        ? userMessage.content
        : [];
    const image = parts.find((part) => part.type === "image_url");
    expect(image).toMatchObject({ image_url: { url: "https://assets.example.com/peca.png" } });
  });

  it("requires an image for the visual review", async () => {
    const client = new FakeModelClient([]);
    await expect(runVisualReview({ client, imageUrl: "", brief: "Promo" })).rejects.toThrow(
      "visual_review_requires_image",
    );
  });

  it("fails loudly on malformed review output", async () => {
    const client = new FakeModelClient([{ content: JSON.stringify({ findings: "nope" }) }]);
    await expect(
      runTextReview({ client, copy: { headline: "h", body: "b", cta: "c" } }),
    ).rejects.toThrow("text_review_schema_mismatch");
  });
});
