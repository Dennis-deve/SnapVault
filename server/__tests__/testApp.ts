import express, { type Request, type Response, type NextFunction } from "express";
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

  // Same terminal error handler as production (server/index.ts): routes call
  // next(error) and expect a JSON { message } response with err.status.
  // Without this, tests get Express's default HTML error page instead.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  return app;
}
