import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ apiFetch }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string, values?: { seconds?: number }) => key === "recording" ? `Recording ${values?.seconds ?? 0}` : key }));

class FakeMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  state: RecordingState = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["audio"], { type: this.mimeType }) } as BlobEvent); this.onstop?.(); }
}

import VoiceInputButton, { appendTranscript } from "./VoiceInputButton";

describe("VoiceInputButton", () => {
  const stopTrack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] })) } });
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ text: "Texto ditado" }), { status: 200, headers: { "content-type": "application/json" } }));
  });
  afterEach(() => vi.useRealTimers());

  it("appends without replacing existing text", () => {
    expect(appendTranscript("Texto atual", "Texto ditado", 100)).toBe("Texto atual Texto ditado");
    expect(appendTranscript("", "Texto ditado", 5)).toBe("Texto");
  });

  it("records, transcribes once, and reports busy state", async () => {
    const onTranscript = vi.fn();
    const onBusyChange = vi.fn();
    render(<VoiceInputButton onTranscript={onTranscript} onBusyChange={onBusyChange} />);
    fireEvent.click(await screen.findByRole("button", { name: "start" }));
    expect(await screen.findByRole("button", { name: "stop" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "stop" }));
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("Texto ditado"));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch.mock.calls[0][1]).toMatchObject({ method: "POST", timeoutMs: 60_000 });
    expect(apiFetch.mock.calls[0][1].body).toBeInstanceOf(FormData);
    expect(stopTrack).toHaveBeenCalled();
    expect(onBusyChange).toHaveBeenCalledWith(true);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it("stops automatically after 60 seconds", async () => {
    vi.useFakeTimers();
    render(<VoiceInputButton onTranscript={vi.fn()} />);
    await act(() => vi.runAllTicks());
    fireEvent.click(screen.getByRole("button", { name: "start" }));
    await act(async () => undefined);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps text ownership on permission or transcription errors", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new Error("denied"));
    const onTranscript = vi.fn();
    render(<VoiceInputButton onTranscript={onTranscript} />);
    fireEvent.click(await screen.findByRole("button", { name: "start" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("permissionError");
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("hides unsupported recording and cleans up mounted or late streams", async () => {
    vi.stubGlobal("MediaRecorder", undefined);
    const unsupported = render(<VoiceInputButton onTranscript={vi.fn()} />);
    await act(async () => undefined);
    expect(unsupported.container).toBeEmptyDOMElement();
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    let resolveStream!: (stream: MediaStream) => void;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValueOnce(new Promise<MediaStream>((resolve) => { resolveStream = resolve; }));
    const view = render(<VoiceInputButton onTranscript={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "start" }));
    view.unmount();
    await act(async () => resolveStream({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream));
    expect(stopTrack).toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
