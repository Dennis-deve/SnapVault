import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
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

          // First, try password authentication
          const isValidPassword = await bcrypt.compare(password, user.password);
          
          if (isValidPassword) {
            return done(null, user);
          }
          
          // If password fails, try PIN authentication (if user has a PIN)
          if (user.pin && password === user.pin) {
            return done(null, user);
          }

          return done(null, false, { message: "Invalid email or credentials" });
        } catch (error) {
          return done(error);
        }
      }
    )
  );

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

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      pin: string | null;
    }
  }
}
