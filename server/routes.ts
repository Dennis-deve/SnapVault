import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { insertUserSchema, insertAlbumSchema, insertMediaSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import cloudinary from "./cloudinary";
import { Readable } from "stream";
import { generateToken, authenticateFlexible } from "./jwt";
import { sendPasswordResetEmail } from "./email";

// Rate limiter for auth endpoints (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: "Too many attempts, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

// Configure Multer for memory storage with 200MB limit for large videos
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit (supports 100+MB files)
  },
});

// Middleware to check if user is authenticated (supports both session and JWT)
function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Use flexible authentication (session OR JWT)
  return authenticateFlexible(req, res, next);
}

// Health check endpoint for Render
function setupHealthCheck(app: Express) {
  app.get("/health", (_req, res) => {
    res.status(200).json({ 
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development"
    });
  });
}

// Helper function to upload buffer to Cloudinary
async function uploadToCloudinary(buffer: Buffer, filename: string, resourceType: 'image' | 'video'): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadOptions: any = {
      resource_type: resourceType,
      folder: 'cloudmediavault',
      public_id: filename.split('.')[0],
      use_filename: true,
    };

    // Optimize for mobile: compress images and videos
    if (resourceType === 'image') {
      uploadOptions.quality = 'auto:good'; // Automatic quality optimization
      uploadOptions.fetch_format = 'auto'; // Auto format (WebP for supported browsers)
    } else if (resourceType === 'video') {
      uploadOptions.quality = 'auto'; // Automatic quality
      uploadOptions.eager = [
        { width: 640, height: 480, crop: 'limit', format: 'mp4' } // Mobile-optimized version
      ];
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) reject(error);
        else resolve(result!.secure_url);
      }
    );

    const readableStream = Readable.from(buffer);
    readableStream.pipe(uploadStream);
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup health check endpoint
  setupHealthCheck(app);
  
  // Auth routes
  app.post("/api/auth/signup", authLimiter, async (req: Request, res: Response, next: NextFunction) => {
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

      // Generate JWT token for mobile compatibility
      const token = generateToken(user.id);

      // Log in the user (for session-based auth)
      req.login(user, (err: any) => {
        if (err) return next(err);
        return res.json({
          id: user.id,
          email: user.email,
          pin: user.pin,
          token, // Include JWT token for mobile devices
        });
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      next(error);
    }
  });

  app.post("/api/auth/login", authLimiter, (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }

      // Generate JWT token for mobile compatibility
      const token = generateToken(user.id);

      req.login(user, (loginErr: any) => {
        if (loginErr) return next(loginErr);
        return res.json({
          id: user.id,
          email: user.email,
          pin: user.pin,
          token, // Include JWT token for mobile devices
        });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.logout((err: any) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/me", requireAuth, (req: Request, res: Response) => {
    res.json({
      id: req.user!.id,
      email: req.user!.email,
      pin: req.user!.pin ? "****" : null, // Indicate PIN is set without exposing it
    });
  });

  app.post("/api/auth/update-pin", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { pin } = req.body;
      
      if (!pin || pin.length !== 4 || !/^\d+$/.test(pin)) {
        return res.status(400).json({ message: "PIN must be exactly 4 digits" });
      }
      
      // Hash PIN for security (used to lock/unlock albums)
      const hashedPin = await bcrypt.hash(pin, 10);
      await storage.updateUserPin(req.user!.id, hashedPin);
      
      // Update the session user
      req.user!.pin = hashedPin;
      
      res.json({ message: "PIN updated successfully" });
    } catch (error) {
      next(error);
    }
  });

  // Forgot password - request reset token
  app.post("/api/auth/forgot-password", authLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      // Find user by email
      const user = await storage.getUserByEmail(email);
      
      // Always return success even if user doesn't exist (security best practice)
      // This prevents email enumeration attacks
      if (!user) {
        return res.json({ 
          message: "If an account exists with this email, you will receive a password reset link." 
        });
      }

      // Generate secure random token
      const resetToken = crypto.randomBytes(32).toString('hex');
      
      // Token expires in 1 hour
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      // Delete any existing tokens for this user
      await storage.deleteExpiredTokens();

      // Save token to database
      await storage.createPasswordResetToken({
        userId: user.id,
        token: resetToken,
        expiresAt,
      });

      // Build reset URL - use CLIENT_URL from env or fall back to request host
      const baseUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;
      const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
      
      console.log('Attempting to send password reset email to:', user.email);
      console.log('Reset URL:', resetUrl);
      
      const emailResult = await sendPasswordResetEmail({
        to: user.email,
        resetUrl,
        userName: user.email.split('@')[0], // Use email username as display name
      });

      // Log email result for debugging
      if (!emailResult.success) {
        console.error('Email sending failed:', emailResult.error);
        // In development, show the error to help debug
        if (process.env.NODE_ENV !== 'production') {
          return res.status(500).json({ 
            message: "Failed to send reset email", 
            error: emailResult.error,
            resetUrl: resetUrl // Include reset URL in dev mode
          });
        }
      } else {
        console.log('Password reset email sent successfully');
      }

      // In development, also log to console
      if (process.env.NODE_ENV !== 'production') {
        console.log('Password reset requested for:', email);
        console.log('Email result:', emailResult);
      }

      // Always return success to prevent email enumeration
      res.json({ 
        message: "If an account exists with this email, you will receive a password reset link.",
      });
    } catch (error) {
      console.error('Forgot password error:', error);
      next(error);
    }
  });

  // Reset password with token
  app.post("/api/auth/reset-password", authLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      // Find token in database
      const resetToken = await storage.getPasswordResetToken(token);
      
      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      // Check if token has expired
      if (new Date() > resetToken.expiresAt) {
        await storage.deletePasswordResetToken(token);
        return res.status(400).json({ message: "Reset token has expired. Please request a new one." });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update user's password
      await storage.updateUserPassword(resetToken.userId, hashedPassword);

      // Delete used token
      await storage.deletePasswordResetToken(token);

      res.json({ message: "Password successfully reset. You can now log in with your new password." });
    } catch (error) {
      next(error);
    }
  });

  // Delete account - GDPR compliance
  app.delete("/api/auth/account", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      
      // Get all albums for this user
      const albums = await storage.getAlbumsByUserId(userId);
      
      // Delete all media items and their Cloudinary files
      for (const album of albums) {
        const mediaItems = await storage.getMediaByAlbumId(album.id);
        
        for (const media of mediaItems) {
          // Delete from Cloudinary
          if (media.path.includes('cloudinary.com')) {
            try {
              const urlParts = media.path.split('/');
              const filename = urlParts[urlParts.length - 1];
              const publicId = `cloudmediavault/${filename.split('.')[0]}`;
              const resourceType = media.type.startsWith('video/') ? 'video' : 'image';
              
              await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
            } catch (cloudinaryError) {
              console.error('Failed to delete from Cloudinary:', cloudinaryError);
            }
          }
          
          // Delete from database
          await storage.deleteMedia(media.id);
        }
        
        // Delete album
        await storage.deleteAlbum(album.id);
      }
      
      // Delete user account
      await storage.deleteUser(userId);
      
      // Log out
      req.logout((err: any) => {
        if (err) console.error('Logout error:', err);
      });
      
      res.json({ message: "Account deleted successfully" });
    } catch (error) {
      next(error);
    }
  });

  // Album routes
  app.get("/api/albums", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const albums = await storage.getAlbumsByUserId(req.user!.id);
      
      // Get media count and thumbnail for each album
      const albumsWithCount = await Promise.all(
        albums.map(async (album) => {
          const mediaItems = await storage.getMediaByAlbumId(album.id);
          // Get first media item as thumbnail (prefer images over videos)
          const images = mediaItems.filter(m => m.type.startsWith('image/'));
          const thumbnail = images.length > 0 ? images[0] : mediaItems[0];
          
          return {
            ...album,
            itemCount: mediaItems.length,
            thumbnail: thumbnail?.path || null,
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
      const albumData = insertAlbumSchema.parse(req.body);
      const album = await storage.createAlbum(albumData, req.user!.id);
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
      
      // Delete all media in the album first
      const mediaItems = await storage.getMediaByAlbumId(req.params.id);
      await Promise.all(mediaItems.map((media) => storage.deleteMedia(media.id)));
      
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

  app.post("/api/auth/verify-pin", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { pin } = req.body;
      
      if (!req.user!.pin) {
        return res.status(400).json({ message: "Magic PIN not set" });
      }
      
      // Verify PIN with bcrypt
      const isPinValid = await bcrypt.compare(pin, req.user!.pin);
      res.json({ valid: isPinValid });
    } catch (error) {
      next(error);
    }
  });

  // Media routes
  app.get("/api/albums/:albumId/media", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
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

  app.get("/api/media", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const mediaItems = await storage.getMediaByUserId(req.user!.id);
      res.json(mediaItems);
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
      res.json(mediaItems);
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

      // Upload to Cloudinary
      const cloudinaryUrl = await uploadToCloudinary(
        req.file.buffer,
        req.file.originalname,
        resourceType
      );

      console.log("Upload successful, saving to DB");

      // Save to database
      const media = await storage.createMedia(
        {
          filename: req.file.originalname,
          path: cloudinaryUrl,
          type: req.file.mimetype,
          size: req.file.size,
          albumId: albumId || null,
        },
        req.user!.id
      );

      res.json(media);
    } catch (error) {
      console.error("Upload error:", error);
      next(error);
    }
  });

  // Legacy base64 upload endpoint (keep for backward compatibility)
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

      // Delete from Cloudinary if it's a Cloudinary URL
      if (media.path.includes('cloudinary.com')) {
        try {
          // Extract public_id from URL
          const urlParts = media.path.split('/');
          const filename = urlParts[urlParts.length - 1];
          const publicId = `cloudmediavault/${filename.split('.')[0]}`;
          const resourceType = media.type.startsWith('video/') ? 'video' : 'image';
          
          await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
        } catch (cloudinaryError) {
          console.error('Failed to delete from Cloudinary:', cloudinaryError);
          // Continue with database deletion even if Cloudinary deletion fails
        }
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
