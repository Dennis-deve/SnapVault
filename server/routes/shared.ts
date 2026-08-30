// Shared middleware, rate limiters, and helpers used across the route
// modules in this directory. Extracted from what used to be one ~1270-line
// routes.ts so each domain (auth, albums, media, search, public) can be
// reviewed and changed independently.
import type { Express, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import cloudinary from "../cloudinary";
import { Readable } from "stream";
import { authenticateFlexible, verifyAlbumUnlockToken } from "../jwt";
import type { Album } from "@shared/schema";

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

// Configure Multer for memory storage with 200MB limit for large videos
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit (supports 100+MB files)
  },
});

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

// Helper function to upload buffer to Cloudinary
export async function uploadToCloudinary(
  buffer: Buffer,
  filename: string,
  resourceType: 'image' | 'video'
): Promise<{ url: string; publicId: string; resourceType: 'image' | 'video' }> {
  return new Promise((resolve, reject) => {
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
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) reject(error);
        else resolve({ url: result!.secure_url, publicId: result!.public_id, resourceType });
      }
    );

    const readableStream = Readable.from(buffer);
    readableStream.pipe(uploadStream);
  });
}
