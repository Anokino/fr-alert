import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Les adaptateurs de sources tournent côté serveur ; rien à exposer côté client.
  experimental: {
    /**
     * ⚠️ Build mono-processus — indispensable sur l'hébergement mutualisé (CloudLinux LVE).
     *
     * Par défaut, `next build` parallélise la collecte des données de pages en forkant un
     * worker par cœur. Sur un compte mutualisé, le nombre de processus est plafonné et les
     * forks échouent : `spawn … EAGAIN`, suivi d'un `kill EPERM` quand Next tente de nettoyer
     * des workers qu'il n'a jamais pu créer.
     *
     * Le piège : ça survient APRÈS `✓ Compiled successfully` et `✓ Linting and checking
     * validity of types`, donc le build a l'air réussi alors que `.next` n'est pas finalisé.
     * Symptôme aval, au démarrage : « Could not find a production build in the '.next'
     * directory ». Vécu le 2026-07-29, en terminal web ET en SSH classique.
     *
     * Coût : un build un peu plus lent (12 routes, c'est négligeable). Voir docs/DEPLOY.md.
     */
    cpus: 1,
    workerThreads: false,
  },
};

export default nextConfig;
