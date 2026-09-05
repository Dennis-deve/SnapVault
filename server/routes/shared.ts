// Shared middleware, rate limiters, and helpers used across the route
// modules in this directory. Extracted from what used to be one ~1270-line
// routes.ts so each domain (auth, albums, media, search, public) can be
// reviewed and changed independently.
import type { Express, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import type { UploadApiOptions, UploadApiResponse, UploadResponseCallback } from "cloudinary";
import cloudinary from "../cloudinary";
import { authenticateFlexible, verifyAlbumUnlockToken } from "../jwt";
import type { Album } from "@shared/schema";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

// Rate limiter for auth endpoints (stricter) — protects against distributed
// (single-IP) brute force.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: "Too many attempts, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

// SECURITY: IP-based rate limiting alone doesn't stop a targeted attack on a
// single account from many IPs. Track failed attempts per email as well and
// temporarily lock that specific account out regardless of source IP.
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const FAILED_LOGIN_MAX_ATTEMPTS = 8;
const failedLoginAttempts = new Map<string, { count: number; firstAttemptAt: number }>();

export function isAccountLoginLocked(email: string): boolean {
  const entry = failedLoginAttempts.get(email.toLowerCase());
  if (!entry) return false;
  if (Date.now() - entry.firstAttemptAt > FAILED_LOGIN_WINDOW_MS) {
    failedLoginAttempts.delete(email.toLowerCase());
    return false;
  }
  return entry.count >= FAILED_LOGIN_MAX_ATTEMPTS;
}

export function recordFailedLogin(email: string): void {
  const key = email.toLowerCase();
  const entry = failedLoginAttempts.get(key);
  if (!entry || Date.now() - entry.firstAttemptAt > FAILED_LOGIN_WINDOW_MS) {
    failedLoginAttempts.set(key, { count: 1, firstAttemptAt: Date.now() });
  } else {
    entry.count += 1;
  }
}

export function clearFailedLogins(email: string): void {
  failedLoginAttempts.delete(email.toLowerCase());
}

// Extract a Cloudinary public_id from a stored secure_url and delete the
// underlying asset. Shared by the media-delete and account-delete routes so
// a future fix only needs to happen in one place.
export async function deleteFromCloudinary(media: { path: string; type: string; cloudinaryPublicId?: string | null; cloudinaryResourceType?: string | null }): Promise<void> {
  try {
    let publicId: string;
    let resourceType: string;

    if (media.cloudinaryPublicId && media.cloudinaryResourceType) {
      // Preferred path: explicit identity stored at upload time.
      publicId = media.cloudinaryPublicId;
      resourceType = media.cloudinaryResourceType;
    } else {
      // Legacy fallback for rows uploaded before we stored identity
      // explicitly — parse it back out of the URL as the app did originally.
      if (!media.path.includes("cloudinary.com")) return;
      const urlParts = media.path.split("/");
      const filename = urlParts[urlParts.length - 1];
      publicId = `cloudmediavault/${filename.split(".")[0]}`;
      resourceType = media.type.startsWith("video/") ? "video" : "image";
    }

    // Legacy assets are on the public 'upload' delivery type; newer ones are
    // 'authenticated' (see uploadToCloudinary). Try the type this asset was
    // actually stored under; harmless if it's a no-op for an already-gone
    // asset.
    const type = media.cloudinaryPublicId ? "authenticated" : "upload";
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type });
  } catch (cloudinaryError) {
    console.error("Failed to delete from Cloudinary:", cloudinaryError);
    // Continue even if Cloudinary deletion fails — don't block DB cleanup.
  }
}

// SECURITY: this is the check that actually enforces the Magic PIN lock on
// the server. Previously, isLocked was stored but never read on the GET
// paths, so a locked album's contents were readable by anyone who could
// reach the endpoint with the owner's session/token — the PIN dialog was a
// client-side-only gate. Now, a locked album additionally requires a valid,
// short-lived "album unlock token" obtained from
// POST /api/albums/:id/unlock-session (which itself requires the PIN).
export function assertAlbumReadable(req: Request, res: Response, album: Album): boolean {
  if (!album.isLocked) return true;

  const unlockToken = req.header("x-album-unlock-token");
  if (unlockToken && verifyAlbumUnlockToken(unlockToken, req.user!.id, album.id)) {
    return true;
  }

  res.status(423).json({ message: "This album is locked. Enter the Magic PIN to view it.", locked: true });
  return false;
}

// RELIABILITY: uploads used to use multer.memoryStorage(), which holds the
// *entire* file in a single Buffer in the Node process's heap before it's
// ever forwarded to Cloudinary. On a small hosting instance (this app's
// free-tier Render/Railway plans), a single large phone-recorded video
// (100-200MB) can be enough to push the process over its memory ceiling on
// its own, and a couple of concurrent uploads make an out-of-memory crash
// close to guaranteed. It also meant the request body had to be fully
// received before any Cloudinary upload could even start.
//
// Fix: stream to a temp file on disk instead (multer.diskStorage). Disk
// writes happen incrementally as bytes arrive over the network, so memory
// usage stays flat (a small internal buffer) regardless of file size. The
// resulting file path is then handed to Cloudinary's chunked "upload_large"
// API (see uploadToCloudinary below), which reads it back off disk in
// bounded-size chunks rather than loading it into memory either. End to
// end, RAM usage no longer scales with upload size.
const TMP_UPLOAD_DIR = path.join(os.tmpdir(), "snapvault-uploads");
fs.mkdirSync(TMP_UPLOAD_DIR, { recursive: true });

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TMP_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      // Random name to avoid collisions between concurrent uploads;
      // preserve the extension since Cloudinary/ffprobe-style sniffing
      // sometimes relies on it.
      const ext = path.extname(file.originalname) || "";
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit (supports 100+MB files)
  },
});

// Best-effort cleanup of a temp upload file. Never throws — cleanup failures
// shouldn't fail the request, they just leave a stray file for the OS temp
// dir to reclaim. Returns a promise so callers that care about the file
// actually being gone (e.g. before responding, or in tests) can await it;
// callers that don't care can call it without awaiting.
export async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch (err: any) {
    if (err?.code !== "ENOENT") {
      console.error("Failed to remove temp upload file:", filePath, err);
    }
  }
}

// Middleware to check if user is authenticated (supports both session and JWT)
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Use flexible authentication (session OR JWT)
  return authenticateFlexible(req, res, next);
}

// Health check endpoint for Render
export function setupHealthCheck(app: Express) {
  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development"
    });
  });
}

// ---------------------------------------------------------------------------
// Cloudinary error self-diagnosis helpers (new in 6458d17)
// ---------------------------------------------------------------------------

/**
 * Inspect a Cloudinary error object and return a human-actionable hint about
 * which env var or config is likely wrong. This makes 502s self-diagnosing
 * in Render logs and in the client-visible message, instead of a generic
 * "Cloudinary upload failed".
 */
export function diagnoseCloudinaryError(err: { message?: string; http_code?: number }): string {
  const raw = (err.message || "").toLowerCase();
  const code = err.http_code;

  // Most specific first — these substrings appear verbatim in Cloudinary
  // error messages for misconfigured credentials.
  if (raw.includes("api_key") || raw.includes("api key") || raw.includes("invalid api key") || raw.includes("unknown api key") || raw.includes("must supply api_key")) {
    return "Check CLOUDINARY_API_KEY - it appears invalid, unknown, or missing";
  }
  if (raw.includes("cloud_name") || raw.includes("cloud name") || raw.includes("unknown cloud") || raw.includes("invalid cloud") || raw.includes("unknown account") || raw.includes("account not found")) {
    return "Check CLOUDINARY_CLOUD_NAME - it appears invalid or unknown (unknown account)";
  }
  if (raw.includes("api_secret") || raw.includes("invalid signature") || raw.includes("signature") || raw.includes("authentication")) {
    return "Check CLOUDINARY_API_SECRET - signature verification failed";
  }
  if (raw.includes("rate limit") || raw.includes("too many requests")) {
    return "Rate limited by Cloudinary - retry after a moment";
  }
  if (raw.includes("file size") || raw.includes("too large") || raw.includes("payload too large")) {
    return "File too large for Cloudinary plan - check size limits";
  }

  // Fallback to http_code based hints
  if (code === 401) return "Authentication failed - verify CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET";
  if (code === 403) return "Permission denied by Cloudinary - check account permissions, plan limits, and credentials";
  if (code === 404) return "Cloudinary resource or cloud not found - verify CLOUDINARY_CLOUD_NAME";
  if (code === 429) return "Rate limited by Cloudinary - retry after a moment";
  if (code && code >= 500) return "Cloudinary service error - transient, retry may help";

  return "";
}

function getCloudinaryEnvStatus(): string {
  // Use the actual Render variable names, not the SDK's lower-case option
  // names. Report presence only — never log credential values.
  const names = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
  return `env present ${names.map((name) => `${name}=${!!process.env[name]}`).join(" ")}`;
}

// ---------------------------------------------------------------------------
// Cloudinary upload policy
// ---------------------------------------------------------------------------

// Chunked uploads for videos AND for still images above this size: the
// chunked endpoint streams the file in bounded pieces, keeping server
// memory flat regardless of file size (see multer diskStorage above).
const CHUNK_SIZE_BYTES = 6 * 1024 * 1024; // 6MB chunks
const LARGE_IMAGE_CHUNK_THRESHOLD_BYTES = 20 * 1024 * 1024; // 20MB

// Only transient provider/network failures are retried, a bounded number of
// times with exponential backoff. Permanent failures (bad credentials,
// disallowed format, plan/size limits) are surfaced immediately —
// re-sending a rejected file can never succeed and just wastes the user's
// bandwidth.
const TRANSIENT_HTTP_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_UPLOAD_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = process.env.NODE_ENV === "test" ? 10 : 400;
const RETRY_MAX_DELAY_MS = process.env.NODE_ENV === "test" ? 40 : 4000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientUploadError(err: any): boolean {
  if (!err) return false;
  const message = String(err.cloudinaryRawMessage ?? err.message ?? "").toLowerCase();
  // "Already exists" is not an error for us: it means a previous attempt of
  // the same idempotent upload succeeded but the response was lost. Handled
  // by the caller, never retried.
  if (message.includes("already exists")) return false;
  if (typeof err.cloudinaryHttpCode === "number") {
    return TRANSIENT_HTTP_CODES.has(err.cloudinaryHttpCode);
  }
  // No HTTP code at all usually means the request never got a response
  // (network blip, dropped connection, DNS) — transient by nature.
  return true;
}

export interface CloudinaryUploadIdentity {
  userId: string;
  /** Stable, client-generated id for THIS file upload. Reused across
   * retries, which is what makes uploads idempotent end to end. */
  uploadId: string;
}

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  resourceType: "image" | "video";
  /** Provider-reported optimized byte count (null when unavailable). */
  bytes: number | null;
  /** Provider-reported stored format/extension (null when unavailable). */
  format: string | null;
  /** True when Cloudinary reported "already exists" — the asset from an
   * earlier (response-lost) attempt of the same upload id is what's there. */
  reused: boolean;
}

// Map a Cloudinary stored format back to a MIME type for the media row, so
// the database reflects what Cloudinary actually stored after optimization
// (e.g. an input image/jpeg may be delivered/stored differently) rather
// than the pre-upload input type.
const FORMAT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  bmp: "image/bmp",
  tiff: "image/tiff",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  ogv: "video/ogg",
  flv: "video/x-flv",
  m3u8: "application/x-mpegURL",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  aac: "audio/aac",
};

export function mimeFromCloudinaryFormat(format: string | null, resourceType: string, fallback: string): string {
  if (!format) return fallback;
  const mapped = FORMAT_TO_MIME[format.toLowerCase()];
  if (mapped) return mapped;
  return `${resourceType}/${format.toLowerCase()}`;
}

/**
 * Upload a file already on disk (see multer diskStorage above) to
 * Cloudinary, and remove the temp file once Cloudinary is done with it —
 * win or lose.
 *
 * Identity/dedup policy: with a stable (userId, uploadId) pair the
 * Cloudinary public id is deterministic and namespaced per account, and
 * `overwrite: false` guarantees a retry can never overwrite a DIFFERENT
 * asset — two users uploading "photo.jpg" get two distinct assets, and a
 * re-sent attempt of the same upload lands on the same id.
 *
 * Quality policy: supported still photos (JPEG/HEIC) get content-aware
 * quality optimization ("auto:good" — high quality, no forced resize).
 * Containers that may hold animation (GIF/WebP/PNG/APNG/…) and other
 * unsupported formats are stored as-is — never flattened, never converted
 * to a static frame. Videos are transcoded by Cloudinary AFTER transfer to
 * broadly playable H.264/MP4 with content-aware quality — no forced
 * resizing, no frame-rate reduction, and no browser-side FFmpeg.
 *
 * Callback contract: ../cloudinary exports v2, whose public API is
 * error-first — callback(undefined, result) on success, callback(error) on
 * failure. The single-result callback belongs to the internal v1 uploader.
 * Reading only the first v2 argument discards every success result and
 * incorrectly reports an "empty response" even with valid env (this was the
 * original upload bug; see FIX_NOTES_AND_PUSH_INSTRUCTIONS.md).
 */
export async function uploadToCloudinary(
  filePath: string,
  filename: string,
  resourceType: "image" | "video",
  opts?: { identity?: CloudinaryUploadIdentity; mimeType?: string; fileSizeBytes?: number }
): Promise<CloudinaryUploadResult> {
  const identity = opts?.identity;
  const mimeType = (opts?.mimeType ?? "").toLowerCase();
  const fileSize = opts?.fileSizeBytes ?? 0;

  const uploadOptions: UploadApiOptions = {
    // This helper owns the Promise and handles errors via the callback.
    // Otherwise the SDK also rejects an unused internal Promise on failure,
    // which can become an unhandled rejection (including for upload_large).
    disable_promises: true,
    resource_type: resourceType,
    // SECURITY: 'authenticated' delivery type means the asset is not
    // reachable via a plain/guessed URL — every request must carry a
    // valid Cloudinary signature (see server/mediaUrl.ts, which is what
    // generates that signed URL on every response). Previously assets
    // were uploaded as the default public 'upload' type, so a locked
    // album's media was still a plain, permanently-public URL to anyone
    // who ever saw it, regardless of the album's lock state.
    type: "authenticated",
    // IDEMPOTENCE: never overwrite. Combined with deterministic public
    // ids (below) this makes a retried upload safe: it either re-uses the
    // existing asset or fails with "already exists" (mapped to success).
    overwrite: false,
  };

  if (identity) {
    // Namespaced, deterministic asset id: per-account folder + the stable
    // client upload id. A same-named file from another account, or another
    // file from the same account, can never collide onto this id.
    uploadOptions.folder = `cloudmediavault/${identity.userId}`;
    uploadOptions.public_id = identity.uploadId;
    uploadOptions.use_filename = false;
    uploadOptions.unique_filename = false;
  } else {
    // Legacy/other clients without a stable upload id: keep Cloudinary's
    // unique-name behavior so nothing can ever be overwritten.
    uploadOptions.folder = "cloudmediavault";
    uploadOptions.use_filename = true;
    uploadOptions.unique_filename = true;
  }

  // Content-aware optimization. Only applied to formats where it cannot
  // change the nature of the asset: animated/unknown image containers are
  // retained byte-for-byte rather than risk flattening animation to a
  // single frame.
  if (resourceType === "image") {
    const isStaticStillPhoto =
      mimeType === "image/jpeg" || mimeType === "image/jpg" ||
      mimeType === "image/heic" || mimeType === "image/heif" ||
      (!mimeType && /\.(jpe?g|heic|heif)$/i.test(filename));
    if (isStaticStillPhoto) {
      uploadOptions.quality = "auto:good"; // content-aware, high quality, no resize
    }
    // GIF/WebP/PNG/APNG and other containers: no transformation — retained.
  } else {
    // Broad playability: H.264 in an MP4 container, content-aware quality.
    // Deliberately NO width/height/crop and NO frame-rate reduction.
    uploadOptions.video_codec = "h264";
    uploadOptions.format = "mp4";
    uploadOptions.quality = "auto";
  }

  // Chunked transfer for videos (always) and for large images: bounded
  // 6MB pieces keep server memory flat and tolerate flaky networks better
  // than one huge request.
  const useChunkedUpload =
    resourceType === "video" ||
    (resourceType === "image" && fileSize > LARGE_IMAGE_CHUNK_THRESHOLD_BYTES);
  if (useChunkedUpload) {
    uploadOptions.chunk_size = CHUNK_SIZE_BYTES;
  }

  let lastError: any = null;
  let attempt = 0;

  try {
    while (attempt < MAX_UPLOAD_ATTEMPTS) {
      attempt += 1;
      // "already exists" from a previous iteration is converted below the
      // loop via lastError handling — break out and handle it as a reuse.
      try {
        const result = await new Promise<UploadApiResponse>((resolve, reject) => {
          const callback: UploadResponseCallback = (error, res) => {
            if (error) {
              const message = error.message || "unknown error";
              const isReuse =
                typeof message === "string" && message.toLowerCase().includes("already exists");
              const reuseError = isReuse
                ? Object.assign(new Error(`Cloudinary asset already exists: ${message}`), {
                    reuse: true,
                  })
                : null;
              if (reuseError) {
                reject(reuseError);
                return;
              }

              const diagnosis = diagnoseCloudinaryError(error);
              const baseMsg = message;
              const httpPart = typeof error.http_code === "number" ? ` (Cloudinary HTTP ${error.http_code})` : "";
              const diagPart = diagnosis ? ` - ${diagnosis}` : "";
              const cloudinaryError = Object.assign(
                new Error(`Cloudinary upload failed: ${baseMsg}${httpPart}${diagPart}`),
                {
                  status: 502,
                  cloudinaryHttpCode: error.http_code ?? null,
                  cloudinaryRawMessage: baseMsg,
                  diagnosis,
                },
              );
              console.error("[cloudinary] upload error", {
                attempt,
                message: baseMsg,
                http_code: error.http_code ?? null,
                name: error.name ?? null,
                diagnosis,
                env: getCloudinaryEnvStatus(),
                filename,
                resourceType,
              });
              reject(cloudinaryError);
              return;
            }

            if (!res || typeof res !== "object") {
              const cloudinaryError = Object.assign(
                new Error(`Cloudinary upload returned empty response - ${getCloudinaryEnvStatus()}`),
                { status: 502 },
              );
              console.error("[cloudinary] empty response", {
                attempt,
                env: getCloudinaryEnvStatus(),
                filename,
                resourceType,
              });
              reject(cloudinaryError);
              return;
            }

            resolve(res);
          };

          if (useChunkedUpload) {
            cloudinary.uploader.upload_large(filePath, uploadOptions, callback);
          } else {
            cloudinary.uploader.upload(filePath, uploadOptions, callback);
          }
        });

        // secure_url fallback: some Cloudinary responses (or older SDK
        // versions) may return `url` instead of `secure_url`. Accept either,
        // preferring secure_url. This prevents a false 502 when the upload
        // actually succeeded but used the non-secure field.
        let effectiveUrl = result.secure_url || result.url;
        const publicId = result.public_id;

        // Extra diagnostics: log the actual shape we got when something is missing
        if (!effectiveUrl || !publicId) {
          const keys = result && typeof result === "object" ? Object.keys(result).slice(0, 20) : [];
          const preview = (() => {
            try {
              return JSON.stringify(result).slice(0, 500);
            } catch {
              return String(result).slice(0, 500);
            }
          })();
          console.error("[cloudinary] unexpected response shape", {
            attempt,
            hasSecureUrl: !!result.secure_url,
            hasUrl: !!result.url,
            hasPublicId: !!publicId,
            keys,
            preview,
            env: getCloudinaryEnvStatus(),
            filename,
            resourceType,
          });
        }

        // If we have a public_id but no url, try to synthesize a secure url
        // via the SDK. This is safe because signMediaUrl() will re-sign it
        // anyway — we just need *a* url to store.
        if (!effectiveUrl && publicId) {
          try {
            const generated = cloudinary.url(publicId, {
              secure: true,
              resource_type: resourceType,
              type: "authenticated",
            });
            if (generated) {
              console.warn("[cloudinary] secure_url/url missing, generated from public_id", {
                attempt,
                filename,
                publicId,
                generated,
              });
              effectiveUrl = generated;
            }
          } catch (genErr) {
            console.error("[cloudinary] failed to generate url from public_id", {
              attempt,
              publicId,
              error: (genErr as any)?.message || String(genErr),
            });
          }
        }

        // Final fallback: if we have public_id, use it as url placeholder
        // (signMediaUrl will replace it with a proper signed url). Only
        // fail if we truly have no identifier at all.
        if (!effectiveUrl && publicId) {
          console.warn("[cloudinary] using public_id as url placeholder", {
            attempt,
            publicId,
            filename,
          });
          effectiveUrl = publicId;
        }

        if (!effectiveUrl || !publicId) {
          const missing = new Error(
            `Cloudinary upload returned an unexpected response (missing ${!effectiveUrl ? "secure_url/url" : "public_id"}) - ${getCloudinaryEnvStatus()} - keys: ${result && typeof result === "object" ? Object.keys(result).join(",") : "no-object"}`
          ) as any;
          missing.status = 502;
          throw missing;
        }

        if (!result.secure_url && result.url) {
          console.warn("[cloudinary] secure_url missing, fell back to url", {
            attempt,
            filename,
            url: result.url,
          });
        }

        // Store what Cloudinary actually has after its optimization: the
        // provider's own byte count and format, not the input's. The
        // storage meter then reflects saved media, and playback uses the
        // real delivered type.
        const bytes = typeof (result as any).bytes === "number" ? (result as any).bytes : null;
        const format = typeof result.format === "string" && result.format ? result.format : null;

        return { url: effectiveUrl, publicId, resourceType, bytes, format, reused: false };
      } catch (err: any) {
        // IDEMPOTENT REUSE: the asset already exists from an earlier
        // attempt of this same upload (its response was lost). Not an
        // error — build the result from the deterministic id so the DB
        // layer can return the original row.
        if (err?.reuse) {
          const publicId = identity
            ? `cloudmediavault/${identity.userId}/${identity.uploadId}`
            : null;
          if (publicId) {
            let url = "";
            try {
              url = cloudinary.url(publicId, {
                secure: true,
                resource_type: resourceType,
                type: "authenticated",
              });
            } catch {
              url = publicId;
            }
            return { url, publicId, resourceType, bytes: null, format: null, reused: true };
          }
        }

        lastError = err;
        const transient = isTransientUploadError(err);
        if (!transient || attempt >= MAX_UPLOAD_ATTEMPTS) {
          // Permanent failure, or transient failures that exhausted the
          // attempt budget: propagate with the diagnosis attached.
          throw err;
        }
        const delay = Math.min(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1), RETRY_MAX_DELAY_MS);
        console.warn("[cloudinary] transient upload failure, backing off before retry", {
          attempt,
          nextAttempt: attempt + 1,
          delayMs: delay,
          message: err?.message,
          http_code: err?.cloudinaryHttpCode ?? null,
          filename,
        });
        await sleep(delay);
      }
    }
    // Should be unreachable — loop either returns or throws
    throw lastError;
  } finally {
    // Runs whether the upload succeeded or failed — the temp file has no
    // further use either way. Awaited so the file is guaranteed gone by
    // the time this function returns, rather than racing the caller.
    await cleanupTempFile(filePath);
  }
}
