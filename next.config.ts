import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is per-user (Convex Auth reads the session cookie in the root
  // layout and all data is fetched live from Convex), so Cache Components /
  // partial prefetching are intentionally left off.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
