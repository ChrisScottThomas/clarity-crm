import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for the container image.
  // See docs/superpowers/specs/2026-07-23-phase-3-deploy-design.md §1.
  output: 'standalone',
  // Native/driver modules must be required at runtime, not bundled.
  serverExternalPackages: [
    'better-sqlite3',
    '@prisma/adapter-better-sqlite3',
    '@prisma/adapter-pg',
  ],
};

export default nextConfig;
