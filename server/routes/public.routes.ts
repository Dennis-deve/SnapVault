import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { signMediaUrls } from "../mediaUrl";

// Public, unauthenticated read routes for shared albums. Deliberately
// return a minimal projection (no userId, no lock state, etc.) — this is
// the one place in the API that intentionally has no requireAuth, so it
// must not leak anything beyond what the album owner explicitly shared.
//
// Every response is sent with Cache-Control: no-store (plus Pragma and
// Expires for older intermediaries): a share link that has been revoked
// must not keep serving cached copies from a CDN or browser cache.
export function registerPublicRoutes(app: Express) {
  const NO_STORE_HEADERS = {
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  };

  // All four gates an album must pass before its shared contents are
  // served. Returns null (and writes the 404 itself) when access must be
  // denied — the response is identical for "never existed", "revoked" and
  // "owner disappeared" so anonymous callers can't distinguish them.
  const resolveSharedAlbum = async (shareToken: string, res: Response) => {
    const album = await storage.getAlbumByShareToken(shareToken);

    // 1. Link must exist and be live (isPublic). Unsharing/locking/the
    //    account kill switch all destroy the token outright, so a revoked
    //    link no longer matches any row at all.
    // 2. Defense in depth on the lock state: locking revokes the share, but
    //    if a future code path ever violates that invariant, this check
    //    still refuses to serve a locked album's contents.
    if (!album || !album.isPublic || album.isLocked) {
      res.status(404).json({ message: "This shared album doesn't exist or is no longer available" });
      return null;
    }

    // 3. The owner's account must still exist (media of deleted accounts
    //    must not stay publicly reachable through old links).
    const owner = await storage.getUser(album.userId);
    if (!owner) {
      res.status(404).json({ message: "This shared album doesn't exist or is no longer available" });
      return null;
    }

    // 4. The account-wide public-sharing preference must be ON. Flipping
    //    it off in Settings is an instant, account-wide revocation.
    if (!owner.publicSharingEnabled) {
      res.status(404).json({ message: "This shared album doesn't exist or is no longer available" });
      return null;
    }

    return { album, owner };
  };

  app.get("/api/public/albums/:shareToken", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resolved = await resolveSharedAlbum(req.params.shareToken, res);
      if (!resolved) return;

      const mediaItems = await storage.getMediaByAlbumId(resolved.album.id);
      res.set(NO_STORE_HEADERS).json({
        name: resolved.album.name,
        description: resolved.album.description,
        itemCount: mediaItems.length,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/public/albums/:shareToken/media", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resolved = await resolveSharedAlbum(req.params.shareToken, res);
      if (!resolved) return;

      const mediaItems = await storage.getMediaByAlbumId(resolved.album.id);
      // Minimal projection — no ids tying back to internal records beyond
      // what's needed to render a read-only gallery. Photos and videos both
      // come back with correctly signed delivery URLs (videos additionally
      // get a signed poster/thumbnail URL).
      const publicItems = signMediaUrls(mediaItems).map((m) => ({
        id: m.id,
        filename: m.filename,
        type: m.type,
        path: m.path,
        thumbnailPath: (m as any).thumbnailPath,
      }));
      res.set(NO_STORE_HEADERS).json(publicItems);
    } catch (error) {
      next(error);
    }
  });

  // NOTE: there is deliberately NO /shared/:token handler here anymore.
  // The SPA route /shared/:token is served by the frontend: on a
  // monolithic deployment the static catch-all in server/index.ts serves
  // index.html for it, and on the split deployment Render's static site
  // serves it (with the /* -> /index.html rewrite). The old 302 interceptor
  // on the API hijacked the monolithic path and redirected to an external
  // URL that might not even be configured.
}
