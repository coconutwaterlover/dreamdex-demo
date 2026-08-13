import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["wagmi", "@wagmi/core", "@wagmi/connectors", "viem", "@somnia-chain/reactivity"],
};

export default nextConfig;
