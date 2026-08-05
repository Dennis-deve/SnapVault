import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { requireAuth } from "./shared";

// Storage usage — powers the dashboard StorageCard, which previously
// existed in the codebase but was never wired up to real data.
export function registerStorageRoutes(app: Express) {
  app.get("/api/storage/usage", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const usedBytes = await storage.getUserStorageUsageBytes(req.user!.id);
      const totalBytes = Number(process.env.STORAGE_QUOTA_BYTES) || 15 * 1024 * 1024 * 1024; // 15GB default
      res.json({
        usedBytes,
        totalBytes,
        usedGB: usedBytes / (1024 * 1024 * 1024),
        totalGB: totalBytes / (1024 * 1024 * 1024),
      });
    } catch (error) {
      next(error);
    }
  });
}
