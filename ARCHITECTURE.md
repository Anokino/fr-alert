# France Alert — ARCHITECTURE

Complément technique de `CONTEXT.md`. Décrit l'arborescence, le flux de données et les
décisions d'implémentation.

## Arborescence

```
france-alert/
├── CONTEXT.md                 # vision + contrats (lire en premier)
├── ARCHITECTURE.md            # ce fichier
├── README.md                  # démarrage rapide
├── docs/
│   ├── SOURCES.md             # catalogue détaillé des sources
│   └── ROADMAP.md             # état d'avancement
├── .env.example               # variables d'env (clés optionnelles)
├── prisma/
│   └── schema.prisma          # Report (SQLite)
├── next.config.ts
├── tailwind / postcss / tsconfig
└── src/
    ├── app/
    │   ├── layout.tsx         # shell, fonts, thème
    │   ├── globals.css        # tokens Tailwind v4 + variables
    │   ├── page.tsx           # HOME géolocalisée (beacon + carte + liste)
    │   ├── m/[slug]/page.tsx  # espace d'un module d'incident
    │   ├── signaler/page.tsx  # formulaire de signalement
    │   └── api/
    │       ├── incidents/route.ts
    │       ├── modules/route.ts
    │       ├── modules/[slug]/route.ts
    │       ├── pois/route.ts
    │       ├── reports/route.ts        # GET liste, POST création
    │       └── geo/reverse/route.ts    # reverse-geocode util (geo.api.gouv.fr)
    ├── core/                  # ← logique métier, agnostique de l'UI et de l'API
    │   ├── types.ts           # Incident, Poi, IncidentModule, sources… (contrats)
    │   ├── registry.ts        # liste des modules + helpers d'agrégation
    │   ├── cache.ts           # cache mémoire TTL + fetchJson fail-soft
    │   ├── geo.ts             # bbox, haversine, centroïde commune
    │   ├── severity.ts        # échelle Vigilance + helpers
    │   ├── sources/           # adaptateurs (1 fichier = 1 source)
    │   │   ├── firms.ts
    │   │   ├── openmeteo-air.ts
    │   │   ├── emsc-quakes.ts
    │   │   ├── hubeau-water.ts
    │   │   ├── hubeau-hydro.ts
    │   │   ├── rappelconso.ts
    │   │   ├── meteofrance-vigilance.ts
    │   │   ├── overpass.ts     # helper POI OSM générique
    │   │   └── citizen.ts      # signalements SQLite → Incident[]
    │   └── modules/           # définitions de modules (1 fichier = 1 module)
    │       ├── fire.ts
    │       ├── flood.ts
    │       ├── water.ts
    │       ├── air.ts
    │       ├── quake.ts
    │       ├── weather.ts
    │       └── health.ts
    ├── components/
    │   ├── ui/                # primitives (button, card, badge, sheet…)
    │   ├── map/               # MapView (MapLibre), couches, marqueurs
    │   ├── StatusBeacon.tsx   # signature de la home
    │   ├── IncidentCard.tsx
    │   ├── IncidentList.tsx
    │   ├── ModuleNav.tsx
    │   └── SeverityBadge.tsx
    ├── hooks/
    │   ├── useGeolocation.ts
    │   └── useIncidents.ts
    └── lib/
        ├── utils.ts           # cn()
        └── api-client.ts      # fetch typé côté client
```

## Flux « ai-je un danger près de moi ? »

1. Home (client) demande la **géolocalisation navigateur** (`useGeolocation`). Fallback :
   IP/centre France si refus.
2. On calcule une **bbox** autour du point (rayon paramétrable, défaut ~25 km).
3. Appel `GET /api/incidents?bbox=…` → l'API itère le registre, appelle les sources de chaque
   module (en parallèle, cachées, fail-soft), agrège et renvoie `{ incidents, meta }`.
4. Le **StatusBeacon** calcule la sévérité max (`core/severity.ts`) → couleur Vigilance +
   libellé. La carte affiche les incidents ; la liste les détaille, triés par proximité.

## Décisions

- **Agrégation côté serveur** : le client ne parle qu'à `/api/*`. Les clés restent serveur ;
  le CORS des sources externes n'impacte pas le navigateur ; le cache est mutualisé.
- **Cache mémoire process** (Map + timestamp). Suffisant pour un process Next. En prod
  multi-instances, remplaçable par Redis derrière la même interface `cache.ts` (pas de
  changement appelant).
- **Parallélisme borné** : `Promise.allSettled` sur les sources d'un module ; un `settled`
  rejeté ⇒ source `ok:false` dans `meta`, `[]` en données.
- **bbox obligatoire** sur `/api/incidents` (sauf sources non-géo comme rappels nationaux, qui
  sont renvoyées avec un flag `national: true` et placées hors carte, en bandeau).
- **Signalements** : `POST /api/reports` (validé Zod) → SQLite. La source `citizen.ts` relit
  la base filtrée par bbox et fraîcheur (< 24 h par défaut) et les projette en `Incident`.
- **Sévérité normalisée** : chaque adaptateur mappe sa donnée native vers
  `green|yellow|orange|red`. Un seul langage de gravité dans toute l'app.

## Extensibilité (checklist)

- Nouvelle source → 1 fichier `core/sources/*` implémentant `IncidentSource`/`PoiSource`,
  ajouté au module concerné. Le cache et le fail-soft sont gratuits.
- Nouveau module → 1 fichier `core/modules/*` + entrée dans `registry.ts`.
- Nouveau POI → 1 `PoiLayer` (souvent une requête Overpass) dans le module.
- L'API mobile future = ces mêmes routes ; ajouter au besoin `/api/subscribe` (push) sans
  toucher au cœur.
