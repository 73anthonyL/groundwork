import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Plain dynamic rendering: every page reads a persona cookie and the DB.
  cacheComponents: false,
  // Subcontract PDF uploads (validated to 4 MB; Vercel caps bodies at 4.5 MB).
  experimental: { serverActions: { bodySizeLimit: "4.4mb" } },
  // PGlite ships WASM; load it from node_modules at runtime instead of bundling.
  serverExternalPackages: ["@electric-sql/pglite", "unpdf", "@react-pdf/renderer"],
  // Read with fs at runtime (demo reset, cached extraction, embedded migrations); trace them into the functions.
  outputFileTracingIncludes: {
    "/**": ["./seed/specs/*.json", "./seed/contracts/*.pdf", "./drizzle/**/*"],
  },
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
