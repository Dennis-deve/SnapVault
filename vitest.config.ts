import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Vitest 4 uses oxc (rolldown) to transform sources. The app's tsconfig
  // sets `jsx: preserve` (for the production React plugin), so tests must
  // explicitly transform TSX with the automatic JSX runtime instead.
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(dirname, "shared"),
      "@": path.resolve(dirname, "client/src"),
      "@assets": path.resolve(dirname, "attached_assets"),
    },
  },
  test: {
    // Server tests run in Node; browser-facing tests (upload queue,
    // compression fallbacks, screens) use the `// @vitest-environment jsdom`
    // docblock at the top of each file.
    environment: "node",
    include: ["server/**/*.test.ts", "client/**/*.test.{ts,tsx}"],
    testTimeout: 20000,
  },
});
