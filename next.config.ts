import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["wagmi", "@wagmi/core", "@wagmi/connectors", "viem"],
};

export default nextConfig;
