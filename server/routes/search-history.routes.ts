import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { insertSearchHistorySchema } from "@shared/schema";
import { requireAuth } from "./shared";

// Recent search history — GET returns the list, POST records a new term
// (called by the client once a search actually settles, not per
// keystroke), DELETE removes one entry or (with no :id) clears all.
export function registerSearchHistoryRoutes(app: Express) {
  app.get("/api/search/recent", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const recent = await storage.getRecentSearchHistory(req.user!.id);
      res.json(recent);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/search/recent", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = insertSearchHistorySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.errors });
      }
      await storage.addSearchHistoryEntry(req.user!.id, parsed.data.query);
      res.status(201).json({ message: "Recorded" });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/search/recent/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await storage.deleteSearchHistoryEntry(req.params.id, req.user!.id);
      res.json({ message: "Removed" });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/search/recent", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await storage.clearSearchHistory(req.user!.id);
      res.json({ message: "Cleared" });
    } catch (error) {
      next(error);
    }
  });
}
