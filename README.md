# France Alert

Application d'information de sécurité civile pour le grand public. Répond en un coup d'œil à
« **y a-t-il un danger près de chez moi ?** », affiche une carte des incidents et permet de
signaler un événement. Architecture **modulaire** (feux, inondations, eau potable, qualité de
l'air, séismes, vigilance météo, rappels sanitaires) et **API** partagée avec la future app
mobile.

> **À lire avant de contribuer** : `CONTEXT.md` (vision, contrats, conventions) → puis
> `ARCHITECTURE.md` (arborescence, décisions). Avant de toucher à une source de données :
> `docs/SOURCES.md` — chaque API a ses pièges, tous vérifiés en direct et documentés.
> État d'avancement : `docs/ROADMAP.md`.

## Démarrage

```bash
npm install
npx prisma db push      # crée la base SQLite (dev.db)
npm run dev             # http://localhost:3000
```

Aucune clé n'est nécessaire : les sources ouvertes fonctionnent d'emblée. Copiez
`.env.example` en `.env` pour activer les sources optionnelles :

- `FIRMS_MAP_KEY` — points chauds satellite NASA FIRMS (clé gratuite).
- `METEOFRANCE_TOKEN` — Vigilance + Météo des forêts (un seul token couvre les APIs du
  portail Météo-France ; en-tête `apikey:`, pas Bearer).

Sans clé, les modules concernés **dégradent proprement** (la source est ignorée, les couches
qui en dépendent ne sont pas proposées).

## Sources de données

Live et vérifiées : Open-Meteo (air) · EMSC (séismes) · Hub'Eau (eau potable, hydrométrie v2)
· RappelConso · Overpass/OSM · Vigicrues · NASA FIRMS · Météo-France Vigilance · Météo des
forêts · EFFIS/Copernicus (périmètres de feux) · signalements citoyens.

Détail, endpoints exacts et pièges : `docs/SOURCES.md`.

## API

| Route | Description |
|-------|-------------|
| `GET /api/incidents?bbox=…` **ou** `?lat=…&lng=…&r=25` `&modules=fire,flood` | Incidents agrégés dans la zone |
| `GET /api/modules` | Liste des modules (métadonnées, couches disponibles) |
| `GET /api/modules/{slug}?bbox=…` | Incidents + méta d'un module |
| `GET /api/pois?module=fire&layers=effis-burnt&bbox=…&days=3` | Couches contextuelles (paramètres réglables) |
| `GET /api/reports?module=fire` · `POST /api/reports` | Signalements citoyens |
| `GET /api/geo/reverse?lat=…&lng=…` | Commune d'un point (reverse) |
| `GET /api/geo/search?q=<adresse>` | Recherche d'adresse → coordonnées (forward) |

La zone se donne par `bbox` **ou** par `lat`+`lng`(+`r` en km) : une simple URL suffit à
décrire les événements d'une zone (utile au mobile et au debug).

Toutes les routes renvoient une enveloppe `{ …data, meta: { generatedAt, sources[] } }`.
Chaque source y est reportée avec `ok` (et `stale` si le flux répond mais sert de la donnée
morte) — une source en échec ne fait **jamais** échouer la requête.

## Étendre

- **Nouvelle source** → un fichier `src/core/sources/<name>.ts` (contrat `IncidentSource` /
  `PoiSource`), ajouté au module concerné. *Sonder l'API en direct avant d'écrire le code.*
- **Nouveau module** → un fichier `src/core/modules/<slug>.ts` + entrée dans
  `src/core/registry.ts`. L'API et l'UI le prennent en charge automatiquement.
- **Nouvelle couche de carte** → un `PoiLayer` dans le module (`pins`, `heatmap` ou `fill`).

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 (tokens OKLCH) · MapLibre GL (sans clé) ·
Prisma/SQLite · Zod.
