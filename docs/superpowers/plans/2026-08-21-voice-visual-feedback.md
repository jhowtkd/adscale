# Voice and Visual Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ditado por voz aos campos de feedback aprovados e permitir que uma revisão de Creative Work seja orientada por até cinco áreas comentadas sobre o output.

**Architecture:** O áudio é gravado com `MediaRecorder`, transcrito por uma rota autenticada usando o SDK OpenAI já instalado e devolvido como texto editável. As marcações ficam locais, são compiladas numa imagem PNG numerada e numa instrução textual, e entram no `reviseOutput` canônico como o anexo opcional já suportado.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Testing Library, Canvas API, MediaRecorder API, OpenAI Node SDK 6.34, next-intl.

**Spec:** `docs/superpowers/specs/2026-08-21-voice-visual-feedback-design.md`

## Global Constraints

- Não adicionar dependência, tabela, migration, repositório ou pipeline de geração.
- Áudio: no máximo 60 segundos no cliente e 10 MB no servidor; nunca persistir áudio ou transcrição.
- MIME permitido: `audio/webm`, `audio/mp4`, `audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/ogg`.
- Transcrição: `gpt-4o-mini-transcribe`, `language: "pt"`, resposta com até 4.000 caracteres.
- Marcações: no máximo cinco por output, comentário com até 300 caracteres, desenho apenas em desktop.
- Revisão: uma única chamada canônica, custo visível de 5 créditos, rascunho limpo somente quando `reviseOutput` retornar `true`.
- Testes automatizados devem mockar OpenAI e não podem fazer chamada paga real.
- Executar em worktree isolado criado pelo skill `superpowers:using-git-worktrees`; o checkout principal contém WIP alheio.
- Fazer stage somente dos caminhos citados em cada tarefa; nunca usar `git add -A`.

## File Structure

- `app/src/app/api/feedback/transcribe/route.ts`: trust boundary do áudio e chamada única ao SDK.
- `app/src/components/ui/VoiceInputButton.tsx`: permissão, gravação, timer, upload e estados acessíveis.
- `app/src/components/creative-work/output-annotation.ts`: validação local, instrução numerada e PNG anotado.
- `FeedbackModal`, `CreativeResultCard` e `CreativeAnnotationEditor`: permanecem donos dos respectivos textos e apenas recebem transcrições.
- `CreativeProposalGrid`: permanece dono do output selecionado e passa a guardar os rascunhos de marcação por `outputId`.
- `useCreativeComposer.reviseOutput`: continua dono de upload, idempotência e erro; passa a informar sucesso por `Promise<boolean>`.

---

### Task 1: Authenticated Feedback Transcription Route

**Files:**
- Create: `app/src/app/api/feedback/transcribe/route.ts`
- Test: `app/src/app/api/feedback/transcribe/route.test.ts`

**Interfaces:**
- Consumes: `requireWorkspaceAccess(request)`, `checkRateLimit(request, { category: "ai", workspaceId })`, `getOpenAI()` and `apiError`/`handleApiError`.
- Produces: `POST /api/feedback/transcribe` accepting `FormData.file: File` and returning `{ text: string }`.

- [ ] **Step 1: Write the failing route tests**

Create the test with hoisted mocks and real multipart requests:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireWorkspaceAccess: vi.fn(async () => ({
    user: { id: "user-1" },
    workspace: { id: "workspace-1" },
  })),
  checkRateLimit: vi.fn(async (): Promise<Response | null> => null),
  createTranscription: vi.fn(async () => ({ text: "  Texto ditado.  " })),
}));

vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess: mocks.requireWorkspaceAccess }));
vi.mock("@/lib/with-rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/api-response", () => ({
  apiError: vi.fn((code: string, status: number) => Response.json({ code }, { status })),
  handleApiError: vi.fn(() => Response.json({ code: "internalError" }, { status: 500 })),
}));
vi.mock("@/server/ai/utils", () => ({
  getOpenAI: () => ({ audio: { transcriptions: { create: mocks.createTranscription } } }),
}));

import { POST } from "./route";

function requestWithFile(content: BlobPart = "audio", type = "audio/webm") {
  const form = new FormData();
  form.set("file", new File([content], "feedback.webm", { type }));
  return new Request("http://localhost/api/feedback/transcribe", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/feedback/transcribe", () => {
  beforeEach(() => vi.clearAllMocks());

  it("transcribes an allowed workspace-scoped audio file", async () => {
    const response = await POST(requestWithFile());
    expect(response.status).toBe(200);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      { category: "ai", workspaceId: "workspace-1" },
    );
    expect(mocks.createTranscription).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-4o-mini-transcribe",
      language: "pt",
      response_format: "json",
    }));
    await expect(response.json()).resolves.toEqual({ text: "Texto ditado." });
  });

  it("accepts browser codec parameters after normalizing the base MIME", async () => {
    expect((await POST(requestWithFile("audio", "audio/webm;codecs=opus"))).status).toBe(200);
  });

  it.each(["text/plain", "application/octet-stream"])("rejects %s", async (type) => {
    const response = await POST(requestWithFile("not audio", type));
    expect(response.status).toBe(400);
    expect(mocks.createTranscription).not.toHaveBeenCalled();
  });

  it("rejects empty audio", async () => {
    expect((await POST(requestWithFile(""))).status).toBe(400);
  });

  it("rejects audio larger than 10 MB", async () => {
    const tooLarge = new Uint8Array(10 * 1024 * 1024 + 1);
    expect((await POST(requestWithFile(tooLarge))).status).toBe(413);
    expect(mocks.createTranscription).not.toHaveBeenCalled();
  });

  it("returns 422 when no speech is recognized", async () => {
    mocks.createTranscription.mockResolvedValueOnce({ text: "   " });
    expect((await POST(requestWithFile())).status).toBe(422);
  });

  it("returns rate limiting before the provider call", async () => {
    mocks.checkRateLimit.mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect((await POST(requestWithFile())).status).toBe(429);
    expect(mocks.createTranscription).not.toHaveBeenCalled();
  });

  it("returns a generic error when transcription fails", async () => {
    mocks.createTranscription.mockRejectedValueOnce(new Error("provider secret"));
    const response = await POST(requestWithFile());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ code: "internalError" });
  });
});
```

- [ ] **Step 2: Run the route test and verify it fails**

Run from the repository root; every command below keeps that working directory:

```bash
npm --prefix app test -- --run src/app/api/feedback/transcribe/route.test.ts
```

Expected: FAIL because `./route` does not exist.

- [ ] **Step 3: Write the minimal route**

```ts
import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { getOpenAI } from "@/server/ai/utils";
import { requireWorkspaceAccess } from "@/server/auth/workspace";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm", "audio/mp4", "audio/mpeg",
  "audio/wav", "audio/x-wav", "audio/ogg",
]);

export async function POST(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const limited = await checkRateLimit(request, { category: "ai", workspaceId: workspace.id });
    if (limited) return limited;

    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || file.size === 0) return apiError("invalidAudio", 400);
    if (file.size > MAX_AUDIO_BYTES) return apiError("audioTooLarge", 413);
    const baseType = file.type.toLowerCase().split(";", 1)[0];
    if (!ALLOWED_AUDIO_TYPES.has(baseType)) return apiError("unsupportedAudioType", 400);

    const result = await getOpenAI().audio.transcriptions.create({
      file,
      model: "gpt-4o-mini-transcribe",
      language: "pt",
      response_format: "json",
    });
    const text = result.text.trim().slice(0, 4_000);
    if (!text) return apiError("noSpeechRecognized", 422);
    return NextResponse.json({ text });
  } catch (error) {
    return handleApiError(error, "feedback.transcribe.POST");
  }
}
```

Do not add logging of the file, provider response, or transcript.

- [ ] **Step 4: Run the focused route test**

```bash
npm --prefix app test -- --run src/app/api/feedback/transcribe/route.test.ts
```

Expected: the test file passes and every provider call is mocked.

- [ ] **Step 5: Commit the route**

```bash
git add -- app/src/app/api/feedback/transcribe/route.ts app/src/app/api/feedback/transcribe/route.test.ts
git commit -m "feat: add feedback audio transcription route"
```

---

### Task 2: Reusable Voice Input Button

**Files:**
- Create: `app/src/components/ui/VoiceInputButton.tsx`
- Test: `app/src/components/ui/VoiceInputButton.test.tsx`
- Modify: `app/messages/pt-BR.json:3300`
- Modify: `app/messages/en.json:3270`

**Interfaces:**
- Consumes: `apiFetch`, `navigator.mediaDevices.getUserMedia`, `MediaRecorder`, and `feedback.voice` translations.
- Produces: `VoiceInputButton({ onTranscript, onBusyChange?, disabled? })` and `appendTranscript(current, transcript, maxLength)`.

- [ ] **Step 1: Write failing component and helper tests**

Use a deterministic recorder and mocked route:

```tsx
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ apiFetch }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { seconds?: number }) =>
    key === "recording" ? `Recording ${values?.seconds ?? 0}` : key,
}));

class FakeMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  state: RecordingState = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["audio"], { type: this.mimeType }) } as BlobEvent);
    this.onstop?.();
  }
}

import VoiceInputButton, { appendTranscript } from "./VoiceInputButton";

describe("VoiceInputButton", () => {
  const stopTrack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] })) },
    });
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ text: "Texto ditado" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
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
    expect(screen.getByRole("button", { name: "stop" })).toHaveAttribute("aria-pressed", "true");
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
    fireEvent.click(await screen.findByRole("button", { name: "start" }));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("emits no transcript when permission fails", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(new Error("denied"));
    const onTranscript = vi.fn();
    render(<VoiceInputButton onTranscript={onTranscript} />);
    fireEvent.click(await screen.findByRole("button", { name: "start" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("permissionError");
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("shows a retryable error when transcription fails", async () => {
    apiFetch.mockResolvedValueOnce(new Response(null, { status: 500 }));
    const onTranscript = vi.fn();
    render(<VoiceInputButton onTranscript={onTranscript} />);

    fireEvent.click(await screen.findByRole("button", { name: "start" }));
    fireEvent.click(screen.getByRole("button", { name: "stop" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("transcriptionError");

    fireEvent.click(screen.getByRole("button", { name: "start" }));
    fireEvent.click(await screen.findByRole("button", { name: "stop" }));
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("Texto ditado"));
  });

  it("hides itself when recording is unsupported", async () => {
    vi.stubGlobal("MediaRecorder", undefined);
    const view = render(<VoiceInputButton onTranscript={vi.fn()} />);
    await act(async () => undefined);
    expect(view.container).toBeEmptyDOMElement();
  });

  it("discards a recording when the control unmounts", async () => {
    const view = render(<VoiceInputButton onTranscript={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "start" }));
    view.unmount();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalled();
  });

  it("stops a late permission stream after unmount", async () => {
    let resolveStream!: (stream: MediaStream) => void;
    const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValueOnce(
      new Promise<MediaStream>((resolve) => { resolveStream = resolve; }),
    );
    const view = render(<VoiceInputButton onTranscript={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "start" }));
    view.unmount();
    await act(async () => resolveStream(stream));
    expect(stopTrack).toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the component test and verify it fails**

```bash
npm --prefix app test -- --run src/components/ui/VoiceInputButton.test.tsx
```

Expected: FAIL because `VoiceInputButton.tsx` does not exist.

- [ ] **Step 3: Write the minimal component**

Use one recorder, one hard stop, and one cleanup path. Keep this public interface:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

export type VoiceInputButtonProps = {
  onTranscript: (text: string) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
};

export function appendTranscript(current: string, transcript: string, maxLength: number) {
  return [current.trimEnd(), transcript.trim()].filter(Boolean).join(" ").slice(0, maxLength);
}

function extensionFor(type: string) {
  if (type.includes("mp4")) return "m4a";
  if (type.includes("mpeg")) return "mp3";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  return "webm";
}

export default function VoiceInputButton({ onTranscript, onBusyChange, disabled = false }: VoiceInputButtonProps) {
  const t = useTranslations("feedback.voice");
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<"idle" | "recording" | "transcribing" | "error">("idle");
  const [seconds, setSeconds] = useState(0);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mountedRef = useRef(true);
  const busy = state === "recording" || state === "transcribing";

  useEffect(() => {
    setSupported(Boolean(globalThis.MediaRecorder && navigator.mediaDevices?.getUserMedia));
  }, []);
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  useEffect(() => {
    if (state !== "recording") return;
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1_000);
    const timeout = window.setTimeout(() => recorderRef.current?.stop(), 60_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [state]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (recorderRef.current) recorderRef.current.onstop = null;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function transcribe(blob: Blob) {
    setState("transcribing");
    try {
      const type = blob.type || "audio/webm";
      const form = new FormData();
      form.set("file", new File([blob], `feedback.${extensionFor(type)}`, { type }));
      const response = await apiFetch("/api/feedback/transcribe", {
        method: "POST",
        body: form,
        timeoutMs: 60_000,
      });
      if (!response.ok) throw new Error("transcription_failed");
      const body = await response.json() as { text: string };
      onTranscript(body.text);
      setErrorKey(null);
      setState("idle");
    } catch {
      setErrorKey("transcriptionError");
      setState("error");
    }
  }

  async function start() {
    try {
      setSeconds(0);
      setErrorKey(null);
      chunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const preferred = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined;
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        void transcribe(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      };
      recorder.start();
      setState("recording");
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setErrorKey("permissionError");
      setState("error");
    }
  }

  if (!supported) return null;
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-pressed={state === "recording"}
        aria-label={t(state === "recording" ? "stop" : "start")}
        disabled={(disabled && state !== "recording") || state === "transcribing"}
        onClick={() => state === "recording" ? recorderRef.current?.stop() : void start()}
      >
        {state === "recording" ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" />}
        {state === "recording" ? t("recording", { seconds }) : t("start")}
      </Button>
      <span aria-live="polite" className="text-xs text-[var(--text-muted)]">
        {state === "transcribing" ? t("transcribing") : null}
      </span>
      {errorKey ? <span role="alert" className="text-xs text-[var(--danger-text)]">{t(errorKey)}</span> : null}
    </div>
  );
}
```

Keep cleanup functions private inside this file. Do not add a recorder abstraction used by only this component.

- [ ] **Step 4: Add the shared translations**

Add under the existing `feedback` namespace in `pt-BR.json`:

```json
"voice": {
  "start": "Ditar por voz",
  "stop": "Parar gravação",
  "recording": "Gravando {seconds}s",
  "transcribing": "Transcrevendo…",
  "permissionError": "Permita o acesso ao microfone para usar a voz.",
  "transcriptionError": "Não foi possível transcrever. Tente novamente."
}
```

Add under `feedback` in `en.json`:

```json
"voice": {
  "start": "Dictate by voice",
  "stop": "Stop recording",
  "recording": "Recording {seconds}s",
  "transcribing": "Transcribing…",
  "permissionError": "Allow microphone access to use voice input.",
  "transcriptionError": "Could not transcribe. Try again."
}
```

- [ ] **Step 5: Run focused checks and commit**

```bash
npm --prefix app test -- --run src/components/ui/VoiceInputButton.test.tsx
npm exec --prefix app -- eslint src/components/ui/VoiceInputButton.tsx src/components/ui/VoiceInputButton.test.tsx
npm --prefix app run typecheck
git add -- app/src/components/ui/VoiceInputButton.tsx app/src/components/ui/VoiceInputButton.test.tsx app/messages/pt-BR.json app/messages/en.json
git commit -m "feat: add reusable voice input control"
```

Expected: focused tests, ESLint, and typecheck pass.

---

### Task 3: Voice in Feedback, Revision, and Annotation Comments

**Files:**
- Modify: `app/src/components/feedback/FeedbackModal.tsx:82-187`
- Modify: `app/src/components/feedback/FeedbackModal.test.tsx`
- Modify: `app/src/components/creative-work/CreativeResultCard.tsx:55-398`
- Modify: `app/src/components/creative-work/CreativeResultCard.test.tsx`
- Modify: `app/src/components/assistant/CreativeAnnotationEditor.tsx:13-261`
- Modify: `app/src/components/assistant/CreativeAnnotationEditor.test.tsx`
- Modify: `app/src/components/assistant/AssistantGoalWorkspace.tsx:154-186`

**Interfaces:**
- Consumes: `VoiceInputButton`, `appendTranscript`, existing controlled text state, and `isMobile`.
- Produces: `CreativeAnnotationItem`, optional `maxAnnotations`/`commentMaxLength`, and voice-enabled fields that block their submit while voice is busy.

- [ ] **Step 1: Add failing integration tests for all three text owners**

Mock voice in each consumer test so these tests verify text ownership rather than `MediaRecorder`:

```tsx
vi.mock("@/components/ui/VoiceInputButton", () => ({
  default: ({ onTranscript, onBusyChange }: {
    onTranscript: (text: string) => void;
    onBusyChange?: (busy: boolean) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onTranscript("Texto ditado")}>mock voice</button>
      <button type="button" onClick={() => onBusyChange?.(true)}>mock busy</button>
      <button type="button" onClick={() => onBusyChange?.(false)}>mock idle</button>
    </div>
  ),
  appendTranscript: (current: string, text: string, max: number) =>
    [current, text].filter(Boolean).join(" ").slice(0, max),
}));
```

Change the Testing Library import in `FeedbackModal.test.tsx` to include `fireEvent`, then add this case inside its existing `describe`:

```tsx
it("appends voice feedback and blocks submit while voice is busy", () => {
  render(
    <FeedbackModal
      open
      onOpenChange={vi.fn()}
      context={{ contextKind: "global" }}
      submitting={false}
      onSubmit={vi.fn()}
    />,
  );

  fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Atual" } });
  fireEvent.click(screen.getByRole("button", { name: "mock voice" }));
  expect(screen.getByLabelText("Message")).toHaveValue("Atual Texto ditado");
  fireEvent.click(screen.getByRole("button", { name: "mock busy" }));
  expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
});
```

Add to the existing edit test in `CreativeResultCard.test.tsx`:

```tsx
fireEvent.change(screen.getByRole("textbox", { name: "O que você quer mudar?" }), {
  target: { value: "Atual" },
});
fireEvent.click(screen.getByRole("button", { name: "mock voice" }));
expect(screen.getByRole("textbox", { name: "O que você quer mudar?" })).toHaveValue(
  "Atual Texto ditado",
);
expect(screen.getByRole("button", { name: "Gerar nova versão · 5 créditos" })).toBeEnabled();
fireEvent.click(screen.getByRole("button", { name: "mock busy" }));
expect(screen.getByRole("button", { name: "Gerar nova versão · 5 créditos" })).toBeDisabled();
fireEvent.click(screen.getByRole("button", { name: "mock idle" }));
```

Replace the existing `expect(screen.queryByText(/crédit/i)).not.toBeInTheDocument()` assertion in the completed-output edit test with the positive button assertion above. Keep the separate failed-revision retry assertion unchanged because that button is not the new annotation submit action.

Add to `CreativeAnnotationEditor.test.tsx` after `drawRect(...)`:

```tsx
fireEvent.change(screen.getByTestId("assistant-annotation-comment"), {
  target: { value: "Atual" },
});
fireEvent.click(screen.getByRole("button", { name: "mock voice" }));
expect(screen.getByTestId("assistant-annotation-comment")).toHaveValue("Atual Texto ditado");
fireEvent.click(screen.getByRole("button", { name: "mock busy" }));
expect(screen.getByTestId("assistant-annotation-save")).toBeDisabled();
fireEvent.click(screen.getByRole("button", { name: "mock idle" }));
```

Add the editor limit regression:

```tsx
it("blocks new drawing at the configured active annotation limit", () => {
  render(
    <CreativeAnnotationEditor
      {...baseProps}
      maxAnnotations={1}
      annotations={[{
        id: "ann-1",
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.2,
        comment: "Existing",
        status: "draft",
      }]}
    />,
  );
  expect(screen.getByTestId("assistant-annotation-overlay")).toHaveAttribute("aria-disabled", "true");
});
```

- [ ] **Step 2: Run the three tests and verify the assertions fail**

```bash
npm --prefix app test -- --run src/components/feedback/FeedbackModal.test.tsx src/components/creative-work/CreativeResultCard.test.tsx src/components/assistant/CreativeAnnotationEditor.test.tsx
```

Expected: FAIL because the consumers do not render voice, the cost label is absent, and editor limit props do not exist.

- [ ] **Step 3: Integrate voice into `FeedbackModal`**

Import `VoiceInputButton` and `appendTranscript`, then keep the form as value owner:

```tsx
const [voiceBusy, setVoiceBusy] = useState(false);

<textarea
  id="feedback-message"
  value={message}
  onChange={(event) => setMessage(event.target.value)}
  rows={5}
  maxLength={4000}
  placeholder={t("messagePlaceholder")}
  className="min-h-[120px] rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 py-2 text-sm"
/>
<VoiceInputButton
  disabled={submitting}
  onBusyChange={setVoiceBusy}
  onTranscript={(text) => setMessage((current) => appendTranscript(current, text, 4_000))}
/>
```

Update both submit guards:

```ts
if (voiceBusy || !message.trim()) return;
```

```tsx
disabled={submitting || voiceBusy || !message.trim()}
```

- [ ] **Step 4: Integrate voice and cost copy into `CreativeResultCard`**

```tsx
const [voiceBusy, setVoiceBusy] = useState(false);

<VoiceInputButton
  disabled={submitting || isRevising}
  onBusyChange={setVoiceBusy}
  onTranscript={(text) => setInstruction((current) => appendTranscript(current, text, 2_000))}
/>

<button
  type="submit"
  className={actionClass}
  disabled={!instruction.trim() || voiceBusy || isRevising || submitting}
>
  Gerar nova versão · 5 créditos
</button>
```

Keep the optional file input and existing `onRevise(output.id, instruction.trim(), attachment)` call.

- [ ] **Step 5: Generalize `CreativeAnnotationEditor` without duplicating it**

Replace the presentation-type dependency with this structural item and remove the unused `versionId` prop:

```ts
export type CreativeAnnotationItem = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  comment: string;
  status: "draft" | "submitted" | "addressed";
};

export interface CreativeAnnotationEditorProps {
  imageUrl: string;
  annotations: readonly CreativeAnnotationItem[];
  onAdd: (annotation: Omit<CreativeAnnotationItem, "id" | "status">) => void;
  onRemove: (annotationId: string) => void;
  isMobile?: boolean;
  maxAnnotations?: number;
  commentMaxLength?: number;
}
```

Use defaults that preserve the Goal Assistant contract:

```ts
maxAnnotations = Number.POSITIVE_INFINITY,
commentMaxLength = 1_000,
```

Block only new drawing at the limit:

```ts
const annotationLimitReached = annotations.filter((item) => item.status !== "addressed").length >= maxAnnotations;

if (isMobile || annotationLimitReached) return; // first line of handlePointerDown
```

Add `aria-disabled={annotationLimitReached}` to the overlay, `maxLength={commentMaxLength}` to the textarea, and voice beside the comment:

```tsx
<VoiceInputButton
  onBusyChange={setVoiceBusy}
  onTranscript={(text) => setComment((current) => appendTranscript(current, text, commentMaxLength))}
/>
```

Disable save while voice is busy. Remove `versionId` from `AssistantGoalWorkspace` and editor test fixtures; `AssistantGoalWorkspace` still adds `projection.selectedBaseVersionId` to the API payload itself.

- [ ] **Step 6: Run focused tests, lint, and commit**

```bash
npm --prefix app test -- --run src/components/feedback/FeedbackModal.test.tsx src/components/creative-work/CreativeResultCard.test.tsx src/components/assistant/CreativeAnnotationEditor.test.tsx
npm exec --prefix app -- eslint src/components/feedback/FeedbackModal.tsx src/components/feedback/FeedbackModal.test.tsx src/components/creative-work/CreativeResultCard.tsx src/components/creative-work/CreativeResultCard.test.tsx src/components/assistant/CreativeAnnotationEditor.tsx src/components/assistant/CreativeAnnotationEditor.test.tsx src/components/assistant/AssistantGoalWorkspace.tsx
npm --prefix app run typecheck
git add -- app/src/components/feedback/FeedbackModal.tsx app/src/components/feedback/FeedbackModal.test.tsx app/src/components/creative-work/CreativeResultCard.tsx app/src/components/creative-work/CreativeResultCard.test.tsx app/src/components/assistant/CreativeAnnotationEditor.tsx app/src/components/assistant/CreativeAnnotationEditor.test.tsx app/src/components/assistant/AssistantGoalWorkspace.tsx
git commit -m "feat: add voice to feedback fields"
```

Expected: the focused suites pass, Goal Assistant remains type-safe, and manual revision still works.

---

### Task 4: Deterministic Output Annotation Compiler

**Files:**
- Create: `app/src/components/creative-work/output-annotation.ts`
- Test: `app/src/components/creative-work/output-annotation.test.ts`

**Interfaces:**
- Consumes: authenticated output image URL, normalized rectangles, Canvas, and `createImageBitmap`.
- Produces: `OutputAnnotation`, `compileOutputAnnotationInstruction`, `drawOutputAnnotations`, and `renderAnnotatedOutputFile`.

- [ ] **Step 1: Write failing pure tests**

```ts
import { describe, expect, it, vi } from "vitest";
import {
  compileOutputAnnotationInstruction,
  drawOutputAnnotations,
  renderAnnotatedOutputFile,
  type OutputAnnotation,
} from "./output-annotation";

const annotations: OutputAnnotation[] = [
  { id: "1", x: 0.1, y: 0.2, width: 0.3, height: 0.25, comment: "  Reduzir título  ", status: "draft" },
  { id: "2", x: 0.6, y: 0.7, width: 0.2, height: 0.1, comment: "Trocar CTA", status: "draft" },
];

describe("output annotations", () => {
  it("compiles comments in the numbered image order", () => {
    expect(compileOutputAnnotationInstruction(annotations)).toBe(
      "Aplique somente as alterações numeradas na imagem anotada.\n" +
      "Mantenha os demais elementos da arte.\n\n" +
      "1. Reduzir título\n" +
      "2. Trocar CTA",
    );
  });

  it("rejects count and comment limits", () => {
    expect(() => compileOutputAnnotationInstruction([])).toThrow("annotation_count");
    expect(() => compileOutputAnnotationInstruction(Array(6).fill(annotations[0]))).toThrow("annotation_count");
    expect(() => compileOutputAnnotationInstruction([{ ...annotations[0], comment: " " }])).toThrow("annotation_comment");
    expect(() => compileOutputAnnotationInstruction([{ ...annotations[0], comment: "x".repeat(301) }])).toThrow("annotation_comment");
    expect(() => compileOutputAnnotationInstruction([{ ...annotations[0], x: Number.NaN }])).toThrow("annotation_bounds");
  });

  it("scales normalized rectangles to source pixels", () => {
    const context = {
      save: vi.fn(), restore: vi.fn(), strokeRect: vi.fn(), beginPath: vi.fn(),
      arc: vi.fn(), fill: vi.fn(), fillText: vi.fn(),
      set strokeStyle(_value: string) {}, set fillStyle(_value: string) {},
      set lineWidth(_value: number) {}, set font(_value: string) {},
      set textAlign(_value: CanvasTextAlign) {}, set textBaseline(_value: CanvasTextBaseline) {},
    } as unknown as CanvasRenderingContext2D;

    drawOutputAnnotations(context, 1_000, 800, [annotations[0]]);
    expect(context.strokeRect).toHaveBeenCalledWith(100, 160, 300, 200);
    expect(context.fillText).toHaveBeenCalledWith("1", expect.any(Number), expect.any(Number));
  });
});
```

Add this adapter test for the browser boundary:

```ts
it("downloads, annotates, and materializes a deterministic PNG file", async () => {
  const close = vi.fn();
  const fetchMock = vi.fn(async () => new Response(
    new Blob(["image"], { type: "image/png" }),
    { status: 200 },
  ));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 100, height: 80, close })));
  const context = {
    drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), strokeRect: vi.fn(),
    beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), fillText: vi.fn(),
    set strokeStyle(_value: string) {}, set fillStyle(_value: string) {},
    set lineWidth(_value: number) {}, set font(_value: string) {},
    set textAlign(_value: CanvasTextAlign) {}, set textBaseline(_value: CanvasTextBaseline) {},
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob: vi.fn((callback: BlobCallback) => callback(new Blob(["png"], { type: "image/png" }))),
  } as unknown as HTMLCanvasElement;
  const createElement = vi.spyOn(document, "createElement").mockReturnValue(canvas);

  const file = await renderAnnotatedOutputFile({
    outputId: "output-1",
    imageUrl: "/api/output-1/download",
    annotations: [annotations[0]],
  });

  expect(fetchMock).toHaveBeenCalledWith("/api/output-1/download", { credentials: "include" });
  expect(file.name).toBe("output-output-1-annotations.png");
  expect(file.type).toBe("image/png");
  expect(close).toHaveBeenCalled();
  createElement.mockRestore();
});
```

- [ ] **Step 2: Run the helper test and verify it fails**

```bash
npm --prefix app test -- --run src/components/creative-work/output-annotation.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Write validation and instruction compilation**

```ts
export const OUTPUT_ANNOTATION_MAX_COUNT = 5;
export const OUTPUT_ANNOTATION_COMMENT_MAX_LENGTH = 300;

export type OutputAnnotation = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  comment: string;
  status: "draft";
};

function checked(annotations: readonly OutputAnnotation[]) {
  if (annotations.length < 1 || annotations.length > OUTPUT_ANNOTATION_MAX_COUNT) {
    throw new Error("annotation_count");
  }
  return annotations.map((annotation) => {
    const comment = annotation.comment.trim();
    if (!comment || comment.length > OUTPUT_ANNOTATION_COMMENT_MAX_LENGTH) {
      throw new Error("annotation_comment");
    }
    const bounds = [annotation.x, annotation.y, annotation.width, annotation.height];
    if (
      !bounds.every(Number.isFinite) ||
      annotation.x < 0 || annotation.y < 0 ||
      annotation.width <= 0 || annotation.height <= 0 ||
      annotation.x + annotation.width > 1 || annotation.y + annotation.height > 1
    ) {
      throw new Error("annotation_bounds");
    }
    return { ...annotation, comment };
  });
}

export function compileOutputAnnotationInstruction(annotations: readonly OutputAnnotation[]) {
  const lines = checked(annotations).map((annotation, index) => `${index + 1}. ${annotation.comment}`);
  return [
    "Aplique somente as alterações numeradas na imagem anotada.",
    "Mantenha os demais elementos da arte.",
    "",
    ...lines,
  ].join("\n");
}
```

- [ ] **Step 4: Write Canvas drawing and PNG materialization**

```ts
export function drawOutputAnnotations(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  annotations: readonly OutputAnnotation[],
) {
  const items = checked(annotations);
  const scale = Math.min(width, height);
  const lineWidth = Math.max(3, Math.round(scale * 0.004));
  const radius = Math.max(12, Math.round(scale * 0.018));

  items.forEach((annotation, index) => {
    const x = annotation.x * width;
    const y = annotation.y * height;
    const boxWidth = annotation.width * width;
    const boxHeight = annotation.height * height;
    const badgeX = Math.min(width - radius, x + boxWidth);
    const badgeY = Math.max(radius, y);
    context.save();
    context.strokeStyle = "#facc15";
    context.lineWidth = lineWidth;
    context.strokeRect(x, y, boxWidth, boxHeight);
    context.fillStyle = "#facc15";
    context.beginPath();
    context.arc(badgeX, badgeY, radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#111827";
    context.font = `700 ${radius}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(index + 1), badgeX, badgeY);
    context.restore();
  });
}

export async function renderAnnotatedOutputFile(input: {
  outputId: string;
  imageUrl: string;
  annotations: readonly OutputAnnotation[];
}) {
  const response = await fetch(input.imageUrl, { credentials: "include" });
  if (!response.ok) throw new Error("annotation_source_download");
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("annotation_canvas_context");
    context.drawImage(bitmap, 0, 0);
    drawOutputAnnotations(context, bitmap.width, bitmap.height, input.annotations);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("annotation_png")), "image/png");
    });
    const safeId = input.outputId.replace(/[^a-zA-Z0-9_-]/g, "");
    return new File([blob], `output-${safeId}-annotations.png`, { type: "image/png" });
  } finally {
    bitmap.close();
  }
}
```

- [ ] **Step 5: Run tests, lint, and commit**

```bash
npm --prefix app test -- --run src/components/creative-work/output-annotation.test.ts
npm exec --prefix app -- eslint src/components/creative-work/output-annotation.ts src/components/creative-work/output-annotation.test.ts
git add -- app/src/components/creative-work/output-annotation.ts app/src/components/creative-work/output-annotation.test.ts
git commit -m "feat: compile visual output annotations"
```

Expected: compilation, validation, drawing, and file adapter tests pass without network access.

---

### Task 5: Annotated Revision in the Creative Proposal Inspector

**Files:**
- Modify: `app/src/components/creative-work/useCreativeComposer.ts:1146-1167`
- Modify: `app/src/components/creative-work/useCreativeComposer.test.tsx:1-1300`
- Modify: `app/src/components/creative-work/CreativeResultCard.tsx:20-55`
- Modify: `app/src/components/quick-tools/create-post/CreativeProposalGrid.tsx:13-182`
- Modify: `app/src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx`
- Modify: `app/messages/pt-BR.json:540-690`
- Modify: `app/messages/en.json:505-660`

**Interfaces:**
- Consumes: `CreativeAnnotationEditor`, `OutputAnnotation`, `compileOutputAnnotationInstruction`, `renderAnnotatedOutputFile`, `useIsMobile`, and the existing upload inside `reviseOutput`.
- Produces: `reviseOutput(...): Promise<boolean>` and a desktop inspector that clears annotations only after `true`.

- [ ] **Step 1: Write failing `reviseOutput` result tests**

Add to `useCreativeComposer.test.tsx`:

```tsx
it("returns true only after an annotated revision is accepted", async () => {
  mocks.work.mockReturnValue({ data: workDetail(), isLoading: false, isError: false });
  mocks.upload.mockResolvedValue({ assetId: "asset-1" });
  mocks.reviseOutput.mockResolvedValue({ output: { id: "output-v2" } });
  const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
  const file = new File(["png"], "output-output-v1-annotations.png", { type: "image/png" });

  await expect(
    result.current.reviseOutput("output-v1", "1. Reduzir título", file),
  ).resolves.toBe(true);
});

it("returns false and keeps the idempotent attempt after dispatch failure", async () => {
  mocks.work.mockReturnValue({ data: workDetail(), isLoading: false, isError: false });
  mocks.upload.mockResolvedValue({ assetId: "asset-1" });
  mocks.reviseOutput.mockRejectedValue(new Error("dispatch failed"));
  const { result } = renderHook(() => useCreativeComposer({ initialWorkId: "work-1" }));
  const file = new File(["png"], "output-output-v1-annotations.png", { type: "image/png" });

  await expect(
    result.current.reviseOutput("output-v1", "1. Reduzir título", file),
  ).resolves.toBe(false);
  await expect(
    result.current.reviseOutput("output-v1", "1. Reduzir título", file),
  ).resolves.toBe(false);
  expect(mocks.upload).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Write failing proposal-grid integration tests**

Change the Testing Library import to include `waitFor`, add `beforeEach` to the Vitest import, and mock only the child editor, media query, and annotation adapter in `CreativeProposalGrid.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const annotationMocks = vi.hoisted(() => ({
  compile: vi.fn(() => "1. Reduzir título"),
  render: vi.fn(),
  isMobile: vi.fn(() => false),
}));

vi.mock("@/lib/hooks/use-media-query", () => ({
  useIsMobile: annotationMocks.isMobile,
}));

vi.mock("@/components/assistant/CreativeAnnotationEditor", () => ({
  default: ({ onAdd, annotations, isMobile }: {
    onAdd: (item: { x: number; y: number; width: number; height: number; comment: string }) => void;
    annotations: unknown[];
    isMobile: boolean;
  }) => (
    <div data-testid="annotation-editor" data-mobile={String(isMobile)} data-count={annotations.length}>
      <button type="button" onClick={() => onAdd({
        x: 0.1, y: 0.2, width: 0.3, height: 0.2, comment: "Reduzir título",
      })}>
        add annotation
      </button>
    </div>
  ),
}));

vi.mock("@/components/creative-work/output-annotation", () => ({
  OUTPUT_ANNOTATION_MAX_COUNT: 5,
  OUTPUT_ANNOTATION_COMMENT_MAX_LENGTH: 300,
  compileOutputAnnotationInstruction: annotationMocks.compile,
  renderAnnotatedOutputFile: annotationMocks.render,
}));
```

At the start of the existing `describe`, reset only call history and the two configurable results:

```tsx
beforeEach(() => {
  vi.clearAllMocks();
  annotationMocks.isMobile.mockReturnValue(false);
});
```

Add the success case:

```tsx
it("submits one annotated revision and clears only on success", async () => {
  const onRevise = vi.fn(async () => true);
  const annotatedFile = new File(["png"], "output-out-balanced-annotations.png", { type: "image/png" });
  annotationMocks.render.mockResolvedValueOnce(annotatedFile);
  render(
    <CreativeProposalGrid
      outputs={[balancedCompleted]}
      onRetry={vi.fn()}
      onApprove={vi.fn()}
      onDownload={vi.fn()}
      onRevise={onRevise}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Ampliar/ }));
  fireEvent.click(screen.getByRole("button", { name: "add annotation" }));
  expect(screen.getByTestId("annotation-editor")).toHaveAttribute("data-count", "1");
  fireEvent.click(screen.getByRole("button", { name: "Gerar nova versão · 5 créditos" }));

  await waitFor(() => expect(onRevise).toHaveBeenCalledWith(
    "out-balanced",
    "1. Reduzir título",
    annotatedFile,
  ));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
```

Add the failure case:

```tsx
it("keeps annotations visible when revision returns false", async () => {
  const onRevise = vi.fn(async () => false);
  annotationMocks.render.mockResolvedValueOnce(
    new File(["png"], "output-out-balanced-annotations.png", { type: "image/png" }),
  );
  render(
    <CreativeProposalGrid
      outputs={[balancedCompleted]}
      onRetry={vi.fn()}
      onApprove={vi.fn()}
      onDownload={vi.fn()}
      onRevise={onRevise}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Ampliar/ }));
  fireEvent.click(screen.getByRole("button", { name: "add annotation" }));
  fireEvent.click(screen.getByRole("button", { name: "Gerar nova versão · 5 créditos" }));

  await waitFor(() => expect(onRevise).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(screen.getByTestId("annotation-editor")).toHaveAttribute("data-count", "1");
});
```

Add the output-isolation and mobile cases:

```tsx
it("keeps annotation drafts isolated by output", () => {
  render(
    <CreativeProposalGrid
      outputs={[conservativeCompleted, balancedCompleted]}
      onRetry={vi.fn()}
      onApprove={vi.fn()}
      onDownload={vi.fn()}
      onRevise={vi.fn(async () => true)}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Ampliar Conservadora em 4:5" }));
  fireEvent.click(screen.getByRole("button", { name: "add annotation" }));
  expect(screen.getByTestId("annotation-editor")).toHaveAttribute("data-count", "1");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));

  fireEvent.click(screen.getByRole("button", { name: "Selecionar Equilibrada em 4:5" }));
  fireEvent.click(screen.getByRole("button", { name: "Ampliar Equilibrada em 4:5" }));
  expect(screen.getByTestId("annotation-editor")).toHaveAttribute("data-count", "0");
  fireEvent.click(screen.getByRole("button", { name: "add annotation" }));
  fireEvent.click(screen.getByRole("button", { name: "Close" }));

  fireEvent.click(screen.getByRole("button", { name: "Selecionar Conservadora em 4:5" }));
  fireEvent.click(screen.getByRole("button", { name: "Ampliar Conservadora em 4:5" }));
  expect(screen.getByTestId("annotation-editor")).toHaveAttribute("data-count", "1");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));

  fireEvent.click(screen.getByRole("button", { name: "Selecionar Equilibrada em 4:5" }));
  fireEvent.click(screen.getByRole("button", { name: "Ampliar Equilibrada em 4:5" }));
  expect(screen.getByTestId("annotation-editor")).toHaveAttribute("data-count", "1");
});

it("passes mobile mode to the editor", () => {
  annotationMocks.isMobile.mockReturnValue(true);
  render(
    <CreativeProposalGrid
      outputs={[balancedCompleted]}
      onRetry={vi.fn()}
      onApprove={vi.fn()}
      onDownload={vi.fn()}
      onRevise={vi.fn(async () => true)}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Ampliar Equilibrada em 4:5" }));
  expect(screen.getByTestId("annotation-editor")).toHaveAttribute("data-mobile", "true");
});

it("keeps the draft when annotated image preparation fails", async () => {
  const onRevise = vi.fn(async () => true);
  annotationMocks.render.mockRejectedValueOnce(new Error("canvas failed"));
  render(
    <CreativeProposalGrid
      outputs={[balancedCompleted]}
      onRetry={vi.fn()}
      onApprove={vi.fn()}
      onDownload={vi.fn()}
      onRevise={onRevise}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Ampliar Equilibrada em 4:5" }));
  fireEvent.click(screen.getByRole("button", { name: "add annotation" }));
  fireEvent.click(screen.getByRole("button", { name: "Gerar nova versão · 5 créditos" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("annotationPreparationError");
  expect(onRevise).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(screen.getByTestId("annotation-editor")).toHaveAttribute("data-count", "1");
});
```

- [ ] **Step 3: Run the hook and grid tests and verify failure**

```bash
npm --prefix app test -- --run src/components/creative-work/useCreativeComposer.test.tsx src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx
```

Expected: FAIL because `reviseOutput` returns `void` and the dialog has no annotation editor.

- [ ] **Step 4: Return an explicit boolean from `reviseOutput`**

```ts
const reviseOutput = useCallback(async (
  outputId: string,
  instruction: string,
  attachment: File | null,
): Promise<boolean> => {
  if (!workIdRef.current || !instruction.trim()) return false;
  const attemptKey = `${outputId}:${instruction.trim()}:${attachment?.name ?? ""}:${attachment?.size ?? 0}`;
  try {
    let attempt = revisionAttemptsRef.current.get(attemptKey);
    if (!attempt) {
      const uploaded = attachment ? await uploadChatAttachment(attachment) : null;
      attempt = { revisionKey: crypto.randomUUID(), revisionAssetId: uploaded?.assetId ?? null };
      revisionAttemptsRef.current.set(attemptKey, attempt);
    }
    await reviseOutputMutation.mutateAsync({
      workItemId: workIdRef.current,
      outputId,
      instruction: instruction.trim(),
      ...attempt,
    });
    revisionAttemptsRef.current.delete(attemptKey);
    setAnnouncement("Nova versão em geração");
    return true;
  } catch (cause) {
    setError(cause instanceof Error ? cause.message : "Falha ao gerar nova versão");
    return false;
  }
}, [reviseOutputMutation]);
```

Update both `onRevise` prop types to:

```ts
(outputId: string, instruction: string, attachment: File | null) => Promise<boolean>
```

The manual edit form awaits and otherwise ignores the boolean.

- [ ] **Step 5: Add output-scoped annotations to `CreativeProposalGrid`**

Import `useTranslations`, `Button`, the existing editor, `useIsMobile`, and Task 4 exports. After `selected` is computed and before the existing `if (!selected) return null`, add:

```tsx
const isMobile = useIsMobile();
const t = useTranslations("dashboard.home.composer.results");
const [annotationsByOutput, setAnnotationsByOutput] = useState<Record<string, OutputAnnotation[]>>({});
const [submittingAnnotations, setSubmittingAnnotations] = useState(false);
const [annotationError, setAnnotationError] = useState<string | null>(null);
const selectedAnnotations = selected ? annotationsByOutput[selected.id] ?? [] : [];

const updateSelectedAnnotations = (next: OutputAnnotation[]) => {
  if (!selected) return;
  setAnnotationsByOutput((current) => ({ ...current, [selected.id]: next }));
};
```

Replace the expanded image-only body with one responsive body; the editor itself renders the image:

```tsx
<DialogBody className="grid min-h-0 gap-4 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_20rem]">
  <CreativeAnnotationEditor
    imageUrl={outputSource(selected)}
    annotations={selectedAnnotations}
    isMobile={isMobile}
    maxAnnotations={OUTPUT_ANNOTATION_MAX_COUNT}
    commentMaxLength={OUTPUT_ANNOTATION_COMMENT_MAX_LENGTH}
    onAdd={(annotation) => updateSelectedAnnotations([
      ...selectedAnnotations,
      { id: crypto.randomUUID(), status: "draft", ...annotation },
    ])}
    onRemove={(annotationId) => updateSelectedAnnotations(
      selectedAnnotations.filter((annotation) => annotation.id !== annotationId),
    )}
  />
  <aside className="flex flex-col gap-3">
    <p className="text-sm text-[var(--text-secondary)]">{t("annotationHelp")}</p>
    {annotationError ? <p role="alert" className="text-sm text-[var(--danger-text)]">{annotationError}</p> : null}
    <Button
      type="button"
      disabled={!onRevise || selectedAnnotations.length === 0 || submittingAnnotations || isRevising?.(selected.id)}
      onClick={async () => {
        if (!onRevise || selectedAnnotations.length === 0) return;
        setSubmittingAnnotations(true);
        setAnnotationError(null);
        try {
          const instruction = compileOutputAnnotationInstruction(selectedAnnotations);
          const file = await renderAnnotatedOutputFile({
            outputId: selected.id,
            imageUrl: outputSource(selected),
            annotations: selectedAnnotations,
          });
          const accepted = await onRevise(selected.id, instruction, file);
          if (accepted) {
            setAnnotationsByOutput((current) => {
              const next = { ...current };
              delete next[selected.id];
              return next;
            });
            setExpanded(false);
          }
        } catch {
          setAnnotationError(t("annotationPreparationError"));
        } finally {
          setSubmittingAnnotations(false);
        }
      }}
    >
      Gerar nova versão · 5 créditos
    </Button>
  </aside>
</DialogBody>
```

Use the Creative Proposal translation namespace and add:

```json
"annotationHelp": "Marque uma área e descreva a mudança. Todas as marcações gerarão uma única nova versão.",
"annotationPreparationError": "Não foi possível preparar as marcações. Tente novamente."
```

English:

```json
"annotationHelp": "Mark an area and describe the change. All annotations will generate one new version.",
"annotationPreparationError": "Could not prepare the annotations. Try again."
```

Compilation, image, or Canvas failure uses `annotationPreparationError` and leaves `annotationsByOutput` unchanged. Upload or command failure is already translated by `reviseOutput`, returns `false`, and also leaves the map unchanged. Do not add persistence or a second request.

- [ ] **Step 6: Run focused regression suites**

```bash
npm --prefix app test -- --run src/components/creative-work/useCreativeComposer.test.tsx src/components/creative-work/CreativeResultCard.test.tsx src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx src/components/assistant/CreativeAnnotationEditor.test.tsx src/components/creative-work/CreativeComposer.test.tsx
```

Expected: all focused suites pass, including manual revision, retry, approval, Goal Assistant annotation, and annotated revision.

- [ ] **Step 7: Run static checks and commit**

```bash
npm exec --prefix app -- eslint src/components/creative-work/useCreativeComposer.ts src/components/creative-work/useCreativeComposer.test.tsx src/components/creative-work/CreativeResultCard.tsx src/components/quick-tools/create-post/CreativeProposalGrid.tsx src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx
npm --prefix app run typecheck
git diff --check
git add -- app/src/components/creative-work/useCreativeComposer.ts app/src/components/creative-work/useCreativeComposer.test.tsx app/src/components/creative-work/CreativeResultCard.tsx app/src/components/quick-tools/create-post/CreativeProposalGrid.tsx app/src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx app/messages/pt-BR.json app/messages/en.json
git commit -m "feat: revise outputs from visual annotations"
```

Expected: ESLint, typecheck, and diff check pass; only integrated annotation paths are committed.

---

## Final Verification

Run from the repository root:

```bash
npm --prefix app test -- --run src/app/api/feedback/transcribe/route.test.ts src/components/ui/VoiceInputButton.test.tsx src/components/feedback/FeedbackModal.test.tsx src/components/creative-work/CreativeResultCard.test.tsx src/components/assistant/CreativeAnnotationEditor.test.tsx src/components/creative-work/output-annotation.test.ts src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx src/components/creative-work/useCreativeComposer.test.tsx src/components/creative-work/CreativeComposer.test.tsx
npm --prefix app run typecheck
npm exec --prefix app -- eslint src/app/api/feedback/transcribe/route.ts src/app/api/feedback/transcribe/route.test.ts src/components/ui/VoiceInputButton.tsx src/components/ui/VoiceInputButton.test.tsx src/components/feedback/FeedbackModal.tsx src/components/creative-work/CreativeResultCard.tsx src/components/assistant/CreativeAnnotationEditor.tsx src/components/creative-work/output-annotation.ts src/components/quick-tools/create-post/CreativeProposalGrid.tsx src/components/creative-work/useCreativeComposer.ts
git diff --check
```

```bash
graphify update .
git status --short
```

The required graph update can dirty graph files; do not stage them with feature code. Confirm that unrelated `.planning`, `.claude`, validation artifacts, and original WIP remain untouched.

Manual browser QA without provider invocation:

1. Open feedback and verify the unsupported/permission-denied fallback without completing an audio upload. Successful real transcription remains behind the paid-smoke authorization gate.
2. Open a completed output on desktop; draw, cancel, save, delete, and isolate annotations across two thumbnails.
3. Confirm that the action shows `5 créditos`; stop before clicking unless the user separately authorizes paid generation.
4. Resize below 768px and verify voice/text remain while drawing shows the mobile notice.
5. Inspect keyboard focus, `aria-pressed`, live status, dialog scroll, and visible error copy.

Paid evidence remains a separate gate. If authorized later, use one shortest useful voice transcription and one annotated revision, then report transcription response, revision dispatch, output completion, and human visual approval as separate claims.
