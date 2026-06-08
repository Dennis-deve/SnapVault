import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "snapvault-jwt-secret-change-in-production";
const JWT_EXPIRY = "7d"; // 7 days

export interface JWTPayload {
  userId: string;
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
