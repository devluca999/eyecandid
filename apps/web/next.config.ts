import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@eyelore/core", "@eyelore/ui"],
  reactStrictMode: true,
  poweredByHeader: false,
};
export default config;
