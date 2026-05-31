import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUploadAsset } from "./use-assets";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function mockXhrFactory(captured: { formData: FormData | null }) {
  return class MockXHR {
    open = vi.fn();
    send = vi.fn((body: unknown) => {
      captured.formData = body as FormData;
      setTimeout(() => {
        Object.assign(this, { readyState: 4, status: 200 });
        Object.defineProperty(this, "responseText", {
          value: JSON.stringify({
            asset: {
              id: "asset-1",
              campaignId: "camp-1",
              role: "base",
            },
          }),
          writable: true,
        });
        if (this.onload) this.onload({} as ProgressEvent);
      }, 0);
    });
    setRequestHeader = vi.fn();
    readyState = 0;
    status = 0;
    statusText = "OK";
    responseText = "";
    upload = { onprogress: null as ((evt: ProgressEvent) => void) | null };
    getResponseHeader = vi.fn(() => "application/json");
    onload: ((this: XMLHttpRequest, ev: ProgressEvent) => void) | null = null;
    onerror: ((this: XMLHttpRequest, ev: ProgressEvent) => void) | null = null;
    onabort: ((this: XMLHttpRequest, ev: ProgressEvent) => void) | null = null;
    ontimeout: ((this: XMLHttpRequest, ev: ProgressEvent) => void) | null = null;
  } as unknown as typeof XMLHttpRequest;
}

describe("useUploadAsset", () => {
  const originalXHR = global.XMLHttpRequest;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes role in form data when provided", async () => {
    const captured = { formData: null as FormData | null };
    global.XMLHttpRequest = mockXhrFactory(captured);

    const { result } = renderHook(() => useUploadAsset("camp-1"), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      file: new File(["x"], "test.png", { type: "image/png" }),
      width: 1024,
      height: 768,
      role: "base",
    });

    expect(captured.formData).not.toBeNull();
    expect(captured.formData!.get("role")).toBe("base");
    expect(captured.formData!.get("width")).toBe("1024");
    expect(captured.formData!.get("height")).toBe("768");

    global.XMLHttpRequest = originalXHR;
  });

  it("omits role from form data when not provided", async () => {
    const captured = { formData: null as FormData | null };
    global.XMLHttpRequest = mockXhrFactory(captured);

    const { result } = renderHook(() => useUploadAsset("camp-1"), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      file: new File(["x"], "test.png", { type: "image/png" }),
    });

    expect(captured.formData).not.toBeNull();
    expect(captured.formData!.has("role")).toBe(false);

    global.XMLHttpRequest = originalXHR;
  });
});
