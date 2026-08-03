import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import { registerRoutes } from "./routes";
import { setupAuth } from "./auth";
import { pool } from "./db";

const app = express();

// Trust the first proxy (e.g. Render's router) so client IPs from
// X-Forwarded-For are respected by middleware like express-rate-limit.
// Only enable in production where the app runs behind a proxy.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
const PgSession = connectPgSimple(session);

// SECURITY: fail fast in production rather than silently signing session
// cookies with a hardcoded, publicly-known secret (visible in this repo).
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production. Refusing to start with an insecure default.");
  }
  console.warn("[session] WARNING: SESSION_SECRET is not set. Using an insecure development-only secret.");
}

// Simple logging function
function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

// CORS configuration for production deployment
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5000",
  "http://localhost:3000",
].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // In development, allow all origins
    if (process.env.NODE_ENV === "development") {
      return callback(null, true);
    }
    
    // In production, allow Render.com domains and configured origins
    if (origin.includes('.onrender.com') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

// Rate limiting to prevent brute force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: "Too many login attempts, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: "Too many requests, please slow down",
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limit to all API routes
app.use('/api/', generalLimiter);

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

// Media uploads go through the dedicated multipart /api/upload route (Multer,
// capped at 200MB — see routes.ts), NOT through this JSON parser. A large
// limit here was unnecessary attack surface for every ordinary JSON API call
// (login, album create, etc.), since a huge JSON body ties up parsing time.
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: false,
  limit: '10mb'
}));

app.use(
  session({
    store: new PgSession({
      pool: pool,
      tableName: 'session',
      createTableIfMissing: true,
      pruneSessionInterval: 60 * 15, // Clean up expired sessions every 15 minutes
    }),
    secret: SESSION_SECRET || "snapvault-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    proxy: process.env.NODE_ENV === "production",
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

setupAuth();

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        // Redact sensitive fields before they ever hit the logs.
        const SENSITIVE_KEYS = ["password", "pin", "token", "unlockToken", "newPassword"];
        const redacted = Object.fromEntries(
          Object.entries(capturedJsonResponse).map(([k, v]) =>
            SENSITIVE_KEYS.includes(k) ? [k, "[REDACTED]"] : [k, v]
          )
        );
        logLine += ` :: ${JSON.stringify(redacted)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Log server-side for diagnostics. Previously this handler re-threw the
    // error after the response was already sent, which risks crashing the
    // whole Node process (taking down every connected user) on any request
    // that reaches this handler.
    console.error(err);

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    // Dynamically import vite utilities only in development
    const { setupVite } = await import("./vite.js");
    await setupVite(app, server);
  } else {
    // In production, serve static files from dist/public
    // The compiled server is at dist/index.js, so public files are at dist/public
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const distPath = path.join(__dirname, "public");
    
    log(`Serving static files from: ${distPath}`);
    app.use(express.static(distPath));
    
    // Catch-all route for SPA
    app.get("*", (_req, res) => {
      const indexPath = path.join(distPath, "index.html");
      log(`Serving index.html from: ${indexPath}`);
      res.sendFile(indexPath);
    });
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  
  // Only listen if not in serverless environment (Vercel)
  if (process.env.VERCEL !== '1') {
    server.listen(port, () => {
      log(`serving on port ${port}`);
    });
  }
})();

// Export for Vercel serverless
export default app;
