import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so Next does not pick up a stray lockfile in a parent folder.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
