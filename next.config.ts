import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'pdfkit', 'sharp', 'pptxgenjs', 'puppeteer', 'screenshot-desktop', '@jitsi/robotjs'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};
export default nextConfig;