import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ["firebase-admin", "puppeteer-extra", "puppeteer-extra-plugin-stealth"],
};

export default nextConfig;
