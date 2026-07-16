import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Le repo racine a un pnpm-lock.yaml (app legacy) qui fait deviner à
  // Next.js/Turbopack la mauvaise racine de workspace — on épingle web/
  // explicitement.
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' }, // nouveau stockage média
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' }, // URLs pré-migration (phase 10)
      { protocol: 'https', hostname: 'images.unsplash.com' }, // hero PublicLanding (legacy)
    ],
  },
};

export default nextConfig;
