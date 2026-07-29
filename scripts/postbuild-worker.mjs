/**
 * Après compilation du worker : déclarer `dist/` comme du CommonJS.
 *
 * La racine du projet porte `"type": "module"` (pour Next et `server.js`), ce qui ferait
 * interpréter les `.js` de `dist/` comme de l'ESM — or `tsc` les a émis en CommonJS
 * (cf. tsconfig.worker.json). Un `package.json` local dans `dist/` renverse ce réglage pour
 * ce dossier uniquement : c'est le mécanisme prévu par Node, pas un contournement.
 *
 * Sans ça : « SyntaxError: Unexpected token 'export' » au lancement du cron.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const dist = join(process.cwd(), "dist");
mkdirSync(dist, { recursive: true });
writeFileSync(
  join(dist, "package.json"),
  `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`,
);

console.log("[build:worker] dist/package.json écrit (type: commonjs)");
