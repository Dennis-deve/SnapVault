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
      publicId = media.cloudinaryPublicId;
      resourceType = media.cloudinaryResourceType;
    } else {
      if (!media.path.includes("cloudinary.com")) return;
      const urlParts = media.path.split("/");
      const filename = urlParts[urlParts.length - 1];
      publicId = `cloudmediavault/${filename.split(".")[0]}`;
      resourceType = media.type.startsWith("video/") ? "video" : "image";
    }

    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: "upload" });
  } catch (cloudinaryError) {
    console.error("Failed to delete from Cloudinary:", cloudinaryError);
  }
}

// Enforces Magic PIN lock on server-side
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
    fileSize: 200 * 1024 * 1024, // 200MB limit
  },
});

// Middleware to check if user is authenticated
export function requireAuth(req: Request, res: Response, next: NextFunction) {
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

// Helper function to upload buffer to Cloudinary with chunked upload_large_stream for videos/large files
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
      type: 'upload', // Standard Cloudinary upload type — works across all accounts without 403 Forbidden
    };

    if (resourceType === 'image') {
      uploadOptions.quality = 'auto:best';
      uploadOptions.fetch_format = 'auto';
    } else if (resourceType === 'video') {
      uploadOptions.quality = 'auto:best';
      uploadOptions.video_codec = 'auto';
    }

    // Use upload_large_stream for files > 20MB to prevent 413 Payload Too Large errors on Cloudinary
    const isLarge = buffer.length > 20 * 1024 * 1024;
    if (isLarge) {
      uploadOptions.chunk_size = 6 * 1024 * 1024; // 6MB chunks
    }

    const callback = (error: any, result: any) => {
      if (error) {
        console.error("Cloudinary upload stream error:", error);
        reject(error);
      } else {
        resolve({ url: result!.secure_url, publicId: result!.public_id, resourceType });
      }
    };

    const uploadStream = isLarge
      ? (cloudinary.uploader as any).upload_large_stream(uploadOptions, callback)
      : cloudinary.uploader.upload_stream(uploadOptions, callback);

    const readableStream = Readable.from(buffer);
    readableStream.pipe(uploadStream);
  });
}
