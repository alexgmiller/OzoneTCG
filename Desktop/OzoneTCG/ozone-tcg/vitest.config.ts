import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    // `tests/**` must stay listed: tests live both colocated with their module
    // and in the top-level tests/ directory, and omitting either silently stops
    // running them rather than failing.
    include: [
      "tests/**/*.test.{ts,tsx}",
      "lib/**/*.test.ts",
      "app/**/*.test.ts",
      "components/**/*.test.{ts,tsx}",
    ],
  },
});
