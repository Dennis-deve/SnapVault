import type { Express, Request, Response, NextFunction } from "express";
import passport from "passport";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { storage } from "../storage";
import { insertUserSchema, insertEmailChangeTokenSchema } from "@shared/schema";
import { z } from "zod";
import { generateToken } from "../jwt";
import { isGoogleAuthConfigured } from "../auth";
import { sendEmailChangeVerification, sendPasswordResetEmail, sendWelcomeEmail } from "../email";
import { deleteFromCloudinary } from "./shared";
import {
  authLimiter,
  requireAuth,
  isAccountLoginLocked,
  recordFailedLogin,
  clearFailedLogins,
} from "./shared";

export function registerAuthRoutes(app: Express) {
  const getAppBaseUrl = (req: Request) =>
    process.env.CLIENT_URL || process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`;

  app.post("/api/auth/signup", authLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userData = insertUserSchema.parse(req.body);

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Hash both the password and the PIN. Previously the PIN was stored in
      // plain text at signup but bcrypt-hashed when changed later via
      // /api/auth/update-pin — that inconsistency meant PIN verification
      // silently broke for some users depending on which code path last
      // touched their PIN. Hashing consistently here fixes it.
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const hashedPin = userData.pin ? await bcrypt.hash(userData.pin, 10) : null;

      // Create user
      const user = await storage.createUser({
        ...userData,
        password: hashedPassword,
        pin: hashedPin,
      });

      const baseUrl = getAppBaseUrl(req);
      const appUrl = `${baseUrl.replace(/\/$/, "")}/`;

      const welcomeEmailResult = await sendWelcomeEmail({
        to: user.email,
        appUrl,
        userName: user.email.split("@")[0],
      });

      if (!welcomeEmailResult.success) {
        console.warn("Welcome email was not sent:", welcomeEmailResult.error);
      }

      // Generate JWT token for mobile compatibility
      const token = generateToken(user.id);

      // Log in the user (for session-based auth)
      req.login(user, (err: any) => {
        if (err) return next(err);
        return res.json({
          id: user.id,
          email: user.email,
          pin: user.pin ? "****" : null, // never expose the PIN hash to the client
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
    const email = typeof req.body?.email === "string" ? req.body.email : "";

    // Per-account lockout: independent of the IP-based authLimiter above, so
    // a targeted attack on one account can't be spread across many IPs to
    // dodge rate limiting.
    if (email && isAccountLoginLocked(email)) {
      return res.status(429).json({
        message: "Too many failed attempts on this account. Please try again in 15 minutes.",
      });
    }

    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        if (email) recordFailedLogin(email);
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }

      if (email) clearFailedLogins(email);

      // Generate JWT token for mobile compatibility
      const token = generateToken(user.id);

      req.login(user, (loginErr: any) => {
        if (loginErr) return next(loginErr);
        return res.json({
          id: user.id,
          email: user.email,
          pin: user.pin ? "****" : null, // never expose the PIN hash to the client
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

  // Lets the client conditionally show/hide the "Continue with Google"
  // button depending on whether the server actually has Google OAuth
  // credentials configured, instead of always showing a button that would
  // 501 if the admin hasn't set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET yet.
  app.get("/api/auth/google/status", (_req: Request, res: Response) => {
    res.json({ enabled: isGoogleAuthConfigured() });
  });

  if (isGoogleAuthConfigured()) {
    app.get("/api/auth/google", (req: Request, res: Response, next: NextFunction) => {
      const originQuery = typeof req.query.origin === "string" ? req.query.origin : "";
      const clientOrigin = originQuery || req.headers.referer || process.env.FRONTEND_URL || process.env.CLIENT_URL || "https://snapvault-moau.onrender.com";

      let targetFrontend = "https://snapvault-moau.onrender.com";
      try {
        const u = new URL(clientOrigin);
        targetFrontend = `${u.protocol}//${u.host}`;
      } catch {}

      passport.authenticate("google", {
        scope: ["profile", "email"],
        state: targetFrontend,
      })(req, res, next);
    });

    app.get(
      "/api/auth/google/callback",
      passport.authenticate("google", { failureRedirect: "/login?error=google_auth_failed", session: true }),
      (req: Request, res: Response) => {
        let targetFrontend = (req.query.state as string) || process.env.FRONTEND_URL || process.env.CLIENT_URL || "https://snapvault-moau.onrender.com";
        try {
          const u = new URL(targetFrontend);
          targetFrontend = `${u.protocol}//${u.host}`;
        } catch {
          targetFrontend = "https://snapvault-moau.onrender.com";
        }

        const token = generateToken(req.user!.id);
        res.redirect(`${targetFrontend.replace(/\/$/, "")}/dashboard?token=${encodeURIComponent(token)}`);
      }
    );
  } else {
    // Registered even when not configured, so hitting the button produces a
    // clear message instead of Express's generic "unknown strategy" crash.
    app.get("/api/auth/google", (_req: Request, res: Response) => {
      res.status(501).json({
        message: "Google Sign-In isn't configured on this server yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      });
    });
  }

  app.get("/api/auth/me", requireAuth, (req: Request, res: Response) => {
    res.json({
      id: req.user!.id,
      email: req.user!.email,
      pin: req.user!.pin ? "****" : null, // Indicate PIN is set without exposing it
      hasPassword: !!req.user!.password,
      googleLinked: !!req.user!.googleId,
      publicSharingEnabled: !!req.user!.publicSharingEnabled,
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

  // Change (or, for Google-only accounts with no password yet, set) the
  // account password from Settings. This was previously a dead field in the
  // UI — no state, no API call, just a fake "Settings saved" toast — which
  // is exactly the kind of gap flagged elsewhere in this review, and it
  // became actually relevant once Google-only accounts existed (the local
  // login strategy points people here when they try password login on a
  // Google-only account).
  app.post("/api/auth/change-password", requireAuth, authLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (typeof newPassword !== "string" || newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters" });
      }

      // Accounts that already have a password (signed up locally, or a
      // Google account that previously set one) must prove they know the
      // current one first. Google-only accounts with no password yet skip
      // this — there's nothing to verify — which is how a Google user sets
      // a password for the first time.
      if (req.user!.password) {
        if (typeof currentPassword !== "string" || !currentPassword) {
          return res.status(400).json({ message: "Current password is required" });
        }
        const isValid = await bcrypt.compare(currentPassword, req.user!.password);
        if (!isValid) {
          return res.status(401).json({ message: "Current password is incorrect" });
        }
      }

      const hashed = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(req.user!.id, hashed);
      req.user!.password = hashed;

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      next(error);
    }
  });

  // Request an email change — sends a verification link to the NEW address
  // via Resend. The account's email is NOT updated yet; that only happens
  // when the link is clicked (see /api/auth/verify-email below). This
  // replaces what used to be a plain editable text field in Settings with
  // no backend at all — anything typed there was never actually saved.
  app.post("/api/auth/change-email", requireAuth, authLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = insertEmailChangeTokenSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.errors });
      }
      const { newEmail } = parsed.data;

      if (newEmail.toLowerCase() === req.user!.email.toLowerCase()) {
        return res.status(400).json({ message: "That's already your current email address" });
      }

      const existing = await storage.getUserByEmail(newEmail);
      if (existing) {
        return res.status(400).json({ message: "That email address is already in use" });
      }

      // Clear out any previous pending change for this account before
      // issuing a new one, so only the most recent request is valid.
      await storage.deleteEmailChangeTokensForUser(req.user!.id);
      await storage.deleteExpiredEmailChangeTokens();

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await storage.createEmailChangeToken({ userId: req.user!.id, newEmail, token, expiresAt });

      const baseUrl = getAppBaseUrl(req);
      const verifyUrl = `${baseUrl.replace(/\/$/, "")}/verify-email?token=${token}`;

      const result = await sendEmailChangeVerification({ to: newEmail, verifyUrl });

      if (!result.success && process.env.NODE_ENV !== "production") {
        // In dev without RESEND_API_KEY configured, don't leave the caller
        // guessing — the URL is already logged server-side by email.ts.
        return res.json({
          message: "Verification email not sent (email service not configured) — check the server console for the link.",
        });
      }

      res.json({ message: `Verification email sent to ${newEmail}. It expires in 1 hour.` });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/verify-email", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.body;
      if (typeof token !== "string" || !token) {
        return res.status(400).json({ message: "Token is required" });
      }

      const changeToken = await storage.getEmailChangeToken(token);
      if (!changeToken) {
        return res.status(400).json({ message: "This verification link is invalid or has already been used" });
      }
      if (changeToken.expiresAt < new Date()) {
        await storage.deleteEmailChangeToken(token);
        return res.status(400).json({ message: "This verification link has expired. Please request a new one from Settings." });
      }

      // Re-check uniqueness at confirmation time too — someone else could
      // have taken the address in the window between request and click.
      const existing = await storage.getUserByEmail(changeToken.newEmail);
      if (existing && existing.id !== changeToken.userId) {
        await storage.deleteEmailChangeToken(token);
        return res.status(400).json({ message: "That email address is no longer available" });
      }

      await storage.updateUserEmail(changeToken.userId, changeToken.newEmail);
      await storage.deleteEmailChangeToken(token);

      res.json({ message: "Email address updated successfully", email: changeToken.newEmail });
    } catch (error) {
      next(error);
    }
  });

  // Global sharing kill switch (per-user). Individual albums still need
  // their own "Share" toggle (POST /api/albums/:id/share) to actually
  // generate a link — this just controls whether any share link works at
  // all, so it can be flipped off to instantly revoke every link at once.
  app.post("/api/auth/sharing-preference", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ message: "enabled must be a boolean" });
      }
      await storage.setPublicSharingEnabled(req.user!.id, enabled);
      req.user!.publicSharingEnabled = enabled ? 1 : 0;
      res.json({ publicSharingEnabled: enabled });
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

      // Delete any existing tokens for this user, plus opportunistically
      // prune expired tokens for everyone else.
      await storage.deleteTokensForUser(user.id);
      await storage.deleteExpiredTokens();

      // Save token to database
      await storage.createPasswordResetToken({
        userId: user.id,
        token: resetToken,
        expiresAt,
      });

      // Build reset URL - use CLIENT_URL from env or fall back to request host
      const baseUrl = getAppBaseUrl(req);
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
          await deleteFromCloudinary(media);
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
}
