import { getApiUrl } from "./api";

/**
 * Client-side upload helpers.
 *
 * Two layers:
 *  1. compressImage — OPTIONAL, conservative in-browser optimization of
 *     static JPEG/PNG photos to high-quality WebP. Never changes
 *     dimensions, never upscales, never flattens transparency, and only
 *     keeps a result that actually saves ≥5% of the input bytes. Anything
 *     else (HEIC, GIF/animated containers, huge images that would blow a
 *     mobile canvas limit, encoding failures/timeouts) bypasses compression
 *     and uploads the original file — compression must never block or break
 *     an upload.
 *  2. uploadFile — a single POST /api/upload with a STABLE per-file upload
 *     id (server-side idempotency/dedup), cancellation, an idle timeout,
 *     capped progress (100% only after the server confirms), and errors
 *     classified into transient (retryable with backoff) vs permanent
 *     (surfaced to the user immediately).
 *
 * What compression deliberately does NOT claim: it cannot restore detail
 * that was never captured, cannot guarantee a specific size reduction, and
 * produces lossy WebP (that's the point — smaller at high visual quality).
 */

export type UploadErrorKind = "transient" | "permanent" | "cancelled" | "timeout";

export class UploadError extends Error {
  kind: UploadErrorKind;
  status: number | null;
  retryAfterMs: number | null;

  constructor(message: string, kind: UploadErrorKind, status: number | null = null, retryAfterMs: number | null = null) {
    super(message);
    this.name = "UploadError";
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

// ---------------------------------------------------------------------------
// 1. Browser-side image compression (static JPEG/PNG → high-quality WebP)
// ---------------------------------------------------------------------------

/** Below this size compression isn't worth the battery/time. */
const MIN_COMPRESS_BYTES = 100 * 1024;
/** Above this pixel area, mobile canvases commonly fail or silently
 * downscale (iOS ≈ 16.7MP) — bypass rather than risk a broken encode. */
const MAX_SAFE_CANVAS_PIXELS = 16_000_000;
/** Hard ceiling on the whole encode attempt. */
const COMPRESSION_DEADLINE_MS = 15_000;
/** A compressed result is only accepted if it saves at least this much. */
const MIN_SAVINGS_RATIO = 0.95;
/** WebP encode quality — high by construction (this is lossy, but gently). */
const WEBP_QUALITY = 0.92;

function newUploadId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // Fallback for very old browsers: still stable+unique for the session.
  return `up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export { newUploadId };

interface DecodedImage {
  width: number;
  height: number;
  drawTo: (canvas: HTMLCanvasElement) => void;
  release: () => void;
}

async function decodeImage(file: File): Promise<DecodedImage> {
  // Prefer createImageBitmap: no giant data-URL in memory, honors EXIF
  // orientation with imageOrientation: 'from-image'.
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    return {
      width: bitmap.width,
      height: bitmap.height,
      drawTo: (canvas) => {
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0);
      },
      release: () => bitmap.close(),
    };
  }

  // Fallback: <img> + object URL (older Safari).
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(() => reject(new Error("decode timeout")), 8000);
      image.onload = () => {
        clearTimeout(timer);
        resolve(image);
      };
      image.onerror = () => {
        clearTimeout(timer);
        reject(new Error("decode failed"));
      };
      image.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      drawTo: (canvas) => {
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.drawImage(img, 0, 0);
      },
      release: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    } catch {
      resolve(null);
    }
  });
}

/** Heuristic guard: containers that might hold animation are never
 * re-encoded client-side (a canvas would flatten them to one frame). Only
 * plain JPEG and PNG inputs are considered static photos. */
export function isCompressibleImage(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  if (type === "image/jpeg" || type === "image/jpg") return true;
  if (type === "image/png") return true;
  // Some browsers report an empty type; fall back to extension — but only
  // for definitively-static extensions (never .gif/.webp/.avif/.heic…).
  if (!type && (/\.jpe?g$/.test(name) || /\.png$/.test(name))) return true;
  return false;
}

/**
 * Compress a static JPEG/PNG photo to high-quality WebP, preserving exact
 * dimensions (no upscaling, no downscaling) and transparency. Resolves
 * with the ORIGINAL file whenever anything is uncertain — the safe outcome
 * is "upload unchanged", never "fail" or "worse quality".
 */
export async function compressImage(file: File): Promise<File> {
  try {
    if (!isCompressibleImage(file)) return file;
    if (file.size < MIN_COMPRESS_BYTES) return file;

    const decoded = await decodeImage(file);
    try {
      const { width, height } = decoded;
      if (!width || !height) return file;
      if (width * height > MAX_SAFE_CANVAS_PIXELS) return file; // too large to encode safely

      // Overall deadline: a wedged decode/encode on a slow phone must not
      // stall the upload — fall back to the original.
      const deadline = Date.now() + COMPRESSION_DEADLINE_MS;
      if (Date.now() > deadline) return file;

      const canvas = document.createElement("canvas");
      // EXACT original dimensions: no upscaling of low-resolution images,
      // no resolution reduction of large ones.
      canvas.width = width;
      canvas.height = height;
      decoded.drawTo(canvas);

      const blob = await Promise.race([
        canvasToBlob(canvas, "image/webp", WEBP_QUALITY),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.max(0, deadline - Date.now()))),
      ]);
      if (!blob) return file;

      const outputIsWebp = blob.type === "image/webp";
      const outputIsPng = blob.type === "image/png";
      const inputIsPng = (file.type || "").toLowerCase() === "image/png" || (!file.type && /\.png$/.test(file.name.toLowerCase()));

      // Transparency must survive: WebP keeps alpha. If the browser can't
      // encode WebP and hands back a PNG, that's acceptable ONLY for PNG
      // inputs (a JPEG→PNG would balloon). Never accept a JPEG blob — that
      // would flatten transparency.
      const typeAcceptable = outputIsWebp || (inputIsPng && outputIsPng);
      if (!typeAcceptable) return file;

      // Only keep the result if it genuinely saves ≥5% of the input bytes.
      if (blob.size >= file.size * MIN_SAVINGS_RATIO) return file;

      return new File([blob], file.name, {
        type: blob.type,
        lastModified: file.lastModified || Date.now(),
      });
    } finally {
      try {
        decoded.release();
      } catch {
        // ignore release failures
      }
    }
  } catch {
    return file;
  }
}

// ---------------------------------------------------------------------------
// 2. Single-file upload via XHR (progress + cancellation + classification)
// ---------------------------------------------------------------------------

// Statuses that indicate the request never reached a healthy handler and a
// retry has a real chance of working.
const TRANSIENT_STATUS = new Set([0, 408, 425, 429, 500, 502, 503, 504]);

// Progress is capped here until the server has CONFIRMED success (parsed
// response) — bytes leaving the device is not the same as a saved photo.
const PRE_CONFIRM_PROGRESS_CAP = 95;

/** How long without ANY upload activity (no progress event) before we give
 * up and treat the upload as stalled. Generous: big videos on slow links
 * legitimately have long gaps between chunk acknowledgements; this only
 * catches a truly dead connection. */
const IDLE_TIMEOUT_MS = 60_000;

/**
 * Turn a failed upload response into a message a human can act on. The
 * server's JSON `message` is the source of truth when it's present.
 */
export function describeUploadError(status: number, bodyText: string): string {
  let serverMessage = "";
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed && typeof parsed.message === "string" && parsed.message) {
      serverMessage = parsed.message;
    }
  } catch {
    // Non-JSON body (e.g. an HTML error page from a proxy) — fall through.
  }

  const fallback = `Upload failed (error code ${status})`;
  if (status === 401) {
    return "Your session expired. Please log in again and try the upload.";
  }
  if (status === 403) {
    if (serverMessage.includes("albums you own")) {
      return "This album belongs to a different account. Log out, log back in, and make sure you're uploading to an album from THIS account.";
    }
    return serverMessage || "You aren't allowed to upload to this album.";
  }
  if (status === 404) {
    return serverMessage || "That album no longer exists (it may have been deleted). Go back to your albums and pick a different one.";
  }
  if (status === 413) {
    return "That file is too large to upload.";
  }
  if (status === 502) {
    return serverMessage || "The photo/video storage is temporarily unavailable. Please try again in a moment.";
  }
  if (status >= 500) {
    return serverMessage || "The server hit a problem while uploading. Please try again.";
  }
  return serverMessage || fallback;
}

export interface UploadFileOptions {
  albumId?: string;
  /** Stable id for this file upload — MUST be reused when retrying the
   * same file; the server uses it to deduplicate after a lost response. */
  uploadId: string;
  /** Aborts the upload (cancellation from the queue UI). */
  signal?: AbortSignal;
  /** 0-100. Reaches 100 only after the server confirmed success. */
  onProgress?: (percent: number) => void;
}

export function uploadFile(
  file: File,
  options: UploadFileOptions
): Promise<any> {
  const { albumId, uploadId, signal, onProgress } = options;

  return (async () => {
    // Compression is best-effort: on any hesitation we upload the original.
    const fileToUpload = await compressImage(file);

    const formData = new FormData();
    formData.append("file", fileToUpload);
    formData.append("uploadId", uploadId);
    if (albumId) {
      formData.append("albumId", albumId);
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      let settled = false;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;

      const resetIdleTimer = () => {
        if (idleTimer !== null) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          xhr.abort();
          // Distinguish "cancelled by the user" from "stalled".
          (xhr as any).__snapvaultTimedOut = true;
        }, IDLE_TIMEOUT_MS);
      };

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (idleTimer !== null) clearTimeout(idleTimer);
        fn();
      };

      const onAbort = () => {
        finish(() =>
          reject(
            (xhr as any).__snapvaultTimedOut
              ? new UploadError(
                  "The upload stalled (no data moving). Check your connection and try again.",
                  "timeout"
                )
              : new UploadError("Upload cancelled", "cancelled")
          )
        );
      };

      signal?.addEventListener(
        "abort",
        () => {
          xhr.abort();
        },
        { once: true }
      );

      xhr.upload.addEventListener("progress", (e) => {
        resetIdleTimer();
        if (e.lengthComputable && onProgress) {
          const raw = (e.loaded / e.total) * 100;
          // Cap below 100 until the server has confirmed the save.
          onProgress(Math.min(PRE_CONFIRM_PROGRESS_CAP, Math.round(raw)));
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const parsed = JSON.parse(xhr.responseText);
            onProgress?.(100);
            finish(() => resolve(parsed));
          } catch {
            // A 2xx with a non-JSON body is a malformed intermediary reply
            // (captive portal / proxy corruption) — retryable, not success.
            finish(() =>
              reject(
                new UploadError(
                  "The server's response was unreadable (proxy interference?). Retrying is safe.",
                  "transient",
                  xhr.status
                )
              )
            );
          }
        } else {
          const message = describeUploadError(xhr.status, xhr.responseText);
          // Rate limited: honor Retry-After when the server sends one.
          let retryAfterMs: number | null = null;
          if (xhr.status === 429) {
            const ra = xhr.getResponseHeader("Retry-After");
            const seconds = ra ? parseInt(ra, 10) : NaN;
            if (!Number.isNaN(seconds)) retryAfterMs = seconds * 1000;
          }
          finish(() =>
            reject(
              new UploadError(
                message,
                TRANSIENT_STATUS.has(xhr.status) ? "transient" : "permanent",
                xhr.status,
                retryAfterMs
              )
            )
          );
        }
      });

      xhr.addEventListener("error", () => {
        finish(() =>
          reject(
            new UploadError(
              "Network error during upload — your file was not necessarily lost, retrying is safe.",
              "transient",
              0
            )
          )
        );
      });

      xhr.addEventListener("abort", onAbort);

      resetIdleTimer();
      xhr.open("POST", getApiUrl("/api/upload"));

      const token = localStorage.getItem("auth_token");
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      xhr.withCredentials = true;
      xhr.send(formData);
    });
  })();
}
