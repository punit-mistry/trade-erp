import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // convex-test runs Convex functions in-memory; edge-runtime mirrors the Convex isolate.
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["tests/**/*.test.ts"],
    // The first convex-test case per file loads every Convex module (~3.5s cold), close to the 5s default.
    testTimeout: 20_000,
  },
});
