/**
 * Point de démarrage de l'application web — c'est le fichier que **Phusion Passenger**
 * lance sur l'hébergement (champ « Fichier de démarrage de l'application » du cPanel).
 *
 * Next.js est démarré par programme plutôt que via `next start` parce que Passenger ne lance
 * pas une commande : il **charge ce module avec `require()`** et attend un `listen()`.
 * Quatre contraintes en découlent, toutes vérifiées en direct — ne pas les défaire :
 *
 *  1. ⚠️ **AUCUN `await` de premier niveau.** `package.json` déclare `"type": "module"`, donc
 *     ce fichier est un module ES. Node sait faire `require()` d'un module ES **sauf s'il
 *     contient un `await` de premier niveau** : il lève `ERR_REQUIRE_ASYNC_MODULE` et
 *     Passenger n'affiche qu'un « could not be started » sans détail. D'où le `.then()`.
 *  2. ⚠️ **Racine déduite du fichier, jamais de `process.cwd()`** — Passenger démarre depuis
 *     un autre répertoire (voir `appDir`).
 *  3. ⚠️ **Écouter `'passenger'`, pas un port**, quand Passenger est présent : il fournit une
 *     socket Unix et multiplexe lui-même.
 *  4. ⚠️ **Journaliser dans un fichier.** Passenger n'expose pas la sortie de l'application
 *     sur cet hébergement : sans ce journal, une panne au démarrage est totalement muette.
 *     C'est ce qui a rendu la mise en ligne si laborieuse.
 */
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";

/**
 * ⚠️ Racine de l'app déduite de l'emplacement de CE fichier — surtout pas de `process.cwd()`.
 *
 * Passenger démarre l'application depuis un répertoire courant qui n'est **pas** celui de
 * l'app. Avec `process.cwd()`, Next cherchait `.next` ailleurs et échouait sur « Could not
 * find a production build » — alors qu'un lancement manuel depuis le bon dossier
 * fonctionnait, ce qui rendait la panne très trompeuse. Reproductible en une commande :
 * `cd / && node -e "require('/chemin/vers/server.js')"`. Vécu le 2026-07-29.
 *
 * Next se sert aussi de ce `dir` pour charger `.env` : le fixer règle les deux problèmes.
 */
const appDir = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));

/**
 * Journal de démarrage, **hors du dossier servi par le web**. Surchargeable par
 * `FA_SERVER_LOG`. Si même le repli échoue, on n'empêche jamais l'application de démarrer
 * pour un problème de journalisation.
 */
const logFile =
  process.env.FA_SERVER_LOG || join(homedir() || tmpdir(), "logs", "fr-alert-server.log");

function trace(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  process.stderr.write(line);
  try {
    appendFileSync(logFile, line);
  } catch {
    /* journal indisponible : on continue, ce n'est pas une raison d'empêcher le démarrage */
  }
}

trace(
  `démarrage — appDir=${appDir} cwd=${process.cwd()} node=${process.version} ` +
    `passenger=${typeof PhusionPassenger !== "undefined"} NODE_ENV=${process.env.NODE_ENV}`,
);

// Une erreur non gérée pendant le démarrage doit laisser une trace, pas disparaître.
process.on("uncaughtException", (err) => {
  trace(`uncaughtException: ${err?.stack || err}`);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  trace(`unhandledRejection: ${err?.stack || err}`);
});

const app = next({ dev: false, dir: appDir });
const handle = app.getRequestHandler();

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    trace(`erreur de requête ${req.url} : ${err?.stack || err}`);
    res.statusCode = 500;
    res.end("Erreur interne");
  });
});

server.on("error", (err) => {
  trace(`erreur du serveur HTTP : ${err?.stack || err}`);
});

app
  .prepare()
  .then(() => {
    // `PhusionPassenger` est une globale injectée par Passenger : le `typeof` évite le
    // ReferenceError quand elle n'existe pas (dev, VPS).
    if (typeof PhusionPassenger !== "undefined") {
      server.listen("passenger", () => {
        trace("France Alert démarré (Passenger)");
      });
    } else {
      // ⚠️ Ne PAS utiliser `process.env.HOSTNAME` comme adresse d'écoute : sur un hébergement
      // mutualisé cette variable vaut le nom de la machine, et s'y lier rend le serveur
      // injoignable en 127.0.0.1 (constaté : `curl` renvoyait 000 alors que le serveur
      // annonçait « démarré »). Sans adresse, Node écoute sur toutes les interfaces.
      const port = Number(process.env.PORT) || 3000;
      server.listen(port, () => {
        trace(`France Alert démarré sur le port ${port}`);
      });
    }
  })
  .catch((err) => {
    // Cause la plus fréquente : `.next` absent ou incomplet (build non joué, ou tronqué par
    // un `spawn EAGAIN` sur mutualisé — cf. docs/DEPLOY.md).
    trace(
      "DÉMARRAGE IMPOSSIBLE. Si l'erreur mentionne « Could not find a production build », " +
        "relancer `npm run build` puis vérifier `ls .next/BUILD_ID`.",
    );
    trace(`${err?.stack || err}`);
    process.exit(1);
  });
