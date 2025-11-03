import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { insertUserSchema, insertAlbumSchema, insertMediaSchema } from "@shared/schema";
import { z } from "zod";

// Middleware to check if user is authenticated
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth routes
  app.post("/api/auth/signup", async (req, res, next) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Hash password (but keep PIN in plain text - it's just a convenience feature)
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      // Create user
      const user = await storage.createUser({
        ...userData,
        password: hashedPassword,
        pin: userData.pin || null, // Store PIN as-is (plain text)
      });

      // Log in the user
      req.login(user, (err) => {
        if (err) return next(err);
        return res.json({
          id: user.id,
          email: user.email,
          pin: user.pin,
        });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      next(error);
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }

      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        return res.json({
          id: user.id,
          email: user.email,
          pin: user.pin,
        });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json({
      id: req.user!.id,
      email: req.user!.email,
      pin: req.user!.pin,
    });
  });

  // Album routes
  app.get("/api/albums", requireAuth, async (req, res, next) => {
    try {
      const albums = await storage.getAlbumsByUserId(req.user!.id);
      
      // Get media count for each album
      const albumsWithCount = await Promise.all(
        albums.map(async (album) => {
          const mediaItems = await storage.getMediaByAlbumId(album.id);
          return {
            ...album,
            itemCount: mediaItems.length,
          };
        })
      );
      
      res.json(albumsWithCount);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/albums", requireAuth, async (req, res, next) => {
    try {
      const albumData = insertAlbumSchema.parse(req.body);
      const album = await storage.createAlbum(albumData, req.user!.id);
      res.json(album);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      next(error);
    }
  });

  app.get("/api/albums/:id", requireAuth, async (req, res, next) => {
    try {
      const album = await storage.getAlbum(req.params.id);
      
      if (!album) {
        return res.status(404).json({ message: "Album not found" });
      }
      
      if (album.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      res.json(album);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/albums/:id", requireAuth, async (req, res, next) => {
    try {
      const album = await storage.getAlbum(req.params.id);
      
      if (!album) {
        return res.status(404).json({ message: "Album not found" });
      }
      
      if (album.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      // Delete all media in the album first
      const mediaItems = await storage.getMediaByAlbumId(req.params.id);
      await Promise.all(mediaItems.map((media) => storage.deleteMedia(media.id)));
      
      await storage.deleteAlbum(req.params.id);
      res.json({ message: "Album deleted successfully" });
    } catch (error) {
      next(error);
    }
  });

  // Media routes
  app.get("/api/albums/:albumId/media", requireAuth, async (req, res, next) => {
    try {
      const album = await storage.getAlbum(req.params.albumId);
      
      if (!album) {
        return res.status(404).json({ message: "Album not found" });
      }
      
      if (album.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const mediaItems = await storage.getMediaByAlbumId(req.params.albumId);
      res.json(mediaItems);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/media", requireAuth, async (req, res, next) => {
    try {
      const mediaItems = await storage.getMediaByUserId(req.user!.id);
      res.json(mediaItems);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/media/search", requireAuth, async (req, res, next) => {
    try {
      const query = req.query.q as string;
      
      if (!query) {
        return res.status(400).json({ message: "Query parameter 'q' is required" });
      }
      
      const mediaItems = await storage.searchMedia(req.user!.id, query);
      res.json(mediaItems);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/media", requireAuth, async (req, res, next) => {
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
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      next(error);
    }
  });

  app.delete("/api/media/:id", requireAuth, async (req, res, next) => {
    try {
      const media = await storage.getMedia(req.params.id);
      
      if (!media) {
        return res.status(404).json({ message: "Media not found" });
      }
      
      if (media.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      await storage.deleteMedia(req.params.id);
      res.json({ message: "Media deleted successfully" });
    } catch (error) {
      next(error);
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
