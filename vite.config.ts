import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { copyFileSync } from "fs";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
    // Custom plugin to copy _redirects file for Render Static Site routing
    {
      name: 'copy-redirects',
      closeBundle() {
        const src = path.resolve(import.meta.dirname, "client/public/_redirects");
        const dest = path.resolve(import.meta.dirname, "dist/public/_redirects");
        try {
          copyFileSync(src, dest);
          console.log('✅ Copied _redirects file for SPA routing');
        } catch (err) {
          console.error('⚠️ Failed to copy _redirects:', err);
        }
      }
    }
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true, // Listen on all network interfaces
    port: 5173,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
