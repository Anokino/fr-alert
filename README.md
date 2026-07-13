# France Alert

Application d'information de sécurité civile pour le grand public. Répond en un coup d'œil à
« **y a-t-il un danger près de chez moi ?** », affiche une carte des incidents et permet de
signaler un événement. Architecture **modulaire** (feux, inondations, eau potable, qualité de
l'air, séismes, vigilance météo, rappels sanitaires) et **API** partagée avec la future app
mobile.

> Lire `CONTEXT.md` puis `ARCHITECTURE.md` avant de contribuer.

## Démarrage

```bash
npm install
npx prisma db push      # crée la base SQLite (dev.db)
npm run dev             # http://localhost:3000
```

Aucune clé n'est nécessaire : les sources ouvertes fonctionnent d'emblée. Copiez
`.env.example` en `.env` pour activer les sources optionnelles :

- `FIRMS_MAP_KEY` — feux actifs NASA FIRMS (clé gratuite).
- `METEOFRANCE_TOKEN` — vigilance météo officielle.

## API

| Route | Description |
|-------|-------------|
| `GET /api/incidents?bbox=minLng,minLat,maxLng,maxLat&modules=fire,flood` | Incidents agrégés dans la zone |
| `GET /api/modules` | Liste des modules (métadonnées) |
| `GET /api/modules/{slug}?bbox=…` | Incidents + méta d'un module |
| `GET /api/pois?module=fire&layers=fire-hydrant&bbox=…` | POIs contextuels |
| `GET /api/reports?module=fire` · `POST /api/reports` | Signalements citoyens |
| `GET /api/geo/reverse?lat=…&lng=…` | Commune d'un point |

## Étendre

- **Nouvelle source** → un fichier `src/core/sources/<name>.ts` (contrat `IncidentSource` /
  `PoiSource`), ajouté au module concerné.
- **Nouveau module** → un fichier `src/core/modules/<slug>.ts` + entrée dans
  `src/core/registry.ts`. L'API et l'UI le prennent en charge automatiquement.

Voir `docs/SOURCES.md` (catalogue) et `docs/ROADMAP.md` (état).

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · MapLibre GL · Prisma/SQLite · Zod.
