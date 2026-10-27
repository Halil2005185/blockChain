import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the project root to this folder so Next.js doesn't pick up a
  // package-lock.json from a parent directory (e.g. the user's home folder).
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
