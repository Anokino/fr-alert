/**
 * Point de démarrage de l'application web — fichier chargé par **Phusion Passenger**
 * (champ « Fichier de démarrage de l'application » du cPanel : `server.cjs`).
 *
 * ⚠️ **CommonJS délibérément** (`.cjs`), alors que le reste du projet est en modules ES.
 *
 * Passenger ne lance pas une commande : il charge ce fichier avec son propre mécanisme, qui
 * suppose du CommonJS. Un point d'entrée en module ES échoue **avant même d'être exécuté** —
 * aucune trace, aucun log, juste « Web application could not be started ». Vécu le
 * 2026-07-29 : la version ESM se chargeait pourtant sans problème via `require()` en Node pur,
 * ce qui rendait le diagnostic trompeur. Ne pas reconvertir ce fichier en ESM.
 *
 * Trois autres contraintes vérifiées en direct, à ne pas défaire :
 *  1. **Écouter `'passenger'`, pas un port**, quand Passenger est présent : il fournit une
 *     socket Unix et multiplexe lui-même.
 *  2. **Racine déduite de `__dirname`, jamais de `process.cwd()`** : Passenger démarre depuis
 *     un autre répertoire, et Next y chercherait `.next` en vain.
 *  3. **Journaliser dans un fichier** : Passenger n'expose pas la sortie de l'application sur
 *     cet hébergement. Sans ce journal, une panne au démarrage est totalement muette.
 */
const { createServer } = require("node:http");
const { appendFileSync } = require("node:fs");
const { homedir, tmpdir } = require("node:os");
const { join } = require("node:path");

// `next` expose son entrée en CommonJS, mais selon les versions le module est soit la
// fonction elle-même, soit `{ default: fn }` — on gère les deux plutôt que de parier.
const nextImport = require("next");
const next = nextImport.default || nextImport;

/** Racine de l'application — cf. contrainte n°2 de l'en-tête. */
const appDir = __dirname;

/**
 * Journal de démarrage, **hors du dossier servi par le web**. Surchargeable par
 * `FA_SERVER_LOG`. Un problème de journalisation ne doit jamais empêcher le démarrage.
 */
const logFile =
  process.env.FA_SERVER_LOG || join(homedir() || tmpdir(), "logs", "fr-alert-server.log");

function trace(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    process.stderr.write(line);
  } catch {
    /* stderr indisponible sous Passenger : le fichier reste la source de vérité */
  }
  try {
    appendFileSync(logFile, line);
  } catch {
    /* journal indisponible : on continue */
  }
}

trace(
  `démarrage — appDir=${appDir} cwd=${process.cwd()} node=${process.version} ` +
    `passenger=${typeof PhusionPassenger !== "undefined"} NODE_ENV=${process.env.NODE_ENV}`,
);

// Une erreur non gérée pendant le démarrage doit laisser une trace, pas disparaître.
process.on("uncaughtException", (err) => {
  trace(`uncaughtException: ${(err && err.stack) || err}`);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  trace(`unhandledRejection: ${(err && err.stack) || err}`);
});

const app = next({ dev: false, dir: appDir });
const handle = app.getRequestHandler();

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    trace(`erreur de requête ${req.url} : ${(err && err.stack) || err}`);
    res.statusCode = 500;
    res.end("Erreur interne");
  });
});

server.on("error", (err) => {
  trace(`erreur du serveur HTTP : ${(err && err.stack) || err}`);
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
      // ⚠️ Ne PAS utiliser `process.env.HOSTNAME` comme adresse d'écoute : sur un mutualisé
      // cette variable vaut le nom de la machine, et s'y lier rend le serveur injoignable en
      // 127.0.0.1 (constaté : `curl` renvoyait 000 alors que le serveur s'annonçait démarré).
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
    trace(`${(err && err.stack) || err}`);
    process.exit(1);
  });
