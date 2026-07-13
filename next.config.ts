import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Les adaptateurs de sources tournent côté serveur ; rien à exposer côté client.
  experimental: {
    // Autorise les Server Actions volumineuses si besoin (signalements avec photo plus tard).
  },
};

export default nextConfig;
