import jwt from "jsonwebtoken";
import crypto from "crypto";
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

export const LOGIN_TOKEN_PURPOSE = "login";

export interface JWTPayload {
  userId: string;
  purpose: typeof LOGIN_TOKEN_PURPOSE;
  // Credential version — a short fingerprint of the account's current
  // login credential (password hash, or Google id for passwordless
  // accounts). Changing the password changes the fingerprint, which
  // invalidates every previously issued login token without needing a new
  // database column. Tokens issued before this field existed ( rollout
  // note: see FEATURE_FIXES.md) fail verification, so their owners simply
  // sign in again.
  credver?: string;
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

type TokenUserLike = { id: string; password?: string | null; googleId?: string | null };

/**
 * Derive the credential version for an account. Deliberately not the raw
 * password hash — just an irreversible short fingerprint of it, enough to
 * detect "the credential changed since this token was signed".
 */
export function credentialVersionFor(user: TokenUserLike): string {
  const basis = user.password ?? user.googleId ?? "no-credential";
  return crypto.createHash("sha256").update(`${user.id}:${basis}`).digest("hex").slice(0, 16);
}

// Generate JWT token. Accepts either a full user row (preferred — needed to
// embed the credential version) or, for compatibility with older call sites,
// a bare user id (such tokens carry no credential version and therefore
// never pass verifyLoginToken; use the user-row form everywhere).
export function generateToken(userOrId: TokenUserLike | string): string {
  if (typeof userOrId === "string") {
    return jwt.sign({ userId: userOrId, purpose: LOGIN_TOKEN_PURPOSE }, JWT_SECRET, {
      expiresIn: JWT_EXPIRY,
    });
  }
  return jwt.sign(
    { userId: userOrId.id, purpose: LOGIN_TOKEN_PURPOSE, credver: credentialVersionFor(userOrId) },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

// Verify a JWT's signature and that it is a LOGIN token (not an album-unlock
// token or anything else minted with the same secret). Returns the payload
// only for well-formed login tokens; callers must additionally check the
// credential version against the current user row (verifyLoginToken).
export function verifyToken(token: string): JWTPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as Partial<JWTPayload> & { purpose?: string };
    if (payload.purpose !== LOGIN_TOKEN_PURPOSE || typeof payload.userId !== "string") {
      return null;
    }
    return payload as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Full login-token verification: signature + purpose + credential version
 * against the account's CURRENT credential. This is what makes "reset your
 * password" also kick out every previously issued login token — the stored
 * password hash changed, so old tokens no longer match.
 */
export function verifyLoginToken(token: string, user: TokenUserLike): JWTPayload | null {
  const payload = verifyToken(token);
  if (!payload) return null;
  if (typeof payload.credver !== "string") return null; // pre-credential-version token
  if (payload.credver !== credentialVersionFor(user)) return null;
  return payload;
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
        // verifyLoginToken (not just verifyToken): an album-unlock token,
        // a token from before credential versions existed, or a token whose
        // credential version no longer matches (password was reset) must
        // all be rejected here — previously any signed, unexpired token
        // for a existing user id kept working forever.
        if (user && verifyLoginToken(token, user)) {
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
