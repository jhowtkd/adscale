import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChatAttachmentUploadError,
  MAX_CHAT_ATTACHMENTS,
  collectImageFiles,
  remainingAttachmentSlots,
  uploadChatAttachment,
} from "./chat-attachments";

describe("chat-attachments helpers", () => {
  it("collects only allowed image mime types", () => {
    const files = [
      new File(["a"], "a.png", { type: "image/png" }),
      new File(["b"], "b.pdf", { type: "application/pdf" }),
      new File(["c"], "c.jpg", { type: "image/jpeg" }),
    ];

    const collected = collectImageFiles(files);
    expect(collected).toHaveLength(2);
    expect(collected.map((file) => file.name)).toEqual(["a.png", "c.jpg"]);
  });

  it("computes remaining slots up to the API max", () => {
    expect(MAX_CHAT_ATTACHMENTS).toBe(5);
    expect(remainingAttachmentSlots(0)).toBe(5);
    expect(remainingAttachmentSlots(4)).toBe(1);
    expect(remainingAttachmentSlots(5)).toBe(0);
  });

  it.each([undefined, "00000000-0000-4000-8000-000000000001"])("sends optional handoff context in the real upload request: %s", async (handoffId) => {
    const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "logo.png", { type: "image/png" });
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ asset: { id: "asset", key: "managed/logo.png", url: "/logo.png", type: "image/png", name: "logo.png", size: 8 } }));
    vi.stubGlobal("fetch", request);
    try {
      const asset = await uploadChatAttachment(file, handoffId ? { handoffId } : undefined);
      expect(asset.key).toBe("managed/logo.png");
      const body = request.mock.calls[0]![1]!.body as FormData;
      expect(body.get("handoffId")).toBe(handoffId ?? null);
      expect(body.get("file")).toBeInstanceOf(File);
    } finally { vi.unstubAllGlobals(); }
  });
});

describe("uploadChatAttachment: an SVG logo (ticket 15, item 2)", () => {
  const HANDOFF_ID = "00000000-0000-4000-8000-000000000001";
  const UNSUPPORTED = "Tipo de arquivo não suportado. Use PNG, JPG ou WebP.";
  const svg = () => new File(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="5" height="5"/></svg>'], "logo.svg", { type: "image/svg+xml" });
  const png = () => new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "logo.png", { type: "image/png" });
  const stored = { asset: { id: "asset", key: "managed/logo.png", url: "/logo.png", type: "image/png", name: "logo.png", size: 8 } };

  function stubFetch(response?: Response) {
    // A fresh answer for every call: a Response body can be read once.
    const request = vi.fn<typeof fetch>().mockImplementation(async () => response?.clone() ?? Response.json(stored));
    vi.stubGlobal("fetch", request);
    return request;
  }
  afterEach(() => vi.unstubAllGlobals());

  it("takes an SVG for the logo of a handoff: it is sent with handoffId and purpose=logo, as the file it is", async () => {
    const request = stubFetch();
    const file = svg();
    const asset = await uploadChatAttachment(file, { handoffId: HANDOFF_ID, asLogo: true });
    expect(asset).toMatchObject({ key: "managed/logo.png", type: "image/png" });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]![0]).toBe("/api/workspace/assets");
    const body = request.mock.calls[0]![1]!.body as FormData;
    expect(body.get("purpose")).toBe("logo");
    expect(body.get("handoffId")).toBe(HANDOFF_ID);
    expect((body.get("file") as File).type).toBe("image/svg+xml");
    expect((body.get("file") as File).name).toBe("logo.svg");
    expect(body.get("clientProfileId")).toBeNull();
  });

  it("does not read the file's bytes in the browser: the server judges an SVG", async () => {
    stubFetch();
    const file = svg();
    const slice = vi.spyOn(file, "slice"), buffer = vi.spyOn(file, "arrayBuffer");
    await uploadChatAttachment(file, { handoffId: HANDOFF_ID, asLogo: true });
    expect(slice).not.toHaveBeenCalled();
    expect(buffer).not.toHaveBeenCalled();
  });

  it.each<[string, { handoffId?: string; asLogo?: boolean } | undefined]>([
    ["no scope", undefined],
    ["a scope without asLogo", { handoffId: HANDOFF_ID }],
    ["asLogo false", { handoffId: HANDOFF_ID, asLogo: false }],
    ["asLogo without a handoff", { asLogo: true }],
    ["asLogo with an empty handoffId", { handoffId: "", asLogo: true }],
  ])("keeps refusing an SVG with the same message as before: %s, and sends nothing", async (_name, scope) => {
    const request = stubFetch();
    const error = await uploadChatAttachment(svg(), scope).then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ChatAttachmentUploadError);
    expect((error as Error).message).toBe(UNSUPPORTED);
    expect(request).not.toHaveBeenCalled();
  });

  it("asLogo does not let anything else through: other types are refused, and an image that is not what it says is too", async () => {
    const request = stubFetch();
    for (const type of ["application/pdf", "text/xml", "image/svg+xml; charset=utf-8", "image/gif", ""]) {
      await expect(uploadChatAttachment(new File(["<svg/>"], "x.svg", { type }), { handoffId: HANDOFF_ID, asLogo: true }), type).rejects.toThrow(UNSUPPORTED);
    }
    await expect(uploadChatAttachment(new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], "fake.png", { type: "image/png" }), { handoffId: HANDOFF_ID, asLogo: true })).rejects.toThrow("Arquivo inválido ou corrompido.");
    expect(request).not.toHaveBeenCalled();
  });

  it("the logo of a handoff says so, whatever its type (the server measures it for the plate it asks for); the images of the handoff say nothing", async () => {
    const request = stubFetch();
    await uploadChatAttachment(png(), { handoffId: HANDOFF_ID, asLogo: true });
    await uploadChatAttachment(png(), { handoffId: HANDOFF_ID });
    const purposes = request.mock.calls.map((call) => (call[1]!.body as FormData).get("purpose"));
    expect(purposes).toEqual(["logo", null]);
    for (const call of request.mock.calls) expect((call[1]!.body as FormData).get("handoffId")).toBe(HANDOFF_ID);
  });

  it("an SVG is not sent with a brand: no clientProfileId comes from the store when there is a handoff", async () => {
    const { useAppStore } = await import("@/lib/store");
    useAppStore.setState({ activeClientProfileId: "00000000-0000-4000-8000-0000000000aa" });
    try {
      const request = stubFetch();
      await uploadChatAttachment(svg(), { handoffId: HANDOFF_ID, asLogo: true });
      expect((request.mock.calls[0]![1]!.body as FormData).get("clientProfileId")).toBeNull();
    } finally { useAppStore.setState({ activeClientProfileId: null }); }
  });

  it("the server's refusal becomes a ChatAttachmentUploadError with its message and its code (svgUnreadable)", async () => {
    stubFetch(Response.json({ error: "Não foi possível ler este SVG.", code: "svgUnreadable" }, { status: 400 }));
    const error = await uploadChatAttachment(svg(), { handoffId: HANDOFF_ID, asLogo: true }).then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(ChatAttachmentUploadError);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: "ChatAttachmentUploadError", message: "Não foi possível ler este SVG.", code: "svgUnreadable" });
  });

  it("other server answers keep their code, or have none, and the old fallback message when there is no readable body", async () => {
    stubFetch(Response.json({ error: "Arquivo grande demais", code: "fileTooLarge" }, { status: 400 }));
    await expect(uploadChatAttachment(svg(), { handoffId: HANDOFF_ID, asLogo: true })).rejects.toMatchObject({ message: "Arquivo grande demais", code: "fileTooLarge" });
    stubFetch(Response.json({ error: "Sem código" }, { status: 400 }));
    await expect(uploadChatAttachment(png(), { handoffId: HANDOFF_ID })).rejects.toSatisfy((e: ChatAttachmentUploadError) => e.message === "Sem código" && e.code === undefined);
    stubFetch(new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(uploadChatAttachment(png(), { handoffId: HANDOFF_ID })).rejects.toSatisfy((e: ChatAttachmentUploadError) => e instanceof ChatAttachmentUploadError && e.message === "Falha ao enviar imagem" && e.code === undefined);
    stubFetch(Response.json({ error: 42, code: 7 }, { status: 500 }));
    await expect(uploadChatAttachment(png(), { handoffId: HANDOFF_ID })).rejects.toSatisfy((e: ChatAttachmentUploadError) => e.message === "Falha ao enviar imagem" && e.code === undefined);
  });

  it("the old behaviour is intact: a plain image goes up with the active brand, a handoff one without, and the brand check still comes first", async () => {
    const { useAppStore } = await import("@/lib/store");
    useAppStore.setState({ activeClientProfileId: "00000000-0000-4000-8000-0000000000aa" });
    try {
      const request = stubFetch();
      await uploadChatAttachment(png());
      expect((request.mock.calls[0]![1]!.body as FormData).get("clientProfileId")).toBe("00000000-0000-4000-8000-0000000000aa");
      expect((request.mock.calls[0]![1]!.body as FormData).get("handoffId")).toBeNull();
      await expect(uploadChatAttachment(png(), { clientProfileId: null })).rejects.toThrow("Selecione uma marca antes de enviar imagens.");
      await expect(uploadChatAttachment(new File(["x"], "a.pdf", { type: "application/pdf" }))).rejects.toThrow(UNSUPPORTED);
      expect(request).toHaveBeenCalledTimes(1);
    } finally { useAppStore.setState({ activeClientProfileId: null }); }
  });
});
