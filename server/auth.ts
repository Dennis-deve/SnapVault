import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import type { User } from "@shared/schema";

export function setupAuth() {
  passport.use(
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
      },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email);

          if (!user) {
            return done(null, false, { message: "Invalid email or credentials" });
          }

          // Accounts created via "Continue with Google" have no password at
          // all (see shared/schema.ts) — guard against that before calling
          // bcrypt.compare, which would throw on a null hash rather than
          // just failing the login cleanly.
          if (!user.password) {
            return done(null, false, {
              message: "This account uses Google Sign-In. Continue with Google to log in, or set a password from Settings first.",
            });
          }

          // SECURITY: the account password is the ONLY credential accepted at
          // the main login route. The 4-digit Magic PIN is intentionally NOT
          // accepted here — a PIN has only 10,000 possible values and is meant
          // to gate a single locked album (via /api/albums/:id/unlock-session),
          // not to serve as an alternate master key for the whole account.
          const isValidPassword = await bcrypt.compare(password, user.password);

          if (isValidPassword) {
            return done(null, user);
          }

          return done(null, false, { message: "Invalid email or credentials" });
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  // Google OAuth — only registered when credentials are actually configured,
  // so the app still boots fine (with the feature simply unavailable) in
  // environments that haven't set up a Google OAuth client yet.
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (googleClientId && googleClientSecret) {
    // Accept BOTH the documented GOOGLE_CALLBACK_URL and the GOOGLE_CALL_URL
    // name that is actually set in some Render environments. Without this, the
    // Render value is ignored and OAuth falls back to a relative path, which
    // Google rejects (it requires an absolute redirect URI).
    const callbackURL =
      process.env.GOOGLE_CALLBACK_URL ||
      process.env.GOOGLE_CALL_URL ||
      "/api/auth/google/callback";

    passport.use(
      new GoogleStrategy(
        {
          clientID: googleClientId,
          clientSecret: googleClientSecret,
          callbackURL,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const googleId = profile.id;
            const email = profile.emails?.[0]?.value;

            if (!email) {
              return done(null, false, { message: "Google account has no accessible email address" });
            }

            // 1. Already linked — straightforward login.
            let user = await storage.getUserByGoogleId(googleId);
            if (user) return done(null, user);

            // 2. An account with this email already exists (e.g. they
            //    originally signed up with a password) but hasn't used
            //    Google before — link it. This is safe because Google has
            //    already verified the person controls this email address;
            //    it isn't just a claim from the client.
            user = await storage.getUserByEmail(email);
            if (user) {
              const linked = await storage.linkGoogleAccount(user.id, googleId);
              return done(null, linked);
            }

            // 3. Brand new account.
            const created = await storage.createOAuthUser({ email, googleId });
            return done(null, created);
          } catch (error) {
            return done(error as Error);
          }
        }
      )
    );
  } else {
    console.warn(
      "[auth] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — \"Continue with Google\" is disabled until they're configured."
    );
  }

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });
}

export function isGoogleAuthConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      pin: string | null;
      password?: string | null;
      googleId?: string | null;
      publicSharingEnabled?: number;
    }
  }
}
