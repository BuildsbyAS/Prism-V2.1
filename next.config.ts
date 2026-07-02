import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray parent lockfile would otherwise make
  // Turbopack infer the wrong project root.
  turbopack: { root: __dirname },
};

export default nextConfig;
