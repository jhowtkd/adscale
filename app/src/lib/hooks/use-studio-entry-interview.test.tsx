import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatEntryRequestTemplate } from "@/lib/studio/entry-request-template";
import type { EntryContext } from "@/lib/studio/entry-types";
import { useStudioEntryInterview } from "./use-studio-entry-interview";

vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

const PROFILE_A = "11111111-1111-4111-8111-111111111111";
const PROFILE_B = "22222222-2222-4222-8222-222222222222";

const richContext: EntryContext = {
  protocol: "single",
  offer: "imersão NR-1",
  audience: null,
  tone: "institucional",
  protocolCandidates: ["single"],
  offerCandidates: ["imersão NR-1"],
  audienceCandidates: ["dentistas"],
  toneCandidates: ["institucional"],
  workCount: 3,
};

function wrapperWith(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderInterview(
  queryClient: QueryClient,
  overrides: Partial<Parameters<typeof useStudioEntryInterview>[0]> = {},
) {
  const setRequest = vi.fn();
  const recordStudioEvent = vi.fn();
  const input = {
    enabled: true,
    clientProfileId: PROFILE_A,
    request: "",
    hasAttachment: false,
    carouselEnabled: false,
    locale: "pt-BR" as const,
    setRequest,
    recordStudioEvent,
    requestFocused: false,
    ...overrides,
  };
  const hook = renderHook(
    (props: typeof input) => useStudioEntryInterview(props),
    { wrapper: wrapperWith(queryClient), initialProps: input },
  );
  return { ...hook, setRequest, recordStudioEvent, input };
}

function mockEntryContext(context: EntryContext | "error") {
  mockApiFetch.mockImplementation(async (url) => {
    if (String(url).includes("/entry-context")) {
      if (context === "error") {
        return { ok: false, status: 500, json: async () => ({}) } as Response;
      }
      return { ok: true, json: async () => context } as Response;
    }
    throw new Error(`Unexpected apiFetch url: ${url}`);
  });
}

describe("useStudioEntryInterview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not fetch when disabled and returns empty chips", () => {
    const queryClient = createQueryClient();
    const { result } = renderInterview(queryClient, { enabled: false });

    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(result.current.chips).toEqual([]);
  });

  it("shows generic chips on GET 500 without writing request until a chip is selected", async () => {
    mockEntryContext("error");
    const queryClient = createQueryClient();
    const { result, setRequest } = renderInterview(queryClient);

    await waitFor(() => {
      expect(result.current.chips.map((chip) => chip.slot)).toEqual(["protocol", "offer", "audience"]);
    });
    expect(result.current.usedFallback).toBe(true);
    expect(setRequest).not.toHaveBeenCalled();

    act(() => {
      result.current.selectChip("offer", "launch");
    });
    expect(setRequest).toHaveBeenCalled();
  });

  it("writes the template on successful context load when request is empty and unfocused", async () => {
    mockEntryContext(richContext);
    const queryClient = createQueryClient();
    const { result, setRequest, recordStudioEvent } = renderInterview(queryClient);

    const expectedTemplate = formatEntryRequestTemplate(
      {
        protocol: "single",
        offer: "imersão NR-1",
        audience: null,
        tone: "institucional",
      },
      "pt-BR",
    );

    await waitFor(() => {
      expect(setRequest).toHaveBeenCalledWith(expectedTemplate);
    });
    expect(recordStudioEvent).toHaveBeenCalledWith("studio_entry_request_written", {
      requestSource: "template",
    });
    expect(result.current.suggestedProtocol).toBe("single");
    expect(result.current.pendingProtocol).toBe(false);
  });

  it("aborts an in-flight POST when a new chip is selected and applies the template immediately", async () => {
    mockApiFetch.mockImplementation(async (url, init) => {
      if (String(url).includes("/entry-context")) {
        return { ok: true, json: async () => richContext } as Response;
      }
      if (String(url).includes("/entry-request")) {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("Aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      }
      throw new Error(`Unexpected apiFetch url: ${url}`);
    });

    const queryClient = createQueryClient();
    const { result, setRequest } = renderInterview(queryClient);
    await waitFor(() => expect(result.current.usedFallback).toBe(false));
    setRequest.mockClear();

    act(() => {
      result.current.selectChip("audience", "dentistas");
    });

    const audienceTemplate = formatEntryRequestTemplate(
      {
        protocol: "single",
        offer: "imersão NR-1",
        audience: "dentistas",
        tone: "institucional",
      },
      "pt-BR",
    );
    expect(setRequest).toHaveBeenCalledWith(audienceTemplate);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });

    const postCall = mockApiFetch.mock.calls.find(([url]) => String(url).includes("/entry-request"));
    const firstSignal = postCall?.[1]?.signal as AbortSignal | undefined;
    expect(firstSignal).toBeDefined();

    act(() => {
      result.current.selectChip("offer", "launch");
    });

    const offerTemplate = formatEntryRequestTemplate(
      {
        protocol: "single",
        offer: "launch",
        audience: "dentistas",
        tone: "institucional",
      },
      "pt-BR",
    );
    expect(setRequest).toHaveBeenLastCalledWith(offerTemplate);
    expect(firstSignal?.aborted).toBe(true);
  });

  it("ignores a late-resolving POST for a superseded chip selection", async () => {
    let resolveFirstPost: ((value: Response) => void) | undefined;
    const firstPostPromise = new Promise<Response>((resolve) => {
      resolveFirstPost = resolve;
    });
    let postCallCount = 0;

    mockApiFetch.mockImplementation(async (url) => {
      if (String(url).includes("/entry-context")) {
        return { ok: true, json: async () => richContext } as Response;
      }
      if (String(url).includes("/entry-request")) {
        postCallCount += 1;
        if (postCallCount === 1) {
          return firstPostPromise;
        }
        return {
          ok: true,
          json: async () => ({ sentence: "Model sentence from chip B.", requestSource: "model" }),
        } as Response;
      }
      throw new Error(`Unexpected apiFetch url: ${url}`);
    });

    const queryClient = createQueryClient();
    const { result, setRequest, recordStudioEvent } = renderInterview(queryClient);
    await waitFor(() => expect(result.current.usedFallback).toBe(false));
    setRequest.mockClear();
    recordStudioEvent.mockClear();

    act(() => {
      result.current.selectChip("audience", "dentistas");
    });
    expect(recordStudioEvent).toHaveBeenCalledTimes(1);
    expect(recordStudioEvent).toHaveBeenCalledWith("studio_entry_chip_selected", { slot: "audience" });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });

    const audienceTemplate = formatEntryRequestTemplate(
      {
        protocol: "single",
        offer: "imersão NR-1",
        audience: "dentistas",
        tone: "institucional",
      },
      "pt-BR",
    );
    expect(setRequest).toHaveBeenLastCalledWith(audienceTemplate);

    act(() => {
      result.current.selectChip("offer", "launch");
    });
    expect(recordStudioEvent).toHaveBeenCalledTimes(2);
    expect(recordStudioEvent).toHaveBeenLastCalledWith("studio_entry_chip_selected", { slot: "offer" });

    const offerTemplate = formatEntryRequestTemplate(
      {
        protocol: "single",
        offer: "launch",
        audience: "dentistas",
        tone: "institucional",
      },
      "pt-BR",
    );
    expect(setRequest).toHaveBeenLastCalledWith(offerTemplate);
    const callsAfterChipB = setRequest.mock.calls.length;

    await act(async () => {
      resolveFirstPost?.({
        ok: true,
        json: async () => ({ sentence: "Model sentence from chip A.", requestSource: "model" }),
      } as Response);
      await new Promise((resolve) => setTimeout(resolve, 450));
    });

    expect(setRequest).not.toHaveBeenCalledWith("Model sentence from chip A.");
    expect(setRequest.mock.calls.length).toBeGreaterThanOrEqual(callsAfterChipB);
    if (setRequest.mock.calls.length > callsAfterChipB) {
      expect(setRequest).toHaveBeenLastCalledWith("Model sentence from chip B.");
    } else {
      expect(setRequest).toHaveBeenLastCalledWith(offerTemplate);
    }
  });

  it("preserves the request when focused and a late POST completes", async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (String(url).includes("/entry-context")) {
        return { ok: true, json: async () => richContext } as Response;
      }
      if (String(url).includes("/entry-request")) {
        return {
          ok: true,
          json: async () => ({ sentence: "Model sentence from server.", requestSource: "model" }),
        } as Response;
      }
      throw new Error(`Unexpected apiFetch url: ${url}`);
    });

    const queryClient = createQueryClient();
    const { result, setRequest, recordStudioEvent } = renderInterview(queryClient, {
      requestFocused: true,
    });

    await waitFor(() => expect(result.current.usedFallback).toBe(false));
    expect(setRequest).not.toHaveBeenCalled();

    act(() => {
      result.current.selectChip("audience", "dentistas");
    });

    const callsBeforePost = setRequest.mock.calls.length;

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });

    await waitFor(() => {
      expect(recordStudioEvent).toHaveBeenCalledWith("studio_entry_request_preserved");
    });
    expect(setRequest.mock.calls.length).toBe(callsBeforePost);
    expect(setRequest).not.toHaveBeenCalledWith("Model sentence from server.");
  });

  it("ignores a late-resolving POST after clientProfileId changes", async () => {
    let resolveProfileAPost: ((value: Response) => void) | undefined;
    const profileAPostPromise = new Promise<Response>((resolve) => {
      resolveProfileAPost = resolve;
    });
    let postCallCount = 0;

    mockApiFetch.mockImplementation(async (url) => {
      if (String(url).includes("/entry-context")) {
        return { ok: true, json: async () => richContext } as Response;
      }
      if (String(url).includes("/entry-request")) {
        postCallCount += 1;
        if (postCallCount === 1) {
          return profileAPostPromise;
        }
        return {
          ok: true,
          json: async () => ({ sentence: "Model sentence from profile B.", requestSource: "model" }),
        } as Response;
      }
      throw new Error(`Unexpected apiFetch url: ${url}`);
    });

    const queryClient = createQueryClient();
    const { result, setRequest, recordStudioEvent, rerender, input } = renderInterview(queryClient);
    await waitFor(() => expect(result.current.usedFallback).toBe(false));
    setRequest.mockClear();
    recordStudioEvent.mockClear();

    act(() => {
      result.current.selectChip("audience", "dentistas");
    });
    expect(recordStudioEvent).toHaveBeenCalledWith("studio_entry_chip_selected", { slot: "audience" });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });

    const audienceTemplate = formatEntryRequestTemplate(
      {
        protocol: "single",
        offer: "imersão NR-1",
        audience: "dentistas",
        tone: "institucional",
      },
      "pt-BR",
    );
    expect(setRequest).toHaveBeenLastCalledWith(audienceTemplate);
    const callsBeforeSwitch = setRequest.mock.calls.length;

    rerender({ ...input, clientProfileId: PROFILE_B });
    mockEntryContext(richContext);

    await waitFor(() => {
      expect(result.current.answers).toEqual({});
    });

    await act(async () => {
      resolveProfileAPost?.({
        ok: true,
        json: async () => ({ sentence: "Model sentence from profile A.", requestSource: "model" }),
      } as Response);
      await new Promise((resolve) => setTimeout(resolve, 450));
    });

    expect(setRequest).not.toHaveBeenCalledWith("Model sentence from profile A.");
    expect(setRequest.mock.calls.length).toBeGreaterThanOrEqual(callsBeforeSwitch);
  });

  it("clears answers when clientProfileId changes", async () => {
    mockEntryContext(richContext);
    const queryClient = createQueryClient();
    const { result, rerender, input } = renderInterview(queryClient);

    await waitFor(() => expect(result.current.usedFallback).toBe(false));

    act(() => {
      result.current.selectChip("audience", "dentistas");
    });
    expect(result.current.answers.audience).toBe("dentistas");

    rerender({ ...input, clientProfileId: PROFILE_B });
    mockEntryContext(richContext);

    await waitFor(() => {
      expect(result.current.answers).toEqual({});
    });
  });

  it("records protocol answers without depending on useCreativeComposer", async () => {
    mockEntryContext({
      protocol: null,
      offer: null,
      audience: null,
      tone: null,
      protocolCandidates: [],
      offerCandidates: [],
      audienceCandidates: [],
      toneCandidates: [],
      workCount: 0,
    });
    const queryClient = createQueryClient();
    const { result } = renderInterview(queryClient);

    await waitFor(() => expect(result.current.chips.some((chip) => chip.slot === "protocol")).toBe(true));

    act(() => {
      result.current.selectChip("protocol", "variations");
    });

    expect(result.current.answeredProtocol).toBe("variations");
    expect(result.current.pendingProtocol).toBe(false);
  });
});
