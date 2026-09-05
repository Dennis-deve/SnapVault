// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UploadQueue, type UploadItem } from "../uploadQueue";
import { UploadError } from "../upload";

// The queue's transport (lib/upload) is mocked: what's under test is the
// queue's own policy — bounded parallelism, transient-vs-permanent retry
// decisions with backoff, cancellation, manual retry with the SAME stable
// upload id, and progress capping before server confirmation.

const mocks = vi.hoisted(() => ({
  uploadFile: vi.fn(),
  newUploadId: vi.fn(),
}));

vi.mock("../upload", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    uploadFile: mocks.uploadFile,
    newUploadId: mocks.newUploadId,
  };
});

function fakeFile(name = "photo.jpg", type = "image/jpeg", size = 1024): File {
  return new File(["x".repeat(16)], name, { type });
}

/** A controllable upload: capture onProgress, settle manually. */
function deferredUpload() {
  let resolve!: (v: any) => void;
  let reject!: (e: any) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  let onProgress: ((p: number) => void) | null = null;
  const impl = vi.fn((_file: File, opts: any) => {
    onProgress = opts.onProgress;
    return promise;
  });
  return {
    impl,
    resolve,
    reject,
    progress: (p: number) => onProgress?.(p),
    promise,
  };
}

function statuses(items: UploadItem[]): Record<string, string> {
  return Object.fromEntries(items.map((i) => [i.name, i.status]));
}

let idCounter = 0;

beforeEach(() => {
  idCounter = 0;
  mocks.uploadFile.mockReset();
  mocks.newUploadId.mockImplementation(() => `id-${++idCounter}`);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UploadQueue", () => {
  it("runs at most TWO uploads concurrently (the third waits)", async () => {
    const queue = new UploadQueue();
    const a = deferredUpload();
    const b = deferredUpload();
    const c = deferredUpload();
    mocks.uploadFile.mockImplementationOnce(a.impl).mockImplementationOnce(b.impl).mockImplementationOnce(c.impl);

    queue.enqueue(fakeFile("a.jpg"));
    queue.enqueue(fakeFile("b.jpg"));
    queue.enqueue(fakeFile("c.jpg"));
    await vi.waitFor(() => expect(a.impl).toHaveBeenCalled() && expect(b.impl).toHaveBeenCalled());

    // Two workers busy; the third file stays queued.
    await new Promise((r) => setTimeout(r, 20));
    expect(c.impl).not.toHaveBeenCalled();
    const snap = queue.getSnapshot();
    expect(snap.find((i) => i.name === "c.jpg")?.status).toBe("queued");

    // Finish one; the third starts.
    a.resolve({});
    await vi.waitFor(() => expect(c.impl).toHaveBeenCalled());
    b.resolve({});
    c.resolve({});
    await vi.waitFor(() => {
      const s = statuses(queue.getSnapshot());
      if (!Object.values(s).every((v) => v === "done")) throw new Error("pending");
    });
  });

  it("drops to ONE worker when the connection is save-data/slow", async () => {
    const conn = { saveData: true, effectiveType: "4g" };
    Object.defineProperty(navigator, "connection", { value: conn, configurable: true });
    try {
      const queue = new UploadQueue();
      const a = deferredUpload();
      const b = deferredUpload();
      mocks.uploadFile.mockImplementationOnce(a.impl).mockImplementationOnce(b.impl);

      queue.enqueue(fakeFile("a.jpg"));
      queue.enqueue(fakeFile("b.jpg"));
      await vi.waitFor(() => expect(a.impl).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 20));
      expect(b.impl).not.toHaveBeenCalled();
      expect(queue.getSnapshot().find((i) => i.name === "b.jpg")?.status).toBe("queued");
      a.resolve({});
      await vi.waitFor(() => expect(b.impl).toHaveBeenCalled());
      b.resolve({});
    } finally {
      // @ts-expect-error test stub cleanup
      delete (navigator as any).connection;
    }
  });

  it("one failed file does not stop the rest of the batch", async () => {
    const queue = new UploadQueue();
    const bad = deferredUpload();
    mocks.uploadFile
      .mockImplementationOnce(bad.impl)
      .mockImplementationOnce(async () => ({ id: "ok" }));

    queue.enqueue(fakeFile("bad.jpg"));
    queue.enqueue(fakeFile("good.jpg"));

    bad.reject(new UploadError("You aren't allowed to upload to this album.", "permanent", 403));
    await vi.waitFor(() => {
      const snap = statuses(queue.getSnapshot());
      if (snap["bad.jpg"] !== "error" || snap["good.jpg"] !== "done") throw new Error("pending");
    });
  });

  it("retries TRANSIENT failures automatically with the SAME upload id and backoff", async () => {
    vi.useFakeTimers();
    try {
      const queue = new UploadQueue();
      const seenIds: string[] = [];
      mocks.uploadFile.mockImplementation(async (_f: File, opts: any) => {
        seenIds.push(opts.uploadId);
        if (seenIds.length < 3) {
          throw new UploadError("Network error during upload", "transient", 0);
        }
        return { id: "saved" };
      });

      queue.enqueue(fakeFile("flaky.jpg"));
      await vi.advanceTimersByTimeAsync(50);
      expect(seenIds).toEqual(["id-1"]);
      // Backoff after failure 1 (1s base)…
      await vi.advanceTimersByTimeAsync(1100);
      expect(seenIds).toEqual(["id-1", "id-1"]);
      // …failure 2 (2s backoff)…
      await vi.advanceTimersByTimeAsync(2100);
      expect(seenIds).toEqual(["id-1", "id-1", "id-1"]);
      // …third attempt succeeds.
      await vi.advanceTimersByTimeAsync(50);
      expect(statuses(queue.getSnapshot())["flaky.jpg"]).toBe("done");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops auto-retrying after the bounded attempt count and exposes manual retry", async () => {
    vi.useFakeTimers();
    try {
      const queue = new UploadQueue();
      mocks.uploadFile.mockImplementation(async () => {
        throw new UploadError("The upload stalled", "timeout", null);
      });

      queue.enqueue(fakeFile("doomed.mp4"));
      // 1 immediate + backoff retries (1s, 2s) = 3 attempts total.
      await vi.advanceTimersByTimeAsync(50 + 1100 + 2100 + 100);

      const snap = queue.getSnapshot().find((i) => i.name === "doomed.mp4")!;
      expect(snap.status).toBe("error");
      expect(snap.attempts).toBe(3);
      expect(mocks.uploadFile).toHaveBeenCalledTimes(3);

      // Manual retry starts over, still with the same stable id.
      const ids = mocks.uploadFile.mock.calls.map((c: any) => c[1].uploadId);
      expect(new Set(ids).size).toBe(1);
      mocks.uploadFile.mockImplementationOnce(async () => ({ id: "manual-ok" }));
      queue.retry(snap.id);
      await vi.advanceTimersByTimeAsync(50);
      expect(statuses(queue.getSnapshot())["doomed.mp4"]).toBe("done");
      const idsAfter = mocks.uploadFile.mock.calls.map((c: any) => c[1].uploadId);
      expect(idsAfter.every((id: string) => id === ids[0])).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never auto-retries a PERMANENT failure", async () => {
    const queue = new UploadQueue();
    mocks.uploadFile.mockImplementation(async () => {
      throw new UploadError("That file is too large to upload.", "permanent", 413);
    });

    queue.enqueue(fakeFile("giant.mov"));
    await vi.waitFor(() => {
      if (queue.getSnapshot()[0]?.status !== "error") throw new Error("pending");
    });
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshot()[0].error).toMatch(/too large/i);
  });

  it("honors a 429 Retry-After cooldown before retrying", async () => {
    vi.useFakeTimers();
    try {
      const queue = new UploadQueue();
      let calls = 0;
      mocks.uploadFile.mockImplementation(async () => {
        calls += 1;
        if (calls === 1) {
          throw new UploadError("Too many requests", "transient", 429, 5000);
        }
        return {};
      });

      queue.enqueue(fakeFile("ratelimited.jpg"));
      await vi.advanceTimersByTimeAsync(50);
      expect(calls).toBe(1);
      await vi.advanceTimersByTimeAsync(3000);
      expect(calls).toBe(1); // still cooling down (Retry-After: 5s)
      await vi.advanceTimersByTimeAsync(2500);
      expect(calls).toBe(2);
      expect(statuses(queue.getSnapshot())["ratelimited.jpg"]).toBe("done");
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancelling a running upload aborts it and marks the file cancelled", async () => {
    const queue = new UploadQueue();
    const d = deferredUpload();
    mocks.uploadFile.mockImplementationOnce((file: File, opts: any) => {
      // Simulate the uploader honoring the abort signal.
      opts.signal.addEventListener("abort", () => {
        d.reject(new UploadError("Upload cancelled", "cancelled"));
      });
      return d.promise;
    });

    const id = queue.enqueue(fakeFile("stopme.jpg"));
    await vi.waitFor(() => expect(queue.getSnapshot()[0].status).toBe("uploading"));

    queue.cancel(id);
    await vi.waitFor(() => expect(queue.getSnapshot()[0].status).toBe("cancelled"));
  });

  it("keeps progress below 100% until the server confirms success", async () => {
    const queue = new UploadQueue();
    const d = deferredUpload();
    mocks.uploadFile.mockImplementationOnce(d.impl);

    const id = queue.enqueue(fakeFile("slow.jpg"));
    await vi.waitFor(() => expect(queue.getSnapshot()[0].status).toBe("uploading"));

    d.progress(99); // transport reports bytes sent…
    let item = queue.getSnapshot().find((i) => i.id === id)!;
    expect(item.progress).toBeLessThan(100);

    d.resolve({ id: "row" }); // …server confirms Cloudinary + DB only now.
    await vi.waitFor(() => {
      item = queue.getSnapshot().find((i) => i.id === id)!;
      if (item.status !== "done") throw new Error("pending");
    });
    expect(item.progress).toBe(100);
  });

  it("clearFinished removes done/error/cancelled entries but never active ones", async () => {
    const queue = new UploadQueue();
    const active = deferredUpload();
    mocks.uploadFile
      .mockImplementationOnce(async () => ({})) // done
      .mockImplementationOnce(() => {
        throw new UploadError("Nope", "permanent", 403);
      })
      .mockImplementationOnce(active.impl); // still running

    queue.enqueue(fakeFile("done.jpg"));
    queue.enqueue(fakeFile("bad.jpg"));
    queue.enqueue(fakeFile("running.jpg"));
    await vi.waitFor(() => {
      const s = statuses(queue.getSnapshot());
      if (s["done.jpg"] !== "done" || s["bad.jpg"] !== "error" || s["running.jpg"] !== "uploading") {
        throw new Error("pending");
      }
    });

    queue.clearFinished();
    const names = queue.getSnapshot().map((i) => i.name);
    expect(names).toEqual(["running.jpg"]);
    active.resolve({});
  });
});
