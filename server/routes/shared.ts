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

  try {
    const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
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
          const cloudinaryError: any = new Error(
            `Cloudinary upload failed: ${res.error.message || "unknown error"}` +
              (typeof res.error.http_code === "number" ? ` (Cloudinary HTTP ${res.error.http_code})` : "")
          );
          // Upstream storage failure: report it as 502 so the client knows
          // the file was received by SnapVault but the storage backend
          // rejected it — NOT as a 4xx, which the client reads as
          // "you're not allowed to do this".
          cloudinaryError.status = 502;
          cloudinaryError.cloudinaryHttpCode = res.error.http_code ?? null;
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

    if (!result || !result.secure_url || !result.public_id) {
      const missing = new Error("Cloudinary upload returned an unexpected response (missing secure_url/public_id)") as any;
      missing.status = 502;
      throw missing;
    }

    return { url: result.secure_url, publicId: result.public_id, resourceType };
  } finally {
    // Runs whether the upload succeeded or failed — the temp file has no
    // further use either way. Awaited so the file is guaranteed gone by
    // the time this function returns, rather than racing the caller.
    await cleanupTempFile(filePath);
  }
}
