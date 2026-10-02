// When the client says "logo" (ticket 16): the server measures the logo for the plate it asks for only if the upload says what it is.
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { uploadChatAttachment } from "./chat-attachments";

const HANDOFF_ID = "00000000-0000-4000-8000-000000000001";
const PROFILE_ID = "00000000-0000-4000-8000-000000000009";
const stored = { asset: { id: "asset", key: "managed/logo.png", url: "/logo.png", type: "image/png", name: "logo.png", size: 8 } };

function stubFetch() {
  const request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(stored));
  vi.stubGlobal("fetch", request);
  return request;
}
const form = (request: ReturnType<typeof stubFetch>, call = 0) => request.mock.calls[call]![1]!.body as FormData;
afterEach(() => vi.unstubAllGlobals());

const raster = async (format: "png" | "jpeg" | "webp") => {
  const pipeline = sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0.5 } } });
  const bytes = await (format === "png" ? pipeline.png() : format === "jpeg" ? pipeline.flatten({ background: "#fff" }).jpeg() : pipeline.webp()).toBuffer();
  return new File([new Uint8Array(bytes)], `logo.${format === "jpeg" ? "jpg" : format}`, { type: `image/${format}` });
};
const svg = () => new File(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="5" height="5"/></svg>'], "logo.svg", { type: "image/svg+xml" });

describe("uploadChatAttachment: purpose", () => {
  it.each(["png", "jpeg", "webp"] as const)("a %s sent as the logo of a handoff says purpose=logo", async format => {
    const request = stubFetch();
    await uploadChatAttachment(await raster(format), { handoffId: HANDOFF_ID, asLogo: true });
    expect(form(request).get("purpose")).toBe("logo");
    expect(form(request).get("handoffId")).toBe(HANDOFF_ID);
  });
  it("an SVG logo keeps saying so", async () => {
    const request = stubFetch();
    await uploadChatAttachment(svg(), { handoffId: HANDOFF_ID, asLogo: true });
    expect(form(request).get("purpose")).toBe("logo");
  });
  it.each([
    ["asLogo without a handoff", { asLogo: true }],
    ["asLogo with an empty handoffId", { handoffId: "", asLogo: true }],
    ["asLogo without a handoff and with a brand", { asLogo: true, clientProfileId: PROFILE_ID }],
    ["an upload of the handoff's images (asLogo absent)", { handoffId: HANDOFF_ID }],
    ["asLogo false", { handoffId: HANDOFF_ID, asLogo: false }],
    ["no scope", undefined],
  ])("never says purpose for %s", async (_name, scope) => {
    const request = stubFetch();
    await uploadChatAttachment(await raster("png"), scope as never);
    expect(form(request).get("purpose")).toBeNull();
  });
  it("asLogo must be exactly true: a truthy value that is not true does not say purpose", async () => {
    const request = stubFetch();
    await uploadChatAttachment(await raster("png"), { handoffId: HANDOFF_ID, asLogo: "yes" as never });
    expect(form(request).get("purpose")).toBeNull();
  });
  it("the logo and the images of the same handoff, one after the other, are told apart", async () => {
    const request = stubFetch();
    await uploadChatAttachment(await raster("png"), { handoffId: HANDOFF_ID, asLogo: true });
    await uploadChatAttachment(await raster("png"), { handoffId: HANDOFF_ID });
    await uploadChatAttachment(await raster("png"), { handoffId: HANDOFF_ID, asLogo: true });
    expect([0, 1, 2].map(i => form(request, i).get("purpose"))).toEqual(["logo", null, "logo"]);
  });
});
