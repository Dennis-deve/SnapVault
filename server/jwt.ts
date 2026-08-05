import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

// SECURITY: never fall back to a hardcoded secret in production. A guessable
// signing key lets an attacker forge valid tokens for any user.
const INSECURE_DEV_SECRET = "snapvault-jwt-secret-change-in-production";

function resolveSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (secret) return secret;

  if (process.env.NODE_ENV === "production") {
    // Fail loudly at startup rather than silently signing tokens with a
    // public, well-known string that anyone can read on GitHub.
    throw new Error(
      "JWT_SECRET (or SESSION_SECRET) must be set in production. Refusing to start with an insecure default signing key."
    );
  }

  console.warn(
    "[jwt] WARNING: JWT_SECRET is not set. Using an insecure development-only secret. Set JWT_SECRET before deploying."
  );
  return INSECURE_DEV_SECRET;
}

const JWT_SECRET = resolveSecret();
const JWT_EXPIRY = "7d"; // 7 days
const ALBUM_UNLOCK_EXPIRY = "15m"; // short-lived: re-verify PIN periodically

export interface JWTPayload {
  userId: string;
  iat?: number;
  exp?: number;
}

export interface AlbumUnlockPayload {
  userId: string;
  albumId: string;
  purpose: "album-unlock";
  iat?: number;
  exp?: number;
}

// Generate JWT token
export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

// Verify JWT token
export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    return null;
  }
}

// Generate a short-lived token proving the caller supplied the correct
// Magic PIN for a specific locked album. This is what actually gates
// server-side access to a locked album's contents (see routes.ts).
export function generateAlbumUnlockToken(userId: string, albumId: string): string {
  const payload: AlbumUnlockPayload = { userId, albumId, purpose: "album-unlock" };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ALBUM_UNLOCK_EXPIRY });
}

export function verifyAlbumUnlockToken(token: string, userId: string, albumId: string): boolean {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AlbumUnlockPayload;
    return (
      payload.purpose === "album-unlock" &&
      payload.userId === userId &&
      payload.albumId === albumId
    );
  } catch {
    return false;
  }
}

// Middleware to authenticate requests with JWT
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  // Check for token in Authorization header
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") 
    ? authHeader.substring(7) 
    : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const payload = verifyToken(token);
  
  if (!payload) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  // Attach user ID to request for downstream use
  (req as any).userId = payload.userId;
  
  next();
}

// Optional middleware that allows both session and JWT auth
export async function authenticateFlexible(req: Request, res: Response, next: NextFunction) {
  // Try JWT first
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") 
    ? authHeader.substring(7) 
    : null;

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      // Load user from database and attach to request
      try {
        const { storage } = await import("./storage");
        const user = await storage.getUser(payload.userId);
        if (user) {
          (req as any).user = user;
          return next();
        }
      } catch (error) {
        console.error("Error loading user from JWT:", error);
      }
    }
  }

  // Fall back to session
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }

  return res.status(401).json({ message: "Authentication required" });
}
