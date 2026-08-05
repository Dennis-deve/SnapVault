import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { signMediaUrls } from "../mediaUrl";

// Public, unauthenticated read routes for shared albums. Deliberately
// return a minimal projection (no userId, no lock state, etc.) — this is
// the one place in the API that intentionally has no requireAuth, so it
// must not leak anything beyond what the album owner explicitly shared.
export function registerPublicRoutes(app: Express) {
  app.get("/api/public/albums/:shareToken", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const album = await storage.getAlbumByShareToken(req.params.shareToken);
      if (!album || !album.isPublic) {
        return res.status(404).json({ message: "This shared album doesn't exist or is no longer available" });
      }

      const mediaItems = await storage.getMediaByAlbumId(album.id);
      res.json({
        name: album.name,
        description: album.description,
        itemCount: mediaItems.length,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/public/albums/:shareToken/media", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const album = await storage.getAlbumByShareToken(req.params.shareToken);
      if (!album || !album.isPublic) {
        return res.status(404).json({ message: "This shared album doesn't exist or is no longer available" });
      }

      const mediaItems = await storage.getMediaByAlbumId(album.id);
      // Minimal projection — no ids tying back to internal records beyond
      // what's needed to render a read-only gallery.
      const publicItems = signMediaUrls(mediaItems).map((m) => ({
        id: m.id,
        filename: m.filename,
        type: m.type,
        path: m.path,
        thumbnailPath: (m as any).thumbnailPath,
      }));
      res.json(publicItems);
    } catch (error) {
      next(error);
    }
  });

  // Fallback redirect if a user accesses a /shared/:shareToken link directly on the API server URL
  app.get("/shared/:shareToken", (req: Request, res: Response) => {
    const frontendUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL;
    if (frontendUrl) {
      const target = `${frontendUrl.replace(/\/$/, "")}/shared/${req.params.shareToken}`;
      return res.redirect(302, target);
    }
    res.status(404).send("Shared album link must be accessed on the frontend web app URL.");
  });
}
