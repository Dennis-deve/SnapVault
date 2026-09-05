import type { Express, Request, Response, NextFunction } from "express";
import passport from "passport";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { storage } from "../storage";
import { insertUserSchema, insertEmailChangeTokenSchema } from "@shared/schema";
import { z } from "zod";
import { generateToken } from "../jwt";
import { isGoogleAuthConfigured } from "../auth";
import { sendEmailChangeVerification, sendPasswordResetEmail, sendWelcomeEmail, isEmailConfigured } from "../email";
import { deleteFromCloudinary } from "./shared";
import {
  authLimiter,
  requireAuth,
  isAccountLoginLocked,
  recordFailedLogin,
  clearFailedLogins,
} from "./shared";

export function registerAuthRoutes(app: Express) {
  // Links handed to users (reset emails, share links, OAuth redirects) must
  // point at the configured frontend. In production the request's own Host
  // header is attacker-controllable and is therefore NEVER used as a
  // fallback; if neither CLIENT_URL nor FRONTEND_URL is set in production
  // the caller reports a configuration error instead of building a link to
  // whatever host the request claims to come from.
  const getConfiguredAppBaseUrl = (): string | null => {
    const configured = process.env.CLIENT_URL || process.env.FRONTEND_URL;
    if (configured) return configured.replace(/\/$/, "");
    if (process.env.NODE_ENV === "production") return null;
    return null;
  };

  const getAppBaseUrl = (req: Request): string | null => {
    const configured = getConfiguredAppBaseUrl();
    if (configured) return configured;
    // Development only: same-origin monolithic dev server.
    return `${req.protocol}://${req.get("host")}`;
  };

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
      if (!baseUrl) {
        console.warn("[signup] CLIENT_URL/FRONTEND_URL not set; skipping welcome email link.");
      }
      const appUrl = baseUrl ? `${baseUrl.replace(/\/$/, "")}/` : "/";

      const welcomeEmailResult = await sendWelcomeEmail({
        to: user.email,
        appUrl,
        userName: user.email.split("@")[0],
      });

      if (!welcomeEmailResult.success) {
        console.warn("Welcome email was not sent:", welcomeEmailResult.error);
      }

      // Generate JWT token for mobile compatibility. Pass the full user
      // row so the token carries the credential version that later
      // invalidates it when the password changes (see server/jwt.ts).
      const token = generateToken(user);

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

      // Generate JWT token for mobile compatibility. Pass the full user
      // row so the token carries the credential version that later
      // invalidates it when the password changes (see server/jwt.ts).
      const token = generateToken(user);

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
    app.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

    app.get(
      "/api/auth/google/callback",
      passport.authenticate("google", { failureRedirect: "/login?error=google_auth_failed", session: true }),
      (req: Request, res: Response) => {
        // Full-page OAuth redirect flow (not a fetch call), so this needs an
        // actual browser redirect back to the SPA rather than a JSON
        // response. CLIENT_URL matches the pattern already used for
        // password-reset emails; falls back to the request's own host for a
        // same-origin monolithic deployment.
        const baseUrl = getAppBaseUrl(req);
        if (!baseUrl) {
          console.error("[google-callback] CLIENT_URL/FRONTEND_URL not set; cannot redirect OAuth login.");
          return res
            .status(500)
            .send("OAuth login is misconfigured on this server (no frontend URL set).");
        }

        // SECURITY/RELIABILITY NOTE: this deployment runs the frontend and
        // API on two different domains (separate Render services). The
        // session cookie set by req.login() above is scoped to the API's
        // domain with SameSite=None — that generally works for same-site
        // fetches, but many mobile browsers (and any in-app/WebView
        // browser) are increasingly strict about sending third-party
        // cookies back cross-site, so relying on the cookie alone here left
        // "Continue with Google" landing on /dashboard already logged out.
        // Every other auth flow (login/signup) already hands the client a
        // JWT in the JSON response body for exactly this reason — but a
        // redirect-based OAuth callback has no JSON response to attach it
        // to, so we pass it through the redirect URL instead. The client's
        // /auth/callback route reads it, stores it the same way the
        // login/signup flows do, then strips it from the URL immediately.
        const token = generateToken(req.user!);
        const target = new URL(`${baseUrl.replace(/\/$/, "")}/auth/callback`);
        target.searchParams.set("token", token);
        res.redirect(target.toString());
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

      // Changing the password invalidates old JWTs via the embedded
      // credential version (server/jwt.ts) — and every OTHER session
      // cookie here as well. The current session is kept so the person
      // changing their password isn't logged out mid-request.
      await storage.destroySessionsForUser(req.user!.id, req.sessionID);

      res.json({ message: "Password updated successfully. Other devices were signed out." });
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
      if (!baseUrl) {
        console.error("[change-email] CLIENT_URL/FRONTEND_URL not set; cannot build a verification link.");
        return res.status(503).json({
          message: "Email change links are misconfigured on this server (no frontend URL set).",
        });
      }
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

  // Global sharing kill switch (per-user). Turning it OFF permanently
  // revokes every share link on the account: each album's token is
  // destroyed (not merely disabled), so turning the preference back ON can
  // never resurrect a link that was previously handed out. Albums must be
  // explicitly shared again to get fresh links.
  app.post("/api/auth/sharing-preference", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ message: "enabled must be a boolean" });
      }
      await storage.setPublicSharingEnabled(req.user!.id, enabled);
      if (!enabled) {
        // Destroy every album share token on the account in one statement.
        await storage.revokeAllAlbumSharesForUser(req.user!.id);
      }
      req.user!.publicSharingEnabled = enabled ? 1 : 0;
      res.json({ publicSharingEnabled: enabled });
    } catch (error) {
      next(error);
    }
  });

  // Forgot password - request a reset link.
  //
  // Security properties (see FEATURE_FIXES.md):
  //   * The email is normalized (trim + lowercase) and looked up
  //     case-insensitively, so addresses created before normalization
  //     existed are still found.
  //   * The raw token is 256 bits of CSPRNG output (base64url). Only its
  //     SHA-256 hash is stored; a database leak therefore cannot be turned
  //     into valid reset links.
  //   * Issuing a new link deletes the previous one for the account.
  //   * The link always uses the CONFIGURED frontend URL. The production
  //     Host header is never trusted.
  //   * The raw token is never returned in a response nor logged.
  //   * Missing email configuration is an honest 503 for everyone; a
  //     provider rejection AFTER acceptance semantics is logged
  //     server-side only, so public responses can't be used to probe which
  //     addresses have accounts.
  app.post("/api/auth/forgot-password", authLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawEmail = typeof req.body?.email === "string" ? req.body.email : "";

      if (!rawEmail.trim()) {
        return res.status(400).json({ message: "Email is required" });
      }

      const email = rawEmail.trim().toLowerCase();

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      // Honest failure when email can't be sent at all — checked BEFORE the
      // user lookup so the 503 is identical whether or not the address
      // exists (no enumeration through this branch either).
      if (!isEmailConfigured()) {
        return res.status(503).json({
          message:
            "Password reset emails are not configured on this server. Set RESEND_API_KEY (and a verified FROM_EMAIL) to enable them.",
        });
      }

      // Case-insensitive lookup — matches normalized and legacy mixed-case rows.
      const user = await storage.getUserByEmail(email);

      // Always return success even if user doesn't exist (security best
      // practice: prevents email enumeration attacks).
      if (!user) {
        return res.json({
          message: "If an account exists with this email, you will receive a password reset link."
        });
      }

      // Google-only accounts have no password to reset.
      if (!user.password && !user.googleId) {
        return res.json({
          message: "If an account exists with this email, you will receive a password reset link."
        });
      }

      // Cryptographically random, URL-safe token. Kept in memory only.
      const resetToken = crypto.randomBytes(32).toString("base64url");

      // Token expires in 1 hour.
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      // A new link invalidates any previous one for this account, plus
      // opportunistically prune expired tokens for everyone.
      await storage.deleteTokensForUser(user.id);
      await storage.deleteExpiredTokens();

      // Store only the SHA-256 hash of the token.
      const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
      await storage.createPasswordResetToken({
        userId: user.id,
        token: tokenHash,
        expiresAt,
      });

      const baseUrl = getAppBaseUrl(req);
      if (!baseUrl) {
        // Production without a configured frontend URL: refuse to invent a
        // link from the request's Host header.
        console.error("[auth] CLIENT_URL/FRONTEND_URL is not set; cannot build a password reset link.");
        return res.status(503).json({
          message: "Password reset links are misconfigured on this server (no frontend URL set)."
        });
      }
      const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

      const emailResult = await sendPasswordResetEmail({
        to: user.email,
        resetUrl,
        userName: user.email.split("@")[0],
      });

      if (!emailResult.success) {
        // Recipient/provider-specific failures are logged server-side only.
        // The public response stays generic so it can't be used to tell
        // which addresses have accounts (an attacker who probes addresses
        // would otherwise learn "this one exists but Resend bounced it").
        console.error("[auth] password reset email not delivered:", emailResult.error);
      }

      res.json({
        message: "If an account exists with this email, you will receive a password reset link.",
      });
    } catch (error) {
      console.error('Forgot password error:', error);
      next(error);
    }
  });

  // Link check for the reset page: is this token still usable? Lets the
  // page explain "expired" vs "invalid/already used" BEFORE the user types
  // a new password. Never echoes the token back.
  app.get("/api/auth/reset-password/validate", authLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const raw = typeof req.query.token === "string" ? req.query.token : "";
      if (!raw) {
        return res.json({ valid: false, reason: "invalid" });
      }
      const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
      const row = await storage.getPasswordResetToken(tokenHash);
      if (!row) {
        return res.json({ valid: false, reason: "invalid" });
      }
      if (row.expiresAt.getTime() <= Date.now()) {
        return res.json({ valid: false, reason: "expired" });
      }
      res.json({ valid: true });
    } catch (error) {
      next(error);
    }
  });

  // Reset password with token. Single use, transactional: consuming the
  // token, updating the password and destroying the user's sessions all
  // happen atomically (see DBStorage.consumePasswordResetTokenAndSetPassword).
  // Old JWTs are invalidated by the credential-version check in server/jwt.ts.
  app.post("/api/auth/reset-password", authLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, newPassword } = req.body as { token?: string; newPassword?: string };

      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
      }

      if (typeof newPassword !== "string" || newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      const result = await storage.consumePasswordResetTokenAndSetPassword(tokenHash, hashedPassword);

      if (!result.ok) {
        if (result.reason === "expired") {
          return res.status(400).json({
            message: "This reset link has expired. Please request a new one.",
            reason: "expired",
          });
        }
        return res.status(400).json({
          message: "This reset link is invalid or has already been used. Please request a new one.",
          reason: "invalid",
        });
      }

      res.json({
        message: "Password successfully reset. All previous logins were signed out — use your new password to sign in.",
      });
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
