import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreativeWorkDetail, CreativeWorkOutput } from "@/lib/hooks/use-creative-work";
import { creativeWorkKey } from "@/lib/hooks/use-creative-work";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  generate: vi.fn(),
  uploadChatAttachment: vi.fn(),
}));

vi.mock("@/lib/hooks/use-creative-work", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks/use-creative-work")>();
  return {
    ...actual,
    useSaveOutputReview: () => ({ mutateAsync: mocks.save, isPending: false }),
    useGenerateReviewedRevision: () => ({ mutateAsync: mocks.generate, isPending: false }),
  };
});

vi.mock("@/lib/assistant/chat-attachments", () => ({
  uploadChatAttachment: mocks.uploadChatAttachment,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => ({
    reviewConflict: "Este rascunho mudou em outra aba. Seu texto foi preservado.",
    reviewNeedsContent: "Escreva o que quer mudar ou adicione um comentário.",
    reviewPaymentNeeded: "Saldo insuficiente. Adicione créditos e confirme novamente.",
    reviewSubmitFailed: "Não foi possível enviar a revisão.",
    reviewSubmitUnknown: "Não foi possível confirmar o envio.",
  }[key] ?? key),
}));

import { useOutputReview, type OutputReviewInput } from "./useOutputReview";

const REVISION_KEY = "00000000-0000-4000-8000-00000000000a";
const CHILD_ID = "00000000-0000-4000-8000-0000000000c1";

function outputFixture(overrides: Partial<CreativeWorkOutput> = {}): CreativeWorkOutput {
  return {
    id: "output-1",
    workItemId: "work-1",
    creativeLevel: "balanced",
    targetFormat: "4:5",
    versionNumber: 1,
    parentOutputId: null,
    revisionInstruction: null,
    revisionAssetId: null,
    retryCount: 0,
    imageCallCount: 1,
    status: "completed",
    hasOutput: true,
    outputKey: null,
    failureCode: null,
    quality: null,
    layerization: null,
    layerEditor: null,
    isSelected: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    reviewDraft: null,
    revisionContext: null,
    ...overrides,
  };
}

function emptyDraft(targetFormat: "1:1" | "4:5" | "9:16" = "4:5"): OutputReviewInput {
  return { action: "refine", targetFormat, instruction: "", revisionAssetId: null, annotations: [] };
}

function httpError(status: number, code: string | null = null) {
  const error = new Error(`http-${status}`) as Error & { status?: number; code?: string | null };
  error.status = status;
  error.code = code;
  return error;
}

function uncertainError() {
  return new TypeError("network failed");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function renderReview({
  output = outputFixture(),
  revisionCreditCost = 10 as number | null,
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
}: {
  output?: CreativeWorkOutput;
  revisionCreditCost?: number | null;
  queryClient?: QueryClient;
} = {}) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    (props: { output: CreativeWorkOutput; revisionCreditCost: number | null }) =>
      useOutputReview({ workItemId: "work-1", ...props }),
    {
      wrapper,
      initialProps: { output, revisionCreditCost },
    },
  );
  return { queryClient, ...view };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue({
    draft: { ...emptyDraft(), instruction: "Preserve o logo.", version: 1, revision: 1, revisionKey: REVISION_KEY },
    revisionCreditCost: 10,
  });
  mocks.generate.mockResolvedValue({
    output: outputFixture({ id: "child-after-confirm", parentOutputId: "output-1" }),
  });
});

describe("useOutputReview", () => {
  it("flushes, reviews and only then confirms with the frozen draft", async () => {
    const { result } = renderReview();
    await act(async () => result.current.update({ instruction: "Preserve o logo." }));
    expect(result.current.phase).toBe("editing");
    await act(async () => result.current.review());
    expect(result.current.phase).toBe("reviewing");
    expect(mocks.generate).not.toHaveBeenCalled();
    await act(async () => result.current.confirm());
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      workItemId: "work-1",
      outputId: "output-1",
      reviewRevision: 1,
      revisionKey: REVISION_KEY,
      expectedCredits: 10,
    }));
    expect(result.current.phase).toBe("editing");
    expect(result.current.draft.instruction).toBe("Preserve o logo.");
    expect(result.current.pendingOutputId).toBe("child-after-confirm");
  });

  it("blocks review when a refine has no content", async () => {
    const { result } = renderReview();
    await act(async () => result.current.review());
    expect(result.current.phase).toBe("editing");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
  });

  it("keeps the local text on a CAS conflict", async () => {
    mocks.save.mockRejectedValue(httpError(409, "review_conflict"));
    const { result } = renderReview();
    await act(async () => result.current.update({ instruction: "Preserve o logo." }));
    await act(async () => result.current.flush());
    expect(result.current.error).toBeTruthy();
    expect(result.current.draft.instruction).toBe("Preserve o logo.");
  });

  it("serializes a later edit with the revision returned by the first save", async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    mocks.save.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    const { result } = renderReview();
    await act(async () => result.current.update({ instruction: "primeira" }));
    const firstFlush = act(async () => { await result.current.flush(); });
    await act(async () => result.current.update({ instruction: "segunda" }));
    await act(async () => { resolveFirst?.({ draft: { ...emptyDraft(), version: 1, revision: 1, revisionKey: REVISION_KEY }, revisionCreditCost: 10 }); });
    await firstFlush;
    await act(async () => result.current.flush());
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save.mock.calls[1][0]).toMatchObject({ expectedReviewRevision: 1 });
    expect(mocks.save.mock.calls[1][0].draft.instruction).toBe("segunda");
  });

  it("does not hydrate a refetched server draft over local edits", async () => {
    const { result, rerender } = renderReview();
    await act(async () => result.current.update({ instruction: "texto local" }));
    rerender({
      output: outputFixture({ reviewDraft: { ...emptyDraft(), instruction: "servidor", version: 1, revision: 3, revisionKey: REVISION_KEY } }),
      revisionCreditCost: 10,
    });
    expect(result.current.draft.instruction).toBe("texto local");
  });

  it("hydrates the saved draft on a fresh mount", () => {
    const { result } = renderReview({
      output: outputFixture({ reviewDraft: { ...emptyDraft(), instruction: "salvo antes", version: 1, revision: 2, revisionKey: REVISION_KEY } }),
    });
    expect(result.current.draft.instruction).toBe("salvo antes");
  });

  it("ignores a double confirm", async () => {
    let resolveGenerate: ((value: unknown) => void) | undefined;
    mocks.generate.mockImplementation(() => new Promise((resolve) => { resolveGenerate = resolve; }));
    const { result } = renderReview();
    await act(async () => result.current.update({ instruction: "Preserve o logo." }));
    await act(async () => result.current.review());
    const first = act(async () => { await result.current.confirm(); });
    await act(async () => { void result.current.confirm(); });
    await act(async () => { resolveGenerate?.({ output: outputFixture({ id: "child-1", parentOutputId: "output-1" }) }); });
    await first;
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it("follows the persisted child after an uncertain submission instead of generating again", async () => {
    const detail: CreativeWorkDetail = {
      work: { id: "work-1" } as CreativeWorkDetail["work"],
      outputs: [
        outputFixture(),
        outputFixture({
          id: CHILD_ID,
          parentOutputId: "output-1",
          revisionContext: {
            version: 1,
            sourceOutputId: "output-1",
            sourceOutputVersion: 1,
            reviewRevision: 1,
            action: "refine",
            targetFormat: "4:5",
            instruction: "Preserve o logo.",
            annotations: [],
            revisionAssetId: null,
          },
        }),
      ],
      sources: [],
      preparedPlan: null,
      carouselSlides: [],
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(creativeWorkKey("work-1"), detail);
    queryClient.setQueryDefaults(creativeWorkKey("work-1"), { queryFn: () => Promise.resolve(detail) });
    mocks.generate.mockRejectedValue(uncertainError());
    const { result } = renderReview({ queryClient });
    await act(async () => result.current.update({ instruction: "Preserve o logo." }));
    await act(async () => result.current.review());
    await act(async () => result.current.confirm());
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(result.current.pendingOutputId).toBe(CHILD_ID);
    expect(result.current.phase).toBe("editing");
  });

  it("retries an uncertain submission with the same revision key", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const empty: CreativeWorkDetail = {
      work: { id: "work-1" } as CreativeWorkDetail["work"],
      outputs: [outputFixture()],
      sources: [],
      preparedPlan: null,
      carouselSlides: [],
    };
    queryClient.setQueryData(creativeWorkKey("work-1"), empty);
    queryClient.setQueryDefaults(creativeWorkKey("work-1"), { queryFn: () => Promise.resolve(empty) });
    mocks.generate.mockRejectedValueOnce(uncertainError());
    const { result } = renderReview({ queryClient });
    await act(async () => result.current.update({ instruction: "Preserve o logo." }));
    await act(async () => result.current.review());
    await act(async () => result.current.confirm());
    expect(result.current.error).toBeTruthy();
    await act(async () => result.current.confirm());
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.generate.mock.calls[1][0].revisionKey).toBe(mocks.generate.mock.calls[0][0].revisionKey);
  });

  it("keeps the review plan on 402 and reports the payment problem", async () => {
    mocks.generate.mockRejectedValue(httpError(402));
    const { result } = renderReview();
    await act(async () => result.current.update({ instruction: "Preserve o logo." }));
    await act(async () => result.current.review());
    await act(async () => result.current.confirm());
    expect(result.current.error).toContain("Saldo insuficiente");
    await act(async () => result.current.confirm());
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.generate.mock.calls[1][0].revisionKey).toBe(mocks.generate.mock.calls[0][0].revisionKey);
  });

  it("requires a deliberate new draft after a terminal failure", async () => {
    mocks.generate.mockRejectedValue(httpError(502, "dispatch_failed"));
    const { result } = renderReview();
    await act(async () => result.current.update({ instruction: "Preserve o logo." }));
    await act(async () => result.current.review());
    await act(async () => result.current.confirm());
    expect(result.current.error).toBeTruthy();
    // The plan is gone: reviewing again saves a NEW draft/key first.
    mocks.save.mockResolvedValue({
      draft: { ...emptyDraft(), instruction: "Preserve o logo.", version: 1, revision: 2, revisionKey: "00000000-0000-4000-8000-00000000000b" },
      revisionCreditCost: 10,
    });
    await act(async () => result.current.review());
    await act(async () => result.current.confirm());
    expect(mocks.save.mock.calls[1][0].expectedReviewRevision).toBe(1);
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.generate.mock.calls[1][0].revisionKey).toBe("00000000-0000-4000-8000-00000000000b");
  });

  it("uploads an optional reference and blocks review while it is pending", async () => {
    mocks.uploadChatAttachment.mockImplementation(() => new Promise(() => undefined));
    const { result } = renderReview();
    const file = new File(["x"], "ref.png", { type: "image/png" });
    await act(async () => { void result.current.attachReference(file); });
    expect(result.current.referencePending).toBe(true);
    await act(async () => result.current.update({ instruction: "Preserve o logo." }));
    await act(async () => result.current.review());
    expect(result.current.phase).toBe("editing");
    expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => {
      mocks.uploadChatAttachment.mockResolvedValue({ assetId: "asset-9" });
    });
  });

  it("completes the reference upload and saves the draft with the asset", async () => {
    mocks.uploadChatAttachment.mockResolvedValue({ assetId: "asset-9" });
    const { result } = renderReview();
    const file = new File(["x"], "ref.png", { type: "image/png" });
    await act(async () => { await result.current.attachReference(file); });
    expect(result.current.draft.revisionAssetId).toBe("asset-9");
    expect(mocks.save).toHaveBeenCalled();
    expect(result.current.referencePending).toBe(false);
  });

  it("keeps the request when the reference upload fails", async () => {
    mocks.uploadChatAttachment.mockRejectedValue(new Error("Falha ao enviar imagem"));
    const { result } = renderReview();
    await act(async () => result.current.update({ instruction: "Preserve o logo." }));
    const file = new File(["x"], "ref.png", { type: "image/png" });
    await act(async () => { await result.current.attachReference(file); });
    expect(result.current.error).toBeTruthy();
    expect(result.current.draft.instruction).toBe("Preserve o logo.");
    expect(result.current.referencePending).toBe(false);
  });

  it("stops reviewing while the canonical cost is unknown", async () => {
    const { result } = renderReview({ revisionCreditCost: null });
    await act(async () => result.current.update({ instruction: "Preserve o logo." }));
    await act(async () => result.current.review());
    expect(result.current.phase).toBe("editing");
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("keeps each queued save's own CAS when a switch interleaves two operations", async () => {
    const deferredSaves = [deferred<unknown>(), deferred<unknown>()];
    let call = 0;
    mocks.save.mockImplementation(() => deferredSaves[call++]!.promise);
    const { result, rerender } = renderReview({ output: outputFixture({ id: "output-a" }) });

    await act(async () => result.current.update({ instruction: "A1" }));
    let flushA1!: Promise<unknown>;
    await act(async () => { flushA1 = result.current.flush(); });
    // A2 is ENQUEUED while A1 is still in flight (queued behind it).
    await act(async () => result.current.update({ instruction: "A2" }));
    let flushA2!: Promise<unknown>;
    await act(async () => { flushA2 = result.current.flush(); });

    // Switch to B, whose hydrated draft carries revision 7 — a poisoned CAS.
    rerender({
      output: outputFixture({ id: "output-b", reviewDraft: { ...emptyDraft(), instruction: "de B", version: 1, revision: 7, revisionKey: "00000000-0000-4000-8000-00000000000e" } }),
      revisionCreditCost: 10,
    });
    await act(async () => { deferredSaves[0]!.resolve({ draft: { ...emptyDraft(), version: 1, revision: 1, revisionKey: REVISION_KEY }, revisionCreditCost: 10 }); });
    await act(async () => { deferredSaves[1]!.resolve({ draft: { ...emptyDraft(), instruction: "A2", version: 1, revision: 2, revisionKey: "00000000-0000-4000-8000-00000000000f" }, revisionCreditCost: 10 }); });
    await act(async () => { await flushA1; await flushA2; });

    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ outputId: "output-a", expectedReviewRevision: 0 });
    // A2 must chain on A1's returned revision, never on B's revision 7.
    expect(mocks.save.mock.calls[1][0]).toMatchObject({ outputId: "output-a", expectedReviewRevision: 1 });
    expect(mocks.save.mock.calls[1][0].draft.instruction).toBe("A2");
  });

  it("drops the pending debounce of the old session when switching before it fires", async () => {
    mocks.save.mockResolvedValue({
      draft: { ...emptyDraft(), version: 1, revision: 1, revisionKey: REVISION_KEY },
      revisionCreditCost: 10,
    });
    const { result, rerender } = renderReview({ output: outputFixture({ id: "output-a" }) });
    await act(async () => result.current.update({ instruction: "só da peça A" }));
    // Switch BEFORE the debounce fires.
    rerender({ output: outputFixture({ id: "output-b" }), revisionCreditCost: 10 });
    await act(async () => { await result.current.flush(); });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(result.current.draft.instruction).toBe("");
  });

  it("rehydrates text and revision together on a clean same-output refetch", async () => {
    const { result, rerender } = renderReview();
    await act(async () => result.current.update({ instruction: "texto local" }));
    await act(async () => result.current.flush());
    // Same id, clean local state: the server now holds revision 3 from elsewhere.
    const newer = outputFixture({
      reviewDraft: { ...emptyDraft(), instruction: "servidor revision 3", version: 1, revision: 3, revisionKey: "00000000-0000-4000-8000-0000000000d1" },
    });
    rerender({ output: newer, revisionCreditCost: 10 });
    expect(result.current.draft.instruction).toBe("servidor revision 3");

    await act(async () => result.current.review());
    expect(mocks.save).toHaveBeenCalledTimes(1); // only the earlier local save
    await act(async () => result.current.confirm());
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ reviewRevision: 3, revisionKey: "00000000-0000-4000-8000-0000000000d1" }));

    // Next edit saves on top of revision 3.
    mocks.save.mockResolvedValue({
      draft: { ...emptyDraft(), instruction: "editado", version: 1, revision: 4, revisionKey: "00000000-0000-4000-8000-0000000000d2" },
      revisionCreditCost: 10,
    });
    await act(async () => result.current.update({ instruction: "editado" }));
    await act(async () => result.current.review());
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save.mock.calls[1][0]).toMatchObject({ expectedReviewRevision: 3 });
  });

  it("reviews a hydrated saved draft on fresh mount without resaving", async () => {
    const savedDraft = { ...emptyDraft(), instruction: "já salvo", version: 1, revision: 2, revisionKey: REVISION_KEY };
    const { result } = renderReview({ output: outputFixture({ reviewDraft: savedDraft }) });
    await act(async () => result.current.review());
    expect(result.current.phase).toBe("reviewing");
    expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => result.current.confirm());
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      outputId: "output-1",
      reviewRevision: 2,
      revisionKey: REVISION_KEY,
    }));
  });

  it("saves an edit on top of the hydrated revision with the expected CAS", async () => {
    const savedDraft = { ...emptyDraft(), instruction: "já salvo", version: 1, revision: 2, revisionKey: REVISION_KEY };
    mocks.save.mockResolvedValue({
      draft: { ...emptyDraft(), instruction: "editado", version: 1, revision: 3, revisionKey: "00000000-0000-4000-8000-00000000000c" },
      revisionCreditCost: 10,
    });
    const { result } = renderReview({ output: outputFixture({ reviewDraft: savedDraft }) });
    await act(async () => result.current.update({ instruction: "editado" }));
    await act(async () => result.current.review());
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ expectedReviewRevision: 2 });
    await act(async () => result.current.confirm());
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      reviewRevision: 3,
      revisionKey: "00000000-0000-4000-8000-00000000000c",
    }));
  });

  it("lands a deferred save on the output it was written for after a switch", async () => {
    let resolveSave: ((value: unknown) => void) | undefined;
    mocks.save.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    const { result, rerender } = renderReview({ output: outputFixture({ id: "output-a" }) });
    await act(async () => result.current.update({ instruction: "texto da peça A" }));
    let flushPromise!: Promise<unknown>;
    await act(async () => { flushPromise = result.current.flush(); });
    // Switch to piece B while A's save is still in flight.
    rerender({ output: outputFixture({ id: "output-b" }), revisionCreditCost: 10 });
    await act(async () => { resolveSave?.({ draft: { ...emptyDraft(), version: 1, revision: 1, revisionKey: REVISION_KEY }, revisionCreditCost: 10 }); });
    await act(async () => { await flushPromise; });
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.save.mock.calls[0][0].outputId).toBe("output-a");
    expect(mocks.save.mock.calls[0][0].draft.instruction).toBe("texto da peça A");
  });

  it("never reviews a stale revision after a failed autosave of newer text", async () => {
    // X saves fine; every later autosave fails persistently.
    mocks.save.mockResolvedValueOnce({
      draft: { ...emptyDraft(), instruction: "texto X", version: 1, revision: 1, revisionKey: REVISION_KEY },
      revisionCreditCost: 10,
    });
    const { result } = renderReview();
    await act(async () => result.current.update({ instruction: "texto X" }));
    await act(async () => result.current.flush());
    expect(mocks.save).toHaveBeenCalledTimes(1);

    mocks.save.mockRejectedValue(httpError(500));
    await act(async () => result.current.update({ instruction: "texto Y" }));
    await act(async () => result.current.flush());
    await act(async () => result.current.review());
    expect(result.current.phase).toBe("editing");
    expect(result.current.error).toBeTruthy();
    expect(result.current.draft.instruction).toBe("texto Y");
    await act(async () => result.current.confirm());
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
