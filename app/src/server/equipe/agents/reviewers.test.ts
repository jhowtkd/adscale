// Revisores: typed findings, visual image input, and reviewer/author
// model separation.

import { describe, expect, it } from "vitest";
import { runTextReview, runVisualReview } from "./reviewers";
import {
  resolveResearchModel,
  resolveReviewerModel,
  resolveStrategistModel,
  resolveWriterModel,
} from "./roles";
import { FakeModelClient } from "./testing";

const REVIEW_JSON = JSON.stringify({
  findings: [
    { severity: "blocking", area: "factual", message: "Preço inventado: R$ 799 não está nos fatos.", suggestion: null },
    { severity: "info", area: "text", message: "CTA ok.", suggestion: "Manter." },
  ],
  summary: "Um bloqueio factual.",
});

describe("reviewers", () => {
  it("runs the reviewer on a different model from the authors", () => {
    expect(resolveReviewerModel()).not.toBe(resolveResearchModel());
    expect(resolveReviewerModel()).not.toBe(resolveWriterModel());
  });

  it("may share the strategist model (orchestration writes no reviewed copy)", () => {
    expect(resolveReviewerModel()).toBe(resolveStrategistModel());
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

  it("puts the breakpoint on the last stable block and the copy after it", async () => {
    const client = new FakeModelClient([{ content: REVIEW_JSON }]);
    await runTextReview({
      client,
      copy: { headline: "Só R$ 799", body: "Compre agora", cta: "Comprar" },
      facts: ["Plano anual custa R$ 990"],
    });
    const userMessage = client.requests[0]?.messages.find((message) => message.role === "user");
    const parts =
      userMessage && userMessage.role === "user" && Array.isArray(userMessage.content)
        ? userMessage.content
        : [];
    expect(parts).toHaveLength(2);
    const [stable, item] = parts;
    expect(stable).toMatchObject({ type: "text", cacheBreakpoint: true });
    expect(stable?.type === "text" ? stable.text : "").toMatch(/Plano anual custa R\$ 990/);
    expect(item).toMatchObject({ type: "text" });
    expect(item).not.toHaveProperty("cacheBreakpoint");
    expect(item?.type === "text" ? item.text : "").toMatch(/Só R\$ 799/);
  });

  it("puts the visual breakpoint on the static instruction, brief and image after it", async () => {
    const client = new FakeModelClient([{ content: REVIEW_JSON }]);
    await runVisualReview({ client, imageUrl: "https://assets.example.com/peca.png", brief: "Promo de inverno" });
    const userMessage = client.requests[0]?.messages.find((message) => message.role === "user");
    const parts =
      userMessage && userMessage.role === "user" && Array.isArray(userMessage.content)
        ? userMessage.content
        : [];
    expect(parts.map((part) => part.type)).toEqual(["text", "text", "image_url"]);
    const [stable, brief, image] = parts;
    expect(stable).toMatchObject({ type: "text", cacheBreakpoint: true });
    expect(stable?.type === "text" ? stable.text : "").toMatch(/attached final image/);
    expect(brief).not.toHaveProperty("cacheBreakpoint");
    expect(brief?.type === "text" ? brief.text : "").toMatch(/Promo de inverno/);
    expect(image).toMatchObject({ image_url: { url: "https://assets.example.com/peca.png" } });
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

  it("sends the reviewer effort, limit, and structured output name", async () => {
    const client = new FakeModelClient([{ content: REVIEW_JSON }]);
    await runTextReview({ client, copy: { headline: "h", body: "b", cta: "c" } });
    expect(client.requests[0]).toMatchObject({
      model: "claude-opus-5-5",
      effort: "high",
      maxTokens: 16000,
      output: { name: "equipe_text_review" },
    });
  });

  it("fails the task on refusal or truncation instead of an empty review", async () => {
    const copy = { headline: "h", body: "b", cta: "c" };
    await expect(
      runTextReview({ client: new FakeModelClient([{ content: null, stopReason: "refusal" }]), copy }),
    ).rejects.toThrow("text_review_refused");
    await expect(
      runTextReview({ client: new FakeModelClient([{ content: '{"fin', stopReason: "max_tokens" }]), copy }),
    ).rejects.toThrow("text_review_truncated");
    await expect(
      runVisualReview({
        client: new FakeModelClient([{ content: null, stopReason: "refusal" }]),
        imageUrl: "https://assets.example.com/peca.png",
        brief: "Promo",
      }),
    ).rejects.toThrow("visual_review_refused");
    await expect(
      runVisualReview({
        client: new FakeModelClient([{ content: '{"fin', stopReason: "max_tokens" }]),
        imageUrl: "https://assets.example.com/peca.png",
        brief: "Promo",
      }),
    ).rejects.toThrow("visual_review_truncated");
  });
});
