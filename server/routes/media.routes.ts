import type { Express, Request, Response, NextFunction } from "express";
import crypto from "crypto";
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
  mimeFromCloudinaryFormat,
} from "./shared";

// Stable client-generated upload ids: opaque, URL-safe, bounded length.
// The SAME id must be re-sent on a retry of the same file — that is what
// makes a re-attempt after a lost response resolve to the original record
// instead of creating a duplicate (see uploadToCloudinary + createMedia).
const UPLOAD_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function deterministicMediaId(userId: string, uploadId: string): string {
  return `mv_${crypto.createHash("sha256").update(`${userId}:${uploadId}`).digest("hex").slice(0, 32)}`;
}

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

  // Search: literal, case-insensitive text matching across filenames, media
  // types, album names/descriptions and upload dates (YYYY-MM-DD or a
  // year/month prefix). Multiple words narrow the search (AND). Type and
  // favorites filters work with OR without a text query. Results are
  // paginated, newest first, with a deterministic tie-breaker, and locked /
  // orphaned media never appear (see DBStorage.searchMedia).
  app.get("/api/media/search", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : "";
      const typeParam = req.query.type;
      const favoriteParam = req.query.favorite;
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
      const limit = Math.min(60, Math.max(1, parseInt(String(req.query.limit ?? "24"), 10) || 24));

      if (!q.trim() && !typeParam && favoriteParam !== "true" && favoriteParam !== "1") {
        // Nothing to search by — return an empty page rather than the whole
        // account (the client only asks once a query/filter is active).
        return res.json({ items: [], total: 0, page, limit, hasMore: false });
      }

      const type: "image" | "video" | undefined =
        typeParam === "image" || typeParam === "video" ? typeParam : undefined;
      const favorite = favoriteParam === "true" || favoriteParam === "1";

      const result = await storage.searchMedia(req.user!.id, {
        query: q,
        type,
        favorite: favorite || undefined,
        page,
        limit,
      });

      res.json({
        items: signMediaUrls(result.items),
        total: result.total,
        page: result.page,
        limit: result.limit,
        hasMore: page * limit < result.total,
      });
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

      const { albumId, uploadId } = req.body;

      // Stable per-file upload id (client-generated UUID re-used across
      // retries). Invalid ids are ignored rather than rejected, so older
      // clients without one still upload — they just don't get the
      // idempotent-dedup protection.
      const validUploadId =
        typeof uploadId === "string" && UPLOAD_ID_RE.test(uploadId) ? uploadId : null;

      // Verify album belongs to user if albumId is provided.
      //
      // These are TWO different failures and must return different codes —
      // collapsing them into one bare 403 "Forbidden" made real incidents
      // undiagnosable (a stale album URL after a DB reset looks identical
      // to "you don't own this album"):
      //   - albumId doesn't exist (deleted album, stale bookmark/URL after
      //     a database reset/redeploy)  -> 404
      //   - album exists but is owned by a different account -> 403
      if (albumId) {
        const album = await storage.getAlbum(albumId);
        if (!album) {
          return res.status(404).json({ message: "Album not found" });
        }
        if (album.userId !== req.user!.id) {
          console.warn("[upload] rejected — album belongs to a different account", {
            albumId,
            albumOwnerId: album.userId,
            authenticatedUserId: req.user!.id,
          });
          return res.status(403).json({ message: "You can only upload to albums you own" });
        }
      }

      // Determine resource type
      const resourceType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';

      // Upload to Cloudinary (streamed from the temp file multer wrote to
      // disk — see server/routes/shared.ts for why this is no longer a
      // Buffer held in memory)
      const uploaded = await uploadToCloudinary(
        req.file.path,
        req.file.originalname,
        resourceType,
        {
          identity: validUploadId
            ? { userId: req.user!.id, uploadId: validUploadId }
            : undefined,
          mimeType: req.file.mimetype,
          fileSizeBytes: req.file.size,
        }
      );

      // Save to database. With a stable upload id, the row id is
      // deterministic: if this attempt is a retry after a LOST response
      // (the first one actually succeeded), createMedia returns the
      // original row instead of inserting a duplicate.
      const media = await storage.createMedia(
        {
          filename: req.file.originalname,
          path: uploaded.url,
          // What Cloudinary actually stored (after its optimization), not
          // the pre-upload input: the storage meter must reflect saved
          // bytes, and playback must use the delivered type.
          type: mimeFromCloudinaryFormat(uploaded.format, uploaded.resourceType, req.file.mimetype),
          size: uploaded.bytes ?? req.file.size,
          albumId: albumId || null,
        },
        req.user!.id,
        { publicId: uploaded.publicId, resourceType: uploaded.resourceType },
        validUploadId ? { id: deterministicMediaId(req.user!.id, validUploadId) } : undefined
      );

      if (uploaded.reused) {
        console.log("[upload] re-used existing Cloudinary asset + media row for a retried upload", {
          uploadId: validUploadId,
          mediaId: media.id,
        });
      }

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

      // Same 404-vs-403 split as /api/upload (see there for rationale):
      // missing album -> 404, foreign album -> 403.
      if (mediaData.albumId) {
        const album = await storage.getAlbum(mediaData.albumId);
        if (!album) {
          return res.status(404).json({ message: "Album not found" });
        }
        if (album.userId !== req.user!.id) {
          return res.status(403).json({ message: "You can only upload to albums you own" });
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
      if (!targetAlbum) {
        return res.status(404).json({ message: "Album not found" });
      }
      if (targetAlbum.userId !== req.user!.id) {
        return res.status(403).json({ message: "You can only move media to albums you own" });
      }

      const ownedItems = await storage.getMediaByIds(ids, req.user!.id);
      await storage.moveMediaBatch(ownedItems.map((item) => item.id), targetAlbumId);
      res.json({ movedCount: ownedItems.length });
    } catch (error) {
      next(error);
    }
  });
}
