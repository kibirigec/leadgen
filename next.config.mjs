/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  output: "standalone",
  reactCompiler: true,
  serverExternalPackages: ["firebase-admin", "puppeteer-extra", "puppeteer-extra-plugin-stealth"],
};

export default nextConfig;
