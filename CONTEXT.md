# France Alert — CONTEXT

> Document de référence du projet. À lire au début de **chaque** session avant de coder.
> Il décrit la vision, le périmètre, les décisions d'architecture et les contrats de code
> qui doivent rester stables entre les sessions. Toute décision structurante nouvelle se
> reporte ici.

Dernière mise à jour : 2026-07-13.

---

## 1. Vision

**France Alert** est une application d'information de sécurité civile pour le grand public.
Elle répond, en une seconde, à une seule question :

> **« Y a-t-il un danger près de chez moi, maintenant ? »**

Et ensuite elle permet de :

- **s'informer** en détail sur chaque type d'incident (feux, inondations, qualité de l'eau,
  qualité de l'air, séismes, vigilance météo, alertes sanitaires / rappels produits…) ;
- **signaler** un incident observé (feu, inondation…) pour alimenter la carte ;
- **agir ou prendre conscience** : contribuer (ex. inondation) ou se protéger
  (ex. eau non potable dans sa commune).

À terme : une **application mobile** qui pousse une **notification** aux personnes
géographiquement proches d'un incident, le plus vite possible. Le web actuel et le mobile
futur partagent la **même API**.

### Principes produit

1. **Réponse d'abord, détails ensuite.** La home donne un verdict clair (aucun danger / N
   incidents) avant toute autre chose.
2. **Local par défaut.** Tout est filtré autour de la position de l'utilisateur.
3. **Rapide et fiable.** Le site charge vite, fonctionne même si une source tombe, ne ment
   jamais sur la fraîcheur d'une donnée.
4. **Modulaire.** Ajouter un type d'incident ou une source = ajouter un fichier, pas
   refactorer l'app.
5. **UX > démo de design.** Sobre, moderne, lisible en situation de stress.

---

## 2. Périmètre (v1)

### Modules d'incidents livrés

| Module    | Slug     | Sources live                                   | POIs contextuels                   |
|-----------|----------|------------------------------------------------|------------------------------------|
| Incendies | `fire`   | NASA FIRMS (clé), signalements citoyens        | Bornes incendie, casernes (OSM)    |
| Inondations | `flood` | Vigicrues, Vigilance MF (clé)*, signalements    | Stations hydro, mairies (OSM)      |
| Eau potable | `water` | Hub'Eau qualité eau potable                    | Réseaux/UDI par commune            |
| Qualité de l'air | `air` | Open-Meteo Air Quality                      | —                                  |
| Séismes   | `quake`  | EMSC seismicportal (FDSN)                       | —                                  |
| Vigilance météo | `weather` | Météo-France Vigilance (clé)*            | —                                  |
| Sanitaire / rappels | `health` | RappelConso                            | —                                  |

`*` = source optionnelle / à activation par clé ou webservice instable ; l'app dégrade
proprement si absente.

### Hors périmètre v1 (mais l'archi doit le permettre)

- Notifications push mobile (l'API expose déjà les données géolocalisées nécessaires).
- Comptes utilisateurs / modération avancée des signalements.
- Historique long terme / analytics.

---

## 3. Stack technique

- **Next.js (App Router) + TypeScript** — un seul projet sert le **web** (React Server
  Components pour un premier rendu rapide) **et l'API** (Route Handlers sous `/api`). Le
  mobile futur consommera exactement ces routes `/api/*`.
- **Tailwind CSS v4** (tokens via variables CSS, espace OKLCH) + primitives inspirées
  shadcn/ui, `cn()` (clsx + tailwind-merge), CVA pour les variantes.
- **MapLibre GL JS** — carto open-source, **sans clé**, fonds de carte raster libres
  (OSM / Carto). Aucun token propriétaire requis.
- **Prisma + SQLite** — persistance des **signalements citoyens** (et futures entités).
  SQLite en dev ; migrable Postgres en prod sans changer le code applicatif.
- **Zod** — validation des payloads d'API (entrée signalement, params).

Raisons : un seul déploiement, une seule base de types partagée client/serveur, caching et
revalidation natifs pour les flux externes, zéro clé obligatoire pour démarrer.

---

## 4. Architecture (vue d'ensemble)

Le cœur du système est un **registre de modules**. Chaque module d'incident déclare ses
**sources** (flux d'incidents live) et ses **couches de POI** (points d'intérêt
contextuels). L'API et l'UI sont **génériques** : elles itèrent sur le registre, elles ne
connaissent aucun module en dur.

```
                    ┌─────────────────────────────────────────────┐
   Sources externes │  FIRMS · Hub'Eau · Open-Meteo · EMSC ·       │
   (live, open data)│  RappelConso · Overpass(OSM) · Météo-France  │
                    └───────────────┬─────────────────────────────┘
                                    │  adaptateurs (core/sources/*)
                                    │  → normalisent en Incident / Poi
                                    ▼
   ┌───────────────────────────────────────────────────────────────┐
   │  REGISTRE DE MODULES  (core/registry.ts)                       │
   │  fire · flood · water · air · quake · weather · health         │
   │  chaque module = { meta, sources[], poiLayers[], context }     │
   └───────────────┬───────────────────────────────────────────────┘
                   │
     ┌─────────────┴───────────────┐
     ▼                             ▼
   API Route Handlers          Base SQLite (Prisma)
   /api/incidents              signalements citoyens
   /api/modules[/slug]         (source "citizen" par module)
   /api/pois
   /api/reports (GET/POST)
     │
     ▼
   Frontend (RSC + client)
   home géolocalisée · carte · pages modules · signalement
```

Cache : chaque appel à une source externe passe par un **cache mémoire TTL** (`core/cache.ts`)
pour absorber la charge et rester rapide. TTL adapté à la fraîcheur de la donnée (séismes 2
min, air 30 min, eau potable 6 h, POIs 24 h…).

Fail-soft : une source qui échoue est *loggée* et renvoie `[]`. Un module reste utilisable
même si l'une de ses sources est indisponible. L'UI affiche la fraîcheur et les sources en
échec.

Détail complet dans **ARCHITECTURE.md**.

---

## 5. Contrats de code (STABLES — ne pas casser sans mettre à jour ce doc)

### 5.1 Types de domaine (`src/core/types.ts`)

```ts
type Severity = 'green' | 'yellow' | 'orange' | 'red';   // échelle Vigilance FR

interface Incident {
  id: string;              // stable, préfixé par source: "firms:123", "citizen:uuid"
  moduleSlug: string;      // "fire", "flood", ...
  title: string;
  description?: string;
  severity: Severity;
  lat: number;
  lng: number;
  startedAt: string;       // ISO
  updatedAt?: string;      // ISO
  sourceId: string;        // id de la source
  sourceLabel: string;     // affichable
  url?: string;            // lien détail officiel
  props?: Record<string, unknown>; // spécifique au module
}

interface Poi {
  id: string;
  layerId: string;
  label: string;
  lat: number;
  lng: number;
  props?: Record<string, unknown>;
}
```

### 5.2 Contrat de source (`src/core/types.ts`)

```ts
interface IncidentSource {
  id: string;                 // "firms", "emsc", "hubeau-water"
  label: string;              // "NASA FIRMS"
  attribution: string;        // mention légale à afficher
  ttlSeconds: number;         // durée de cache
  requiresEnv?: string;       // nom de variable d'env si clé requise
  fetch(ctx: FetchContext): Promise<Incident[]>;   // fail-soft: throw autorisé, capté en amont
}

interface PoiSource {
  id: string;
  label: string;
  attribution: string;
  ttlSeconds: number;
  fetch(ctx: FetchContext): Promise<Poi[]>;
}

interface FetchContext {
  bbox: BBox;                 // [minLng, minLat, maxLng, maxLat]
  center?: { lat: number; lng: number };
  signal?: AbortSignal;
}
```

### 5.3 Contrat de module (`src/core/types.ts`)

```ts
interface IncidentModule {
  slug: string;
  name: string;               // "Incendies"
  tagline: string;            // phrase courte
  icon: string;               // nom d'icône lucide
  accent: string;             // token de couleur d'accent du module
  sources: IncidentSource[];
  poiLayers: PoiLayer[];      // { id, label, icon, color, source: PoiSource }
  contextPanels?: ContextPanel[]; // blocs d'info additionnels (conseils, définitions…)
  enabled(): boolean;         // false si dépend d'une clé absente ET pas d'autre source
}
```

**Ajouter un module** = créer `src/core/modules/<slug>.ts`, l'enregistrer dans
`registry.ts`. Rien d'autre à toucher : API et UI le prennent en compte automatiquement.

**Ajouter une source à un module existant** = créer `src/core/sources/<name>.ts` et l'ajouter
au tableau `sources` du module.

### 5.4 Réponses API (enveloppe stable)

```ts
// GET /api/incidents?bbox=minLng,minLat,maxLng,maxLat&modules=fire,flood
{
  incidents: Incident[];
  meta: {
    generatedAt: string;
    sources: { id: string; ok: boolean; count: number; stale?: boolean }[];
  };
}
```

Toutes les routes renvoient cette forme d'enveloppe `{ data…, meta }` et ne *jettent* jamais
une 500 pour une simple source en échec.

---

## 6. Sources de données (catalogue)

Voir `docs/SOURCES.md` pour le détail (endpoints, clés, TTL, statut de vérification).
Résumé du statut vérifié le 2026-07-15 :

- ✅ **keyless OK** : Open-Meteo Air Quality, EMSC seismicportal (FDSN), Hub'Eau qualité eau
  potable, **Vigicrues** (flux `.geojson`), **Hub'Eau hydrométrie v2** (stations),
  RappelConso (dataset `rappelconso-v2-gtin-espaces`), Overpass (OSM),
  geo.api.gouv.fr (géocodage commune).
- 🔑 **clé requise (optionnel)** : NASA FIRMS (`FIRMS_MAP_KEY`), Météo-France Vigilance
  (`METEOFRANCE_TOKEN` — pas d'alternative keyless : l'API répond 401 sans token et seule
  l'archive est sur data.gouv.fr). Modules dégradent proprement si absentes.

Deux pièges d'URL vérifiés en direct, à ne pas réintroduire : Vigicrues `.jsonld` → **404**
(utiliser `.geojson`) ; Hub'Eau `hydrometrie` **v1 → 403** (la v1 est retirée, utiliser v2).

---

## 7. Identité visuelle

Direction : **« salle de veille » civile, sobre et rassurante**, orientée carte. Le langage
de gravité reprend l'**échelle officielle Vigilance française** (vert / jaune / orange /
rouge) — vernaculaire authentique de la sécurité civile FR, pas un accent décoratif.

- **Signature** : un *beacon* de statut local en haut de la home — indicateur radial qui
  pulse à la couleur du niveau de danger le plus élevé autour de l'utilisateur, répondant à
  la question centrale d'un coup d'œil.
- **Type** : display `Bricolage Grotesque` (caractère, avec parcimonie), corps `Inter`,
  data/coordonnées `JetBrains Mono`.
- **Thème** : sombre par défaut (la carte et les couleurs de gravité ressortent), thème clair
  disponible. Tokens sémantiques uniquement, jamais de hex en dur.
- Accessibilité : focus visible clavier, `prefers-reduced-motion` respecté, contrastes AA,
  la couleur n'est jamais le seul porteur d'information (icône + libellé de niveau).

---

## 8. Conventions

- Fichiers composants : `PascalCase.tsx` sous `src/components/`.
- Primitives UI : `src/components/ui/*` (kebab-case).
- Sources : `src/core/sources/<name>.ts` ; modules : `src/core/modules/<slug>.ts`.
- Toujours `cn()` pour composer les classes ; CVA pour les variantes.
- Jamais de secret côté client. Les clés vivent en env serveur, lues dans les adaptateurs.
- Tout appel réseau externe est *fail-soft* et caché via `core/cache.ts`.

---

## 9. État d'avancement

Voir `docs/ROADMAP.md`. Chaque session met à jour l'état des modules et des sources.
