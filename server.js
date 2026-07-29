/**
 * Point de démarrage de l'application web — c'est le fichier que **Phusion Passenger**
 * lance sur l'hébergement (champ « Fichier de démarrage de l'application » du cPanel).
 *
 * Next.js est démarré par programme plutôt que via `next start` parce que Passenger ne lance
 * pas une commande : il **charge ce module avec `require()`** et attend un `listen()`.
 * Trois contraintes en découlent, toutes vérifiées en direct — ne pas les défaire :
 *
 *  1. ⚠️ **AUCUN `await` de premier niveau dans ce fichier.** `package.json` déclare
 *     `"type": "module"`, donc ce fichier est un module ES. Node sait faire `require()` d'un
 *     module ES **sauf s'il contient un `await` de premier niveau** : il lève alors
 *     `ERR_REQUIRE_ASYNC_MODULE` et Passenger n'affiche qu'un « Web application could not be
 *     started », sans détail. D'où le `.then()` ci-dessous au lieu d'un `await app.prepare()`.
 *  2. ⚠️ **Écouter `'passenger'`, pas un port.** Passenger fournit une socket Unix et
 *     multiplexe lui-même ; écouter un port fixe fait échouer le démarrage (timeout 90 s,
 *     Passenger attendant le `listen()` sur SA socket).
 *  3. Hors Passenger (dev, VPS, `npm start`), on retombe sur un port TCP classique — le même
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

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error("[server] erreur de requête", err);
    res.statusCode = 500;
    res.end("Erreur interne");
  });
});

app
  .prepare()
  .then(() => {
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
  })
  .catch((err) => {
    // Cause la plus fréquente : `.next` absent (build non joué sur le serveur). Sans ce
    // `catch`, l'échec ressort en promesse non gérée et Passenger reste muet.
    console.error(
      "[server] démarrage impossible. Si l'erreur mentionne « Could not find a production " +
        "build », lancer `npm run build` dans le dossier de l'application.",
    );
    console.error(err);
    process.exit(1);
  });
