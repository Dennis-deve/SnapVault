import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupHealthCheck } from "./routes/shared";
import { registerAuthRoutes } from "./routes/auth.routes";
import { registerAlbumRoutes } from "./routes/albums.routes";
import { registerMediaRoutes } from "./routes/media.routes";
import { registerPublicRoutes } from "./routes/public.routes";
import { registerSearchHistoryRoutes } from "./routes/search-history.routes";
import { registerStorageRoutes } from "./routes/storage-usage.routes";

// This file used to be a single ~1270-line file handling auth, albums,
// media, search, and sharing all together. It's now a thin aggregator —
// each domain lives in its own file under server/routes/, which makes each
// one easier to review and change independently without merge conflicts
// piling up in one giant file. Shared middleware, rate limiters, and
// helpers (requireAuth, assertAlbumReadable, Cloudinary upload/delete,
// etc.) live in server/routes/shared.ts.
export async function registerRoutes(app: Express): Promise<Server> {
  setupHealthCheck(app);

  registerAuthRoutes(app);
  registerAlbumRoutes(app);
  registerMediaRoutes(app);
  registerPublicRoutes(app);
  registerSearchHistoryRoutes(app);
  registerStorageRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
