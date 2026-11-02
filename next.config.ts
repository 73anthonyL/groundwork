import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Plain dynamic rendering: every page reads a persona cookie and the DB.
  cacheComponents: false,
  // PGlite ships WASM; load it from node_modules at runtime instead of bundling.
  serverExternalPackages: ["@electric-sql/pglite", "unpdf", "@react-pdf/renderer"],
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
