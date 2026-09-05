// Shared middleware, rate limiters, and helpers used across the route
// modules in this directory. Extracted from what used to be one ~1270-line
// routes.ts so each domain (auth, albums, media, search, public) can be
// reviewed and changed independently.
import type { Express, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
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
  const present = {
    cloud_name: !!process.env.CLOUDINARY_CLOUD_NAME,
    api_key: !!process.env.CLOUDINARY_API_KEY,
    api_secret: !!process.env.CLOUDINARY_API_SECRET,
  };
  return `env present cloud_name=${present.cloud_name} api_key=${present.api_key} api_secret=${present.api_secret}`;
}

// Helper function to upload a file already on disk (see multer diskStorage
// above) to Cloudinary, and remove the temp file once Cloudinary is done
// with it — win or lose.
//
// Videos use Cloudinary's chunked "upload_large" endpoint instead of a
// single-shot upload. It reads the local file in bounded-size chunks
// (CHUNK_SIZE_BYTES each) and uploads them one at a time, which:
//   - keeps server memory flat no matter how large the video is (this is
//     the other half of the memory fix alongside disk-based multer above),
//   - is Cloudinary's documented, recommended path for large/video assets
//     and tolerates flaky mobile-network conditions better than one huge
//     request, since it's resumable per-chunk rather than all-or-nothing.
// Images are small enough that a plain upload is fine and avoids the
// chunking overhead.
const CHUNK_SIZE_BYTES = 6 * 1024 * 1024; // 6MB chunks

type CloudinarySuccess = {
  secure_url?: string;
  url?: string;
  public_id?: string;
  [key: string]: any;
};

export async function uploadToCloudinary(
  filePath: string,
  filename: string,
  resourceType: 'image' | 'video'
): Promise<{ url: string; publicId: string; resourceType: 'image' | 'video' }> {
  const uploadOptions: any = {
    resource_type: resourceType,
    folder: 'cloudmediavault',
    public_id: filename.split('.')[0],
    use_filename: true,
    // SECURITY: 'authenticated' delivery type means the asset is not
    // reachable via a plain/guessed URL — every request must carry a
    // valid Cloudinary signature (see server/mediaUrl.ts, which is what
    // generates that signed URL on every response). Previously assets
    // were uploaded as the default public 'upload' type, so a locked
    // album's media was still a plain, permanently-public URL to anyone
    // who ever saw it, regardless of the album's lock state.
    type: 'authenticated',
  };

  // Optimize for HD: preserve crystal-clear HD quality for images and videos
  if (resourceType === 'image') {
    uploadOptions.quality = 'auto:best'; // Highest quality HD optimization
    uploadOptions.fetch_format = 'auto'; // Auto format (WebP/AVIF for supported browsers)
  } else if (resourceType === 'video') {
    uploadOptions.quality = 'auto:best'; // Automatic HD video quality
    uploadOptions.video_codec = 'auto';
    uploadOptions.chunk_size = CHUNK_SIZE_BYTES;
  }

  // One retry: Cloudinary can transiently 5xx or drop a chunked upload on
  // flaky mobile networks. We retry exactly once, then surface the final
  // error with self-diagnosing details. Temp file cleanup happens after
  // all attempts so the second attempt still has the file.
  let lastError: any = null;

  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await new Promise<CloudinarySuccess>((resolve, reject) => {
          // IMPORTANT: the Cloudinary v2.x SDK invokes the uploader callback with
          // a SINGLE argument — the result object — not the old (error, result)
          // two-argument style. On success it's the plain result
          // ({ secure_url, public_id, ... }); on failure it carries an `.error`
          // field ({ message, http_code, ... }). Treating the first argument as
          // "the error" (as the old code did) meant every SUCCESSFUL upload was
          // rejected as a failure (the client saw a 500 on every upload) and
          // every real Cloudinary error (including a 403 from Cloudinary itself)
          // was swallowed into a generic 500 with no details.
          const callback = (res: any) => {
            if (res && res.error) {
              const diagnosis = diagnoseCloudinaryError(res.error);
              const baseMsg = res.error.message || "unknown error";
              const httpPart = typeof res.error.http_code === "number" ? ` (Cloudinary HTTP ${res.error.http_code})` : "";
              const diagPart = diagnosis ? ` - ${diagnosis}` : "";
              const cloudinaryError: any = new Error(`Cloudinary upload failed: ${baseMsg}${httpPart}${diagPart}`);
              cloudinaryError.status = 502;
              cloudinaryError.cloudinaryHttpCode = res.error.http_code ?? null;
              cloudinaryError.cloudinaryRawMessage = baseMsg;
              cloudinaryError.diagnosis = diagnosis;
              // Extra structured log for Render — makes misconfig visible without leaking secrets
              console.error("[cloudinary] upload error", {
                attempt,
                message: baseMsg,
                http_code: res.error.http_code ?? null,
                diagnosis,
                env: getCloudinaryEnvStatus(),
                filename,
                resourceType,
              });
              reject(cloudinaryError);
            } else {
              resolve(res);
            }
          };

          if (resourceType === 'video') {
            cloudinary.uploader.upload_large(filePath, uploadOptions, callback);
          } else {
            cloudinary.uploader.upload(filePath, uploadOptions, callback);
          }
        });

        // secure_url fallback: some Cloudinary responses (or older SDK
        // versions) may return `url` instead of `secure_url`. Accept either,
        // preferring secure_url. This prevents a false 502 when the upload
        // actually succeeded but used the non-secure field.
        // Additionally, if BOTH url fields are missing but public_id IS present,
        // we can still recover by generating a URL via cloudinary.url() — this
        // is the case the user hit: "missing secure_url/url" even though env
        // vars were all present. That response is still a successful upload;
        // we should not turn it into a 502.
        let effectiveUrl = (result as any)?.secure_url || (result as any)?.url;
        const publicId = (result as any)?.public_id;

        // Extra diagnostics: log the actual shape we got when something is missing
        if (!effectiveUrl || !publicId) {
          const keys = result && typeof result === "object" ? Object.keys(result as any).slice(0, 20) : [];
          const preview = (() => {
            try {
              return JSON.stringify(result).slice(0, 500);
            } catch {
              return String(result).slice(0, 500);
            }
          })();
          console.error("[cloudinary] unexpected response shape", {
            attempt,
            hasSecureUrl: !!(result as any)?.secure_url,
            hasUrl: !!(result as any)?.url,
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
            `Cloudinary upload returned an unexpected response (missing ${!effectiveUrl ? "secure_url/url" : "public_id"}) - ${getCloudinaryEnvStatus()} - keys: ${result && typeof result === "object" ? Object.keys(result as any).join(",") : "no-object"}`
          ) as any;
          missing.status = 502;
          throw missing;
        }

        if (!(result as any).secure_url && (result as any).url) {
          console.warn("[cloudinary] secure_url missing, fell back to url", {
            attempt,
            filename,
            url: (result as any).url,
          });
        }

        return { url: effectiveUrl, publicId, resourceType };
      } catch (err: any) {
        lastError = err;
        // If this was the first attempt, retry once regardless of code —
        // transient network hiccups can happen even on auth errors (e.g. DNS),
        // and a single retry is cheap. Log the retry.
        if (attempt === 1) {
          console.warn("[cloudinary] upload attempt 1 failed, retrying once", {
            message: err?.message,
            http_code: err?.cloudinaryHttpCode ?? null,
            diagnosis: err?.diagnosis ?? null,
            filename,
          });
          // Small delay not required but helps for rate-limit 429
          // Keep it synchronous for test determinism — no actual sleep.
          continue;
        }
        // Second attempt also failed — give up and propagate
        throw err;
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
