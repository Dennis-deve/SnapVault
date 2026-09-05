import type { Express, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { storage } from "../storage";
import { insertAlbumSchema } from "@shared/schema";
import { generateAlbumUnlockToken } from "../jwt";
import { signMediaUrl } from "../mediaUrl";
import { authLimiter, requireAuth, assertAlbumReadable, deleteFromCloudinary } from "./shared";

export function registerAlbumRoutes(app: Express) {
  // Same policy as auth.routes.ts: share links always use the CONFIGURED
  // frontend URL; the production Host header is never trusted as a
  // fallback, because an attacker-controlled Host must not be able to mint
  // share links pointing at their own domain.
  const getAppBaseUrl = (req: Request): string | null => {
    const configured = process.env.CLIENT_URL || process.env.FRONTEND_URL;
    if (configured) return configured.replace(/\/$/, "");
    if (process.env.NODE_ENV === "production") return null;
    return `${req.protocol}://${req.get("host")}`;
  };

  app.get("/api/albums", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const albums = await storage.getAlbumsByUserId(req.user!.id);

      // Get media count and thumbnail for each album
      const albumsWithCount = await Promise.all(
        albums.map(async (album) => {
          const mediaItems = await storage.getMediaByAlbumId(album.id);
          // Get first media item as thumbnail (prefer images over videos)
          const images = mediaItems.filter(m => m.type.startsWith('image/'));
          const thumbnailItem = images.length > 0 ? images[0] : mediaItems[0];
          const thumbnail = thumbnailItem ? signMediaUrl(thumbnailItem).path : null;

          return {
            ...album,
            itemCount: mediaItems.length,
            // SECURITY: never return a direct Cloudinary thumbnail URL for a
            // locked album — that URL is a public link and would let anyone
            // who sees this API response view the "protected" image without
            // ever entering the PIN, defeating the lock entirely.
            thumbnail: album.isLocked ? null : thumbnail,
          };
        })
      );

      res.json(albumsWithCount);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/albums", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { isLocked, pin, ...rest } = req.body;
      const albumData = insertAlbumSchema.parse(rest);

      let shouldLock = false;
      if (isLocked) {
        if (!req.user!.pin && !pin) {
          return res.status(400).json({ message: "Please set up a Magic PIN first to create a locked album" });
        }
        if (pin) {
          if (!req.user!.pin) {
            const hashedPin = await bcrypt.hash(pin, 10);
            await storage.updateUserPin(req.user!.id, hashedPin);
            req.user!.pin = hashedPin;
          } else {
            const isPinValid = await bcrypt.compare(pin, req.user!.pin);
            if (!isPinValid) {
              return res.status(401).json({ message: "Invalid Magic PIN" });
            }
          }
        }
        shouldLock = true;
      }

      const album = await storage.createAlbum(
        { ...albumData, isLocked: shouldLock ? 1 : 0 },
        req.user!.id
      );
      res.json(album);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      next(error);
    }
  });

  app.get("/api/albums/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const album = await storage.getAlbum(req.params.id);

      if (!album) {
        return res.status(404).json({ message: "Album not found" });
      }

      if (album.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (!assertAlbumReadable(req, res, album)) return;

      res.json(album);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/albums/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const album = await storage.getAlbum(req.params.id);

      if (!album) {
        return res.status(404).json({ message: "Album not found" });
      }

      if (album.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Delete all media in the album first — both the database rows AND
      // the underlying Cloudinary assets. Previously only the rows were
      // deleted, so every photo in a deleted album kept occupying storage
      // (and billing) forever. Provider cleanup failures are logged for
      // investigation but do not block deleting the rows: the local state
      // must still end up consistent.
      const mediaItems = await storage.getMediaByAlbumId(req.params.id);
      await Promise.all(
        mediaItems.map(async (media) => {
          try {
            await deleteFromCloudinary(media);
          } catch (err: any) {
            console.error("[album-delete] Cloudinary cleanup failed (asset left in provider storage):", {
              mediaId: media.id,
              publicId: media.cloudinaryPublicId ?? null,
              error: err?.message || String(err),
            });
          }
          await storage.deleteMedia(media.id);
        })
      );

      // The album's share link (if any) dies with the album: the row — and
      // its shareToken — are removed entirely.
      await storage.deleteAlbum(req.params.id);
      res.json({ message: "Album deleted successfully" });
    } catch (error) {
      next(error);
    }
  });

  // Lock/Unlock album routes
  app.post("/api/albums/:id/lock", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { pin } = req.body;

      if (!req.user!.pin) {
        return res.status(400).json({ message: "Please set up a Magic PIN in Settings first" });
      }

      // Verify PIN with bcrypt
      const isPinValid = await bcrypt.compare(pin, req.user!.pin);
      if (!isPinValid) {
        return res.status(401).json({ message: "Invalid PIN" });
      }

      const album = await storage.getAlbum(req.params.id);

      if (!album) {
        return res.status(404).json({ message: "Album not found" });
      }

      if (album.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await storage.lockAlbum(req.params.id);

      // SECURITY: locking a shared album now PERMANENTLY revokes its share
      // link (token destroyed, not just disabled). The old behavior of
      // leaving the token in place meant a link that was handed out while
      // the album was unlocked silently started working again after a
      // lock/unlock cycle. Locking is a privacy action; the token dies.
      // Sharing again after unlocking mints a fresh link.
      if (album.isPublic || album.shareToken) {
        await storage.revokeAlbumSharing(req.params.id);
      }

      res.json({ message: "Album locked successfully" });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/albums/:id/unlock", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { pin } = req.body;

      if (!req.user!.pin) {
        return res.status(400).json({ message: "Magic PIN not set" });
      }

      // Verify PIN with bcrypt
      const isPinValid = await bcrypt.compare(pin, req.user!.pin);
      if (!isPinValid) {
        return res.status(401).json({ message: "Invalid PIN" });
      }

      const album = await storage.getAlbum(req.params.id);

      if (!album) {
        return res.status(404).json({ message: "Album not found" });
      }

      if (album.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await storage.unlockAlbum(req.params.id);
      res.json({ message: "Album unlocked successfully" });
    } catch (error) {
      next(error);
    }
  });

  // Enable a public share link for an album. Requires the user's global
  // sharing preference to be on (Settings > Privacy > Public Sharing) — an
  // album-level toggle alone would be confusing if the account-level kill
  // switch is off but individual albums still "work."
  app.post("/api/albums/:id/share", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const album = await storage.getAlbum(req.params.id);
      if (!album) {
        return res.status(404).json({ message: "Album not found" });
      }
      if (album.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (album.isLocked) {
        return res.status(400).json({ message: "Unlock this album before sharing it" });
      }

      // Auto-enable public sharing preference on the owner's account if off
      if (!req.user!.publicSharingEnabled) {
        await storage.setPublicSharingEnabled(req.user!.id, true);
        req.user!.publicSharingEnabled = 1;
      }

      // Token policy: a STILL-ACTIVE link (album currently public with a
      // token) is reused when copied again, so refreshes of the share sheet
      // don't hand out different URLs. A token that was revoked by
      // unsharing, locking, or the account-wide kill switch is gone for
      // good — mint a fresh one. This is what makes revocation permanent.
      const shareToken =
        album.isPublic && album.shareToken
          ? album.shareToken
          : crypto.randomBytes(24).toString("base64url");
      const updated = await storage.setAlbumSharing(req.params.id, true, shareToken);

      const baseUrl = getAppBaseUrl(req);
      if (!baseUrl) {
        console.error("[albums] CLIENT_URL/FRONTEND_URL is not set; cannot build a share link.");
        return res.status(503).json({ message: "Share links are misconfigured on this server (no frontend URL set)." });
      }
      const shareUrl = `${baseUrl.replace(/\/$/, "")}/shared/${updated.shareToken}`;

      res.json({ isPublic: true, shareUrl, shareToken: updated.shareToken });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/albums/:id/unshare", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const album = await storage.getAlbum(req.params.id);
      if (!album) {
        return res.status(404).json({ message: "Album not found" });
      }
      if (album.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // "Stop sharing" is permanent for THIS link: the token is destroyed,
      // not parked. Anyone holding the old URL immediately gets the
      // "no longer available" response, and re-sharing later generates a
      // brand-new link (see POST /:id/share). Files a visitor already
      // downloaded/saved while the link was live are of course theirs.
      await storage.revokeAlbumSharing(req.params.id);
      res.json({ isPublic: false });
    } catch (error) {
      next(error);
    }
  });

  // Verify the Magic PIN for one specific locked album and, if correct,
  // issue a short-lived unlock token scoped to that album only. The client
  // must send this token back as the x-album-unlock-token header on
  // subsequent reads of the album (see assertAlbumReadable in shared.ts).
  // This is what makes the PIN a real server-side access control rather
  // than a client-side-only UI gate.
  app.post("/api/albums/:id/unlock-session", requireAuth, authLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { pin } = req.body;

      const album = await storage.getAlbum(req.params.id);
      if (!album) {
        return res.status(404).json({ message: "Album not found" });
      }
      if (album.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (!album.isLocked) {
        // Nothing to unlock — avoid requiring a PIN for an unlocked album.
        return res.json({ unlockToken: null, locked: false });
      }

      if (!req.user!.pin) {
        return res.status(400).json({ message: "Please set up a Magic PIN in Settings first" });
      }

      const isPinValid = await bcrypt.compare(pin || "", req.user!.pin);
      if (!isPinValid) {
        return res.status(401).json({ message: "Invalid PIN" });
      }

      const unlockToken = generateAlbumUnlockToken(req.user!.id, album.id);
      res.json({ unlockToken, locked: true, expiresIn: "15m" });
    } catch (error) {
      next(error);
    }
  });
}
