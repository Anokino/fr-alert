/**
 * Point de démarrage de l'application web — c'est le fichier que **Phusion Passenger**
 * lance sur l'hébergement (champ « Fichier de démarrage de l'application » du cPanel).
 *
 * Next.js est démarré par programme plutôt que via `next start` parce que Passenger ne lance
 * pas une commande : il charge ce module et attend un `listen()`. Deux conséquences à ne pas
 * réintroduire :
 *
 *  1. ⚠️ **Écouter `'passenger'`, pas un port.** Passenger fournit une socket Unix et
 *     multiplexe lui-même ; écouter un port fixe fait échouer le démarrage (timeout 90 s
 *     côté Passenger, qui attend l'appel à `listen()` sur SA socket).
 *  2. Hors Passenger (dev, VPS, `npm start`), on retombe sur un port TCP classique — le même
 *     fichier sert donc partout.
 *
 * ⚠️ Ce serveur ne fait QUE servir le web. Il ne va jamais chercher les sources nationales :
 * c'est le rôle du worker (`npm run ingest`, appelé par cron). Voir docs/DEPLOY.md.
 */
import { createServer } from "node:http";
import next from "next";

const port = Number(process.env.PORT) || 3000;
const hostname = process.env.HOSTNAME || "0.0.0.0";

const app = next({ dev: false, dir: process.cwd() });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error("[server] erreur de requête", err);
    res.statusCode = 500;
    res.end("Erreur interne");
  });
});

// `PhusionPassenger` est une globale injectée par Passenger : le `typeof` évite le
// ReferenceError quand elle n'existe pas (dev, VPS).
if (typeof PhusionPassenger !== "undefined") {
  server.listen("passenger", () => {
    console.log("[server] France Alert démarré (Passenger)");
  });
} else {
  server.listen(port, hostname, () => {
    console.log(`[server] France Alert démarré sur http://${hostname}:${port}`);
  });
}
