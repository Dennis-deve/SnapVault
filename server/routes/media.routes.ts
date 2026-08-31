import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { insertMediaSchema } from "@shared/schema";
import { signMediaUrl, signMediaUrls } from "../mediaUrl";
import {
  requireAuth,
  upload,
  assertAlbumReadable,
  deleteFromCloudinary,
  uploadToCloudinary,
  cleanupTempFile,
} from "./shared";

export function registerMediaRoutes(app: Express) {
  app.get("/api/albums/:albumId/media", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const album = await storage.getAlbum(req.params.albumId);

      if (!album) {
        return res.status(404).json({ message: "Album not found" });
      }

      if (album.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (!assertAlbumReadable(req, res, album)) return;

      const mediaItems = await storage.getMediaByAlbumId(req.params.albumId);
      res.json(signMediaUrls(mediaItems));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/media", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const mediaItems = await storage.getMediaByUserId(req.user!.id);
      res.json(signMediaUrls(mediaItems));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/media/search", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query.q as string;

      if (!query) {
        return res.status(400).json({ message: "Query parameter 'q' is required" });
      }

      const mediaItems = await storage.searchMedia(req.user!.id, query);
      res.json(signMediaUrls(mediaItems));
    } catch (error) {
      next(error);
    }
  });

  // New Cloudinary upload endpoint
  app.post("/api/upload", requireAuth, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log("Upload request received:", {
        hasFile: !!req.file,
        bodyKeys: Object.keys(req.body),
        user: req.user?.id,
        headers: {
          contentType: req.headers['content-type'],
          contentLength: req.headers['content-length']
        }
      });

      if (!req.file) {
        console.error("No file in request");
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { albumId } = req.body;

      // Verify album belongs to user if albumId is provided
      if (albumId) {
        const album = await storage.getAlbum(albumId);
        if (!album || album.userId !== req.user!.id) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }

      // Determine resource type
      const resourceType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';

      console.log("Uploading to Cloudinary:", {
        filename: req.file.originalname,
        size: req.file.size,
        type: resourceType
      });

      // Upload to Cloudinary (streamed from the temp file multer wrote to
      // disk — see server/routes/shared.ts for why this is no longer a
      // Buffer held in memory)
      const uploaded = await uploadToCloudinary(
        req.file.path,
        req.file.originalname,
        resourceType
      );

      console.log("Upload successful, saving to DB");

      // Save to database
      const media = await storage.createMedia(
        {
          filename: req.file.originalname,
          path: uploaded.url,
          type: req.file.mimetype,
          size: req.file.size,
          albumId: albumId || null,
        },
        req.user!.id,
        { publicId: uploaded.publicId, resourceType: uploaded.resourceType }
      );

      res.json(signMediaUrl(media));
    } catch (error) {
      console.error("Upload error:", error);
      next(error);
    } finally {
      // Defensive cleanup: uploadToCloudinary already removes the temp file
      // on both success and failure, so this is a harmless no-op in the
      // normal path. It only matters for the early-return branches above
      // (no albumId ownership, etc.) where multer wrote a temp file to disk
      // but uploadToCloudinary was never reached to clean it up.
      if (req.file) {
        await cleanupTempFile(req.file.path);
      }
    }
  });

  // Legacy base64 upload endpoint (keep for backward compatibility). Note:
  // media created through this path has no Cloudinary identity captured
  // (the client posts an already-hosted URL directly), so it's never
  // eligible for signed delivery — it's returned as-is.
  app.post("/api/media", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const mediaData = insertMediaSchema.parse(req.body);

      // Verify album belongs to user if albumId is provided
      if (mediaData.albumId) {
        const album = await storage.getAlbum(mediaData.albumId);
        if (!album || album.userId !== req.user!.id) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }

      const media = await storage.createMedia(mediaData, req.user!.id);
      res.json(media);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      next(error);
    }
  });

  app.delete("/api/media/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const media = await storage.getMedia(req.params.id);

      if (!media) {
        return res.status(404).json({ message: "Media not found" });
      }

      if (media.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await deleteFromCloudinary(media);

      await storage.deleteMedia(req.params.id);
      res.json({ message: "Media deleted successfully" });
    } catch (error) {
      next(error);
    }
  });

  // Toggle favorite on a single media item — backs the heart button in
  // MediaViewer and the "Favorites" filter pill on Album Detail/Search.
  app.patch("/api/media/:id/favorite", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const mediaItem = await storage.getMedia(req.params.id);

      if (!mediaItem) {
        return res.status(404).json({ message: "Media not found" });
      }
      if (mediaItem.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const isFavorite = typeof req.body?.isFavorite === "boolean"
        ? req.body.isFavorite
        : !mediaItem.isFavorite;

      await storage.setMediaFavorite(req.params.id, isFavorite);
      res.json({ id: req.params.id, isFavorite });
    } catch (error) {
      next(error);
    }
  });

  // Batch delete — backs the Figma "Select" multi-select mode on Album
  // Detail. getMediaByIds is scoped to req.user!.id, so ids belonging to
  // another user are silently dropped rather than deleted, instead of
  // trusting whatever list of ids the client sends.
  app.post("/api/media/batch-delete", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id: any) => typeof id === "string") : [];
      if (ids.length === 0) {
        return res.status(400).json({ message: "ids must be a non-empty array" });
      }

      const ownedItems = await storage.getMediaByIds(ids, req.user!.id);

      for (const item of ownedItems) {
        await deleteFromCloudinary(item);
      }

      await storage.deleteMediaBatch(ownedItems.map((item) => item.id));
      res.json({ deletedCount: ownedItems.length });
    } catch (error) {
      next(error);
    }
  });

  // Batch move — the other half of "Select" mode (move selection to a
  // different album).
  app.post("/api/media/batch-move", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id: any) => typeof id === "string") : [];
      const targetAlbumId = req.body?.albumId;

      if (ids.length === 0 || typeof targetAlbumId !== "string") {
        return res.status(400).json({ message: "ids (array) and albumId (string) are required" });
      }

      const targetAlbum = await storage.getAlbum(targetAlbumId);
      if (!targetAlbum || targetAlbum.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const ownedItems = await storage.getMediaByIds(ids, req.user!.id);
      await storage.moveMediaBatch(ownedItems.map((item) => item.id), targetAlbumId);
      res.json({ movedCount: ownedItems.length });
    } catch (error) {
      next(error);
    }
  });
}
