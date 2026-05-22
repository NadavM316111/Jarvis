import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'pdfkit', 'sharp', 'pptxgenjs', 'puppeteer', 'screenshot-desktop', '@jitsi/robotjs'],
};
export default nextConfig;