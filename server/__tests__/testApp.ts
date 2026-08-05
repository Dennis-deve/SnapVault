import express from "express";
import session from "express-session";
import passport from "passport";
import { setupAuth } from "../auth";
import { registerRoutes } from "../routes";

/**
 * Builds a minimal Express app for tests: JSON body parsing, an in-memory
 * (MemoryStore) session — not connect-pg-simple, so no real Postgres is
 * needed — Passport, and the real route registration used in production.
 * Storage is expected to already be mocked to FakeStorage by the caller
 * (via vi.mock("../storage", ...)) before this is imported.
 */
export async function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "test-only-secret",
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use(passport.initialize());
  app.use(passport.session());

  setupAuth();
  await registerRoutes(app);
  return app;
}
