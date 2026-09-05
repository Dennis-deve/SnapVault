import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { uploadFile, newUploadId, UploadError, type UploadErrorKind } from "./upload";

/**
 * The ONE shared upload queue for the whole app (Dashboard and Album Detail
 * both enqueue here). One queue means:
 *   - bounded parallelism no matter how many screens the user hops between,
 *   - per-file status/cancellation/manual-retry for every upload, and
 *   - one failed file no longer aborts the rest of a batch: each file rises
 *     or falls on its own.
 *
 * Worker policy: two files upload concurrently on normal connections; ONE
 * at a time when the user has data-saver on or is on a very slow network,
 * so a phone on 2G isn't fighting itself for bandwidth.
 *
 * Retry policy: only TRANSIENT failures (network errors, stalls/timeouts,
 * 5xx, 429 with its Retry-After, malformed proxy replies) are retried
 * automatically — up to MAX_ATTEMPTS total, with exponential backoff.
 * Permanent failures (wrong account, album gone, file too large, bad
 * credentials) surface immediately with an actionable message and a
 * manual Retry button; retrying them automatically would just waste data.
 *
 * Every attempt of the same file reuses its stable upload id, so a retry
 * after a LOST response resolves to the original record server-side
 * instead of duplicating the file.
 */

export type UploadItemStatus =
  | "queued"
  | "compressing"
  | "uploading"
  | "processing"
  | "done"
  | "error"
  | "cancelled";

export interface UploadItem {
  /** Stable upload id — generated once per file and reused across retries. */
  id: string;
  name: string;
  size: number;
  type: string;
  albumId: string | null;
  status: UploadItemStatus;
  /** 0-100. Only reaches 100 after the server confirmed the save. */
  progress: number;
  error: string | null;
  errorKind: UploadErrorKind | null;
  attempts: number;
  createdAt: number;
}

interface InternalItem extends UploadItem {
  file: File;
  controller: AbortController | null;
  /** Auto-retry backoff timer for a pending transient retry. */
  retryTimer: ReturnType<typeof setTimeout> | null;
}

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 8000;

function connectionIsConstrained(): boolean {
  const conn = (navigator as any)?.connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  const type = typeof conn.effectiveType === "string" ? conn.effectiveType : "";
  return type === "slow-2g" || type === "2g";
}

export class UploadQueue {
  private items = new Map<string, InternalItem>();
  private listeners = new Set<() => void>();
  private snapshot: UploadItem[] = [];
  private inFlight = 0;
  private timerQueued = false;

  /** Snapshot for React (useSyncExternalStore). */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): UploadItem[] => this.snapshot;

  private emit() {
    this.snapshot = Array.from(this.items.values())
      .map(({ file: _file, controller: _controller, retryTimer: _retryTimer, ...rest }) => rest)
      .sort((a, b) => a.createdAt - b.createdAt);
    Array.from(this.listeners).forEach((listener) => listener());
  }

  private schedulePump() {
    if (this.timerQueued) return;
    this.timerQueued = true;
    // Microtask-ish deferral keeps enqueue-then-pump ordering stable.
    Promise.resolve().then(() => {
      this.timerQueued = false;
      this.pump();
    });
  }

  private maxWorkers(): number {
    try {
      return connectionIsConstrained() ? 1 : 2;
    } catch {
      return 2;
    }
  }

  private pump() {
    const max = this.maxWorkers();
    // Keep starting queued work until all workers are busy or nothing is
    // eligible. (One call may start several items; each completion pumps
    // again, so worker slots free up immediately for the next file.)
    while (this.inFlight < max) {
      const next = Array.from(this.items.values()).find(
        (item) => item.status === "queued" && !item.retryTimer
      );
      if (!next) return;
      this.inFlight += 1;
      void this.runItem(next).finally(() => {
        this.inFlight -= 1;
        this.schedulePump();
      });
    }
  }

  enqueue(file: File, albumId?: string): string {
    const id = newUploadId();
    this.items.set(id, {
      id,
      name: file.name,
      size: file.size,
      type: file.type,
      albumId: albumId ?? null,
      status: "queued",
      progress: 0,
      error: null,
      errorKind: null,
      attempts: 0,
      createdAt: Date.now(),
      file,
      controller: null,
      retryTimer: null,
    });
    this.emit();
    this.schedulePump();
    return id;
  }

  enqueueMany(files: File[], albumId?: string): string[] {
    return files.map((file) => this.enqueue(file, albumId));
  }

  private clearRetryTimer(item: InternalItem) {
    if (item.retryTimer !== null) {
      clearTimeout(item.retryTimer);
      item.retryTimer = null;
    }
  }

  cancel(id: string) {
    const item = this.items.get(id);
    if (!item) return;
    if (item.status === "done") return;
    this.clearRetryTimer(item);
    item.controller?.abort();
    if (item.status !== "uploading" && item.status !== "compressing") {
      // Not currently running — mark cancelled directly.
      item.status = "cancelled";
      item.error = null;
      item.errorKind = null;
      this.emit();
    }
    // If it IS currently running, the abort will settle it as cancelled.
  }

  /** Manual retry: works on error/cancelled items; keeps the same stable
   * upload id so the server can dedupe if the failed attempt actually
   * landed. */
  retry(id: string) {
    const item = this.items.get(id);
    if (!item) return;
    if (item.status !== "error" && item.status !== "cancelled") return;
    this.clearRetryTimer(item);
    item.status = "queued";
    item.progress = 0;
    item.error = null;
    item.errorKind = null;
    item.attempts = 0;
    this.emit();
    this.schedulePump();
  }

  /** Remove finished/failed entries from the tracker list. */
  clearFinished() {
    for (const [id, item] of Array.from(this.items.entries())) {
      if (item.status === "done" || item.status === "cancelled" || item.status === "error") {
        if (!this.isRunning(item)) this.items.delete(id);
      }
    }
    this.emit();
  }

  private isRunning(item: InternalItem): boolean {
    return item.status === "uploading" || item.status === "compressing" || item.status === "processing";
  }

  private async runItem(item: InternalItem): Promise<void> {
    item.attempts += 1;

    const controller = new AbortController();
    item.controller = controller;

    // Cancelled while still queued (between pump scheduling and start).
    if (controller.signal.aborted) {
      item.status = "cancelled";
      this.emit();
      return;
    }

    item.status = "compressing";
    item.progress = 0;
    this.emit();

    item.status = "uploading";
    this.emit();

    try {
      await uploadFile(item.file, {
        albumId: item.albumId ?? undefined,
        uploadId: item.id,
        signal: controller.signal,
        onProgress: (percent) => {
          // Only ever move forward; a retried attempt resets to 0 first.
          if (percent > item.progress || percent === 0) {
            item.progress = percent;
            this.emit();
          }
        },
      });
      item.status = "processing";
      item.progress = 99; // server confirmed Cloudinary + DB — about to finish
      item.status = "done";
      item.progress = 100;
      item.error = null;
      item.errorKind = null;
      item.controller = null;
      this.emit();
    } catch (err: any) {
      item.controller = null;

      if (err instanceof UploadError && err.kind === "cancelled") {
        item.status = "cancelled";
        this.emit();
        return;
      }

      const kind: UploadErrorKind =
        err instanceof UploadError ? err.kind : "transient";
      const message: string =
        err instanceof Error ? err.message : "Upload failed. Please retry.";

      const canAutoRetry =
        (kind === "transient" || kind === "timeout") &&
        item.attempts < MAX_ATTEMPTS &&
        !controller.signal.aborted;

      if (canAutoRetry) {
        const retryAfter = err instanceof UploadError ? err.retryAfterMs : null;
        const backoff = Math.min(
          BASE_BACKOFF_MS * Math.pow(2, item.attempts - 1),
          MAX_BACKOFF_MS
        );
        const delay = typeof retryAfter === "number" && retryAfter > 0
          ? Math.min(Math.max(retryAfter, backoff), 60_000)
          : backoff;
        item.status = "queued"; // back in line, but gated on the retry timer
        item.error = `${message} (retrying in ${Math.round(delay / 1000)}s…)`;
        item.errorKind = kind;
        item.progress = 0;
        item.retryTimer = setTimeout(() => {
          item.retryTimer = null;
          this.emit();
          this.schedulePump();
        }, delay);
        this.emit();
        return;
      }

      item.status = "error";
      item.error = message;
      item.errorKind = kind;
      this.emit();
    }
  }
}

/** The app-wide singleton queue. */
export const uploadQueue = new UploadQueue();

/** React binding: re-renders whenever any upload item changes. */
export function useUploadQueue(): {
  items: UploadItem[];
  enqueue: (files: File[], albumId?: string) => string[];
  cancel: (id: string) => void;
  retry: (id: string) => void;
  clearFinished: () => void;
} {
  const items = useSyncExternalStore(uploadQueue.subscribe, uploadQueue.getSnapshot);

  const enqueue = useCallback((files: File[], albumId?: string) => {
    return uploadQueue.enqueueMany(files, albumId);
  }, []);
  const cancel = useCallback((id: string) => uploadQueue.cancel(id), []);
  const retry = useCallback((id: string) => uploadQueue.retry(id), []);
  const clearFinished = useCallback(() => uploadQueue.clearFinished(), []);

  return { items, enqueue, cancel, retry, clearFinished };
}

/**
 * Convenience hook for pages that need "is anything uploading" + a
 * completion effect for cache invalidation.
 */
export function useUploadQueueActivity(albumId?: string | null) {
  const { items } = useUploadQueue();
  const prevDoneIds = useRef<Set<string>>(new Set());
  const [newlyCompleted, setNewlyCompleted] = useState(0);

  const relevant = albumId
    ? items.filter((i) => !i.albumId || i.albumId === albumId)
    : items;

  useEffect(() => {
    const doneIds = new Set(relevant.filter((i) => i.status === "done").map((i) => i.id));
    let added = 0;
    Array.from(doneIds).forEach((id) => {
      if (!prevDoneIds.current.has(id)) {
        added += 1;
      }
    });
    if (added > 0) {
      prevDoneIds.current = doneIds;
      setNewlyCompleted((n) => n + added);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relevant.map((i) => `${i.id}:${i.status}`).join("|")]);

  return {
    items: relevant,
    activeCount: relevant.filter((i) => i.status !== "done" && i.status !== "error" && i.status !== "cancelled").length,
    failedCount: relevant.filter((i) => i.status === "error").length,
    newlyCompleted,
  };
}

/**
 * Returns a counter that increments each time an item in `items` FIRST
 * reaches "done". Pages use it to invalidate their React Query caches
 * exactly once per completed upload (albums, storage usage, search…).
 */
export function useCompletedCounter(items: UploadItem[]): number {
  const prev = useRef<Set<string> | null>(null);
  const [counter, setCounter] = useState(0);
  const doneKey = items.filter((i) => i.status === "done").map((i) => i.id).join(",");

  useEffect(() => {
    const ids = new Set(doneKey ? doneKey.split(",") : []);
    if (prev.current === null) {
      // First render: baseline (queue may already contain done items from
      // an earlier screen — those don't count as "newly completed here").
      prev.current = ids;
      return;
    }
    const previous = prev.current ?? new Set<string>();
    let added = 0;
    Array.from(ids).forEach((id) => {
      if (!previous.has(id)) added += 1;
    });
    prev.current = ids;
    if (added > 0) setCounter((c) => c + added);
  }, [doneKey]);

  return counter;
}
