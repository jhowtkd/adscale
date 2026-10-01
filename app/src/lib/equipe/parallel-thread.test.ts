import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.fn();
const postCommandMock = vi.fn();

vi.mock("@/lib/api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));
vi.mock("@/lib/equipe/commands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/equipe/commands")>()),
  postEquipeCommand: (...args: unknown[]) => postCommandMock(...args),
}));

import { EquipeCommandError } from "@/lib/equipe/commands";
import { openParallelConversation, PARALLEL_TOPIC_MAX } from "./parallel-thread";

const input = { accountId: "acc-1", clientProfileId: "profile-1", topic: "Promoção de outubro" };
const threadResponse = (ok = true) => ({ ok, json: async () => ({ thread: { id: "thread-9" } }) });

describe("openParallelConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockResolvedValue(threadResponse());
    postCommandMock.mockResolvedValue({});
  });

  it("creates a classic Assistant thread first, then binds it to the account, and returns the thread id", async () => {
    const order: string[] = [];
    apiFetchMock.mockImplementation(async () => { order.push("create"); return threadResponse(); });
    postCommandMock.mockImplementation(async () => { order.push("bind"); return {}; });

    await expect(openParallelConversation(input)).resolves.toBe("thread-9");

    expect(order).toEqual(["create", "bind"]);
    const [url, init] = apiFetchMock.mock.calls[0];
    expect(url).toBe("/api/assistant/threads");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ clientProfileId: "profile-1", name: "Promoção de outubro", experience: "classic" });
    expect(postCommandMock).toHaveBeenCalledExactlyOnceWith("acc-1", {
      type: "open_parallel_thread",
      payload: { assistantThreadId: "thread-9", topic: "Promoção de outubro" },
    });
  });

  it("rejects an empty or blank topic without calling anything", async () => {
    await expect(openParallelConversation({ ...input, topic: "" })).rejects.toThrow("topic_required");
    await expect(openParallelConversation({ ...input, topic: "   \n " })).rejects.toThrow("topic_required");
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(postCommandMock).not.toHaveBeenCalled();
  });

  it("trims the topic and cuts it at 200 characters, in the thread name and in the command", async () => {
    await openParallelConversation({ ...input, topic: `  ${"a".repeat(250)}  ` });
    const name = JSON.parse(apiFetchMock.mock.calls[0][1].body).name as string;
    expect(PARALLEL_TOPIC_MAX).toBe(200);
    expect(name).toBe("a".repeat(200));
    expect(postCommandMock.mock.calls[0][1].payload.topic).toBe("a".repeat(200));
  });

  it("does not leave a trailing space after the cut", async () => {
    await openParallelConversation({ ...input, topic: `${"a".repeat(199)} b` });
    expect(postCommandMock.mock.calls[0][1].payload.topic).toBe("a".repeat(199));
  });

  it("fails without binding when the thread cannot be created", async () => {
    apiFetchMock.mockResolvedValue(threadResponse(false));
    await expect(openParallelConversation(input)).rejects.toThrow("thread_create_failed");
    expect(postCommandMock).not.toHaveBeenCalled();
  });

  it("retries the binding once on a server error and succeeds", async () => {
    postCommandMock.mockRejectedValueOnce(new EquipeCommandError("boom", 503)).mockResolvedValueOnce({});
    await expect(openParallelConversation(input)).resolves.toBe("thread-9");
    expect(postCommandMock).toHaveBeenCalledTimes(2);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(postCommandMock.mock.calls[1]).toEqual(postCommandMock.mock.calls[0]);
  });

  it("retries once when the connection is lost (a plain network error)", async () => {
    postCommandMock.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({});
    await expect(openParallelConversation(input)).resolves.toBe("thread-9");
    expect(postCommandMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the single retry and surfaces the last error", async () => {
    postCommandMock.mockRejectedValue(new EquipeCommandError("down", 502));
    await expect(openParallelConversation(input)).rejects.toMatchObject({ status: 502 });
    expect(postCommandMock).toHaveBeenCalledTimes(2);
  });

  it("treats thread_conflict on the retry as success: the first answer was lost after the thread was bound", async () => {
    postCommandMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new EquipeCommandError("conflict", 409, "thread_conflict"));
    await expect(openParallelConversation(input)).resolves.toBe("thread-9");
  });

  it("does not treat other conflicts on the retry as success", async () => {
    postCommandMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new EquipeCommandError("conflict", 409, "version_mismatch"));
    await expect(openParallelConversation(input)).rejects.toMatchObject({ code: "version_mismatch" });
  });

  it.each([400, 403, 404, 409])("does not retry a final refusal (%i)", async (status) => {
    postCommandMock.mockRejectedValue(new EquipeCommandError("no", status, status === 409 ? "thread_conflict" : "forbidden_actor"));
    await expect(openParallelConversation(input)).rejects.toMatchObject({ status });
    expect(postCommandMock).toHaveBeenCalledTimes(1);
  });

  describe("takes back the thread whose binding was refused", () => {
    const deletes = () => apiFetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE");
    beforeEach(() => {
      apiFetchMock.mockImplementation(async (_url: string, init?: { method?: string }) => init?.method === "DELETE" ? { ok: true } : threadResponse());
    });

    it.each([400, 403, 404, 409])("deletes the new thread after a final refusal (%i) and surfaces the refusal", async (status) => {
      postCommandMock.mockRejectedValue(new EquipeCommandError("no", status, "forbidden_actor"));
      await expect(openParallelConversation(input)).rejects.toMatchObject({ status });
      expect(deletes()).toHaveLength(1);
      expect(deletes()[0]![0]).toBe("/api/assistant/threads/thread-9");
    });

    it("deletes it once when both attempts fail, after the second one", async () => {
      const order: string[] = [];
      postCommandMock.mockImplementation(async () => { order.push("bind"); throw new EquipeCommandError("down", 502); });
      apiFetchMock.mockImplementation(async (_url: string, init?: { method?: string }) => {
        if (init?.method === "DELETE") { order.push("delete"); return { ok: true }; }
        order.push("create");
        return threadResponse();
      });
      await expect(openParallelConversation(input)).rejects.toMatchObject({ status: 502 });
      expect(order).toEqual(["create", "bind", "bind", "delete"]);
    });

    it("a refused cleanup or a lost connection does not hide why the binding failed", async () => {
      postCommandMock.mockRejectedValue(new EquipeCommandError("no", 403, "forbidden_actor"));
      apiFetchMock.mockImplementation(async (_url: string, init?: { method?: string }) => {
        if (init?.method === "DELETE") throw new TypeError("Failed to fetch");
        return threadResponse();
      });
      await expect(openParallelConversation(input)).rejects.toMatchObject({ status: 403, code: "forbidden_actor" });
      apiFetchMock.mockImplementation(async (_url: string, init?: { method?: string }) => init?.method === "DELETE" ? { ok: false, status: 409 } : threadResponse());
      await expect(openParallelConversation(input)).rejects.toMatchObject({ status: 403 });
    });

    it("keeps the thread when it was bound: success, success after a retry, and thread_conflict on the retry", async () => {
      await openParallelConversation(input);
      postCommandMock.mockRejectedValueOnce(new EquipeCommandError("boom", 503)).mockResolvedValueOnce({});
      await openParallelConversation(input);
      postCommandMock
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockRejectedValueOnce(new EquipeCommandError("conflict", 409, "thread_conflict"));
      await openParallelConversation(input);
      expect(deletes()).toHaveLength(0);
    });

    it("has nothing to delete when the thread was never created", async () => {
      apiFetchMock.mockResolvedValue(threadResponse(false));
      await expect(openParallelConversation(input)).rejects.toThrow("thread_create_failed");
      expect(deletes()).toHaveLength(0);
    });
  });
});
