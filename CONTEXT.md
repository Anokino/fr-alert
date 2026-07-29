# France Alert — CONTEXT

> Document de référence du projet. À lire au début de **chaque** session avant de coder.
> Il décrit la vision, le périmètre, les décisions d'architecture et les contrats de code
> qui doivent rester stables entre les sessions. Toute décision structurante nouvelle se
> reporte ici.

Dernière mise à jour : 2026-07-29.

---

## 0. Reprendre le projet (lire ceci en premier)

Pour reprendre France Alert — humain ou nouvelle session IA — voici **tout** ce qu'il faut
lire, dans l'ordre. Le repo est **auto-suffisant** : tout le savoir projet vit ici, pas
besoin d'accès externe.

**Documentation du repo (source de vérité)** :
1. `CONTEXT.md` (ce fichier) — vision, périmètre, contrats de code stables, conventions, état.
2. `ARCHITECTURE.md` — arborescence réelle, flux de données, décisions d'implémentation.
3. `docs/SOURCES.md` — catalogue des sources externes : endpoints, pièges vérifiés en direct,
   statut. **À lire avant de toucher à une source** (chaque API a ses traquenards documentés).
4. `docs/ROADMAP.md` — état d'avancement complet : livré / en cours / à faire.
5. `docs/DEPLOY.md` — mise en ligne (o2switch/cPanel) : les deux exécutions, le cron, les pièges.
6. `README.md` — démarrage rapide, table des routes API.

**Skills à utiliser** (Claude Code) : pour toute UI, charger **`frontend-design`** (qualité
visuelle) + **`web-design-guidelines`** (bonnes pratiques web, à lancer sur les fichiers
modifiés). `design-guide` décrit un autre produit (Paperclip) — n'en garder que les principes
transverses (tokens OKLCH sémantiques, `cn()`, CVA, sombre par défaut), pas ses chemins.

**Mémoire Claude Code** (sessions IA sur cette machine, chargée automatiquement) :
`~/.claude/projects/C--Users-nkolo-Documents-CODE-fr-alert/memory/` — index `MEMORY.md` +
notes `france-alert-*.md`. Ce sont des **résumés/pointeurs** vers la doc du repo ci-dessus,
pas une source parallèle : en cas de doute, le repo fait foi. (Non versionnés avec le repo car
c'est le mécanisme de reprise auto de Claude Code ; le repo reste lisible sans eux.)

**Méthode de travail établie** (voir §8 et l'historique) : **vérifier une source en direct
avant de coder contre elle** (chaque API sondée a révélé un piège) ; **livrer, puis vérifier
end-to-end** sur données réelles (screenshot / appel API), jamais supposer ; après un
changement non trivial, **redémarrer le dev server** avant de conclure (le cache mémoire et le
HMR gardent l'ancien état — plusieurs faux positifs déjà rencontrés).

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
- **Priorisation des alertes** (score d'importance, épinglage, suggestions contextuelles)
  et **couches de module enrichies** (carte thermique…). Deux chantiers v2 décidés le
  2026-07-16 : voir `docs/ROADMAP.md`. Ils prolongent le principe n°1 (« réponse d'abord »)
  — arriver sur le site pendant un gros feu doit donner ce feu, pas une liste triée par
  distance. **Déterministe d'abord** : le score doit rester explicable, le LLM est réservé
  au texte libre (signalements).

---

## 3. Stack technique

- **Next.js (App Router) + TypeScript** — un seul projet sert le **web** (React Server
  Components pour un premier rendu rapide) **et l'API** (Route Handlers sous `/api`). Le
  mobile futur consommera exactement ces routes `/api/*`.
- **Tailwind CSS v4** (tokens via variables CSS, espace OKLCH) + primitives inspirées
  shadcn/ui, `cn()` (clsx + tailwind-merge), CVA pour les variantes.
- **MapLibre GL JS** — carto open-source, **sans clé**, fonds de carte raster libres
  (OSM / Carto). Aucun token propriétaire requis.
- **Prisma + SQLite** — persistance des **signalements citoyens**, de l'**instantané des
  sources nationales** et de l'**état d'ingestion**. SQLite en dev **et en prod** (choix de
  simplicité assumé : un fichier, aucun service à provisionner) ; migrable MySQL/Postgres
  derrière Prisma si le volume l'exige un jour.
- **Zod** — validation des payloads d'API (entrée signalement, params).

Raisons : un seul déploiement, une seule base de types partagée client/serveur, caching et
revalidation natifs pour les flux externes, zéro clé obligatoire pour démarrer.

### Deux exécutions, un seul dépôt

Le projet produit **deux processus** à partir du même code (cf. §4 et `docs/DEPLOY.md`) :

| | **Web** | **Worker d'ingestion** |
|---|---|---|
| Lancé par | Passenger (`server.js`) | cron (`npm run ingest`) |
| Rôle | répondre aux utilisateurs | rafraîchir les données nationales |
| Appelle les APIs amont | **non** (en mode délégué) | oui |
| Build | `next build` → `.next/` | `tsc` → `dist/` |

Ce n'est **pas** une séparation en deux dépôts ni deux applications : c'est le même registre
de modules, exercé par deux points d'entrée. Ajouter une source reste « ajouter un fichier ».

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
                    └──────┬──────────────────────────┬───────────┘
        scope: "national"  │                          │  scope: "local"
        (flux entiers)     ▼                          │  (propre à un point)
              ┌───────────────────────┐               │
              │  WORKER D'INGESTION   │  cron         │
              │  npm run ingest       │  toutes       │
              │  (src/worker)         │  les 5 min    │
              └───────────┬───────────┘               │
                          │ écrit                     │
                          ▼                           │
              ┌───────────────────────┐               │
              │   SQLite (Prisma)     │               │
              │  Snapshot · SourceRun │               │
              │  Report (signalements)│               │
              └───────────┬───────────┘               │
                          │ lit                       │  à la demande
                          ▼                           ▼
   ┌───────────────────────────────────────────────────────────────┐
   │  REGISTRE DE MODULES  (core/registry.ts)                       │
   │  fire · flood · water · air · quake · weather · health         │
   │  chaque module = { meta, sources[], poiLayers[], context }     │
   └───────────────┬───────────────────────────────────────────────┘
                   │  les DEUX exécutions itèrent ce même registre
                   ▼
   API Route Handlers  →  Frontend (RSC + client)
   /api/incidents · /api/modules[/slug] · /api/pois · /api/reports
   /api/geo/* · /api/health (état de l'ingestion)
```

**Cache à deux étages.** Les données **nationales** (lentes, lourdes, identiques pour tous)
passent par un **instantané persistant** en base (`core/snapshot.ts`), écrit par le worker et
lu par le web. Les données **locales** (propres à un point : qualité de l'air, POIs OSM,
commune) gardent le **cache mémoire TTL** (`core/cache.ts`), qui sert aussi de niveau 1 devant
l'instantané — relire plusieurs Mo à chaque requête coûterait plus que l'appel réseau évité.

TTL adapté à la fraîcheur de la donnée (séismes 2 min, air 30 min, eau potable 6 h, POIs 24 h…) ;
c'est **ce même `ttlSeconds` qui pilote la cadence d'ingestion**, donc le cron n'a jamais besoin
d'être retouché quand on ajoute une source.

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
  national?: boolean;      // non localisé (ex. rappel) → bandeau dédié, hors beacon
  forecast?: boolean;      // risque prévu, pas en cours → bandeau dédié, hors beacon
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
type SourceScope = "national" | "local";   // défaut "local"

interface IncidentSource {
  id: string;                 // "firms", "emsc", "hubeau-water"
  label: string;              // "NASA FIRMS"
  attribution: string;        // mention légale à afficher
  ttlSeconds: number;         // durée de cache ET cadence d'ingestion
  requiresEnv?: string;       // nom de variable d'env si clé requise
  scope?: SourceScope;        // "national" → pré-ingérée par le worker
  fetch(ctx: FetchContext): Promise<Incident[]>;   // fail-soft: throw autorisé, capté en amont
  isStale?(ctx: FetchContext): Promise<boolean>;   // flux « répond 200 mais mort » → meta.stale
}

interface PoiSource {
  id: string;
  label: string;
  attribution: string;
  ttlSeconds: number;
  requiresEnv?: string;       // sans la clé, la couche n'est pas proposée
  scope?: SourceScope;
  ingestParams?: Record<string, string>[];  // jeux de params à pré-ingérer (couche réglable)
  fetch(ctx: FetchContext): Promise<Poi[]>;
}

interface FetchContext {
  bbox: BBox;                 // [minLng, minLat, maxLng, maxLat]
  center?: { lat: number; lng: number };
  signal?: AbortSignal;
  params?: Record<string, string>; // couches paramétrables (ex. { days: "3" } pour EFFIS)
}
```

`meta.sources[].stale` (posé par le registre via `isStale`) signale un flux qui répond mais
sert de la donnée morte — un `count: 0` ne doit jamais être pris pour du calme réel sans
l'avoir vérifié (vécu : satellite FIRMS Suomi-NPP mort renvoyant des CSV vides).

**`scope` décide qui appelle l'API amont.** `national` = la requête amont ne dépend pas de la
zone demandée (flux national ou européen récupéré en entier puis filtré) : le worker l'ingère
d'avance et le web n'appelle plus rien. `local` (défaut) = la requête dépend
intrinsèquement du point ou de la bbox (une mesure d'air à une coordonnée, les POIs OSM d'un
rectangle) : pré-calculer toute la France à cette granularité est impraticable, ça reste à la
demande.

Deux règles qui vont ensemble :

- Ne déclarer `national` **que** si le travail coûteux passe par `snapshot()` — c'est
  l'instantané qui est mutualisé, pas le résultat final. Le filtrage par bbox continue de
  s'exécuter à chaque requête, donc la réponse reste juste pour l'utilisateur.
- **L'app doit rester fonctionnelle sans worker.** Sans `FA_INGEST=1`, le web se rabat sur
  l'appel direct : plus lent, mais autonome. Le mode délégué est un interrupteur, jamais une
  dépendance dure — c'est ce qui permet de développer et de revenir en arrière sans rien casser.

### 5.3 Contrat de module (`src/core/types.ts`)

```ts
interface IncidentModule {
  slug: string;
  name: string;               // "Incendies"
  tagline: string;            // phrase courte
  icon: string;               // nom d'icône lucide
  accent: string;             // token de couleur d'accent du module
  sources: IncidentSource[];
  poiLayers: PoiLayer[];
  contextPanels?: ContextPanel[]; // blocs d'info additionnels (conseils, définitions…)
  enabled(): boolean;         // false si dépend d'une clé absente ET pas d'autre source
}

interface PoiLayer {
  id: string;
  label: string;
  icon: string;               // nom d'icône lucide
  color: string;              // token de couleur
  source: PoiSource;          // `requiresEnv` : sans la clé, la couche n'est pas proposée
  render?: 'pins' | 'heatmap' | 'fill';  // défaut 'pins'
  weightProp?: string;        // 'heatmap' : clé de Poi.props portant l'intensité
}
// Un Poi porte lat/lng (ponctuel) et, pour les couches 'fill', une `geometry` + `severity`.
```

**Le verdict de la home porte sur « maintenant, ici ».** Le beacon, le compteur
« N incidents à proximité » et les pastilles de modules se calculent sur
`incidents.filter(i => !i.national && !i.forecast)`. Les deux drapeaux servent la même
mécanique : sortir du verdict ce qui n'y a pas sa place, et l'afficher dans son propre
bandeau. `national` = pas localisé (rappel produit) ; `forecast` = pas encore là (risque
annoncé, `startedAt` porte alors l'échéance). Une source qui n'est ni l'un ni l'autre allume
le beacon — c'est le défaut, et il doit rester réservé à ce qui se produit réellement (§1,
principes 1 et 3).

**Couches de module** : une couche est **toujours désactivable** et par défaut éteinte. Une
couche peut être **paramétrable** par l'utilisateur : les paramètres passent par la query
string de `/api/pois` → `FetchContext.params` (ex. `days` pour la fenêtre temporelle des
périmètres de feux EFFIS). Toujours prévoir un défaut. Trois rendus. `pins` = des épingles cliquables, une par POI : pour de l'information ponctuelle
(une borne, une caserne). `heatmap` = une nappe de densité (ex. détections FIRMS brutes).
`fill` = des zones colorées par `Poi.severity` (ex. départements en vigilance, périmètres de
feux EFFIS). `heatmap` et `fill` sont du **contexte visuel** — ni clic ni libellé, jamais une
alerte. Une même donnée peut avoir deux représentations : l'incident ponctuel (l'alerte, qui
peut allumer le beacon) et la couche (le contexte, qui ne le fait jamais) — c'est le cas de la
Vigilance (points + zones) et de FIRMS (foyers + nappe). Une couche dont la donnée pourrait se
lire comme une alerte doit passer par une source d'incidents, pas par une couche.

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
- **Le fail-soft appartient au registre, pas à l'adaptateur.** Une source qui échoue *laisse
  remonter* son erreur : `runSource` / `collectPois` (registry.ts) la loggent et posent
  `ok=false`. Un `try/catch { return [] }` dans un adaptateur produit une couche vide
  annoncée comme un **succès** — l'app affiche alors « aucun incident » alors qu'elle est
  aveugle. C'est un mensonge sur la fraîcheur de la donnée, donc une violation du principe
  produit n°3 (§1). Deux pannes réelles ont été masquées ainsi (Hub'Eau v1 retirée → 403,
  `DATABASE_URL` absente) ; corrigé le 2026-07-15.
- **Changer la forme d'une donnée en instantané = incrémenter `SCHEMA_VERSION`**
  (`core/snapshot.ts`). Le cache mémoire se vidait au redémarrage, ce qui pardonnait les
  refactors ; l'instantané, lui, **survit au déploiement**. Sans changement de version, le
  nouveau code désérialiserait indéfiniment l'ancienne forme.
- **Un `PRAGMA` SQLite se lit avec `$queryRaw`, jamais `$executeRaw`.** `journal_mode` et
  `busy_timeout` renvoient une ligne, et Prisma rejette un `execute` qui produit un résultat.
  Vécu le 2026-07-29 : les trois PRAGMA échouaient et le WAL n'était jamais activé — en
  silence, l'erreur étant capturée. Le worker affiche donc désormais le journal effectif.

---

## 9. État d'avancement

Détail complet et à jour dans **`docs/ROADMAP.md`** (livré / en cours / à faire). Chaque
session le met à jour.

**Fait et vérifié en direct (au 2026-07-16)** : les 7 modules ; toutes les sources live
(Open-Meteo, EMSC, Hub'Eau eau + hydro v2, RappelConso, Overpass, Vigicrues, FIRMS
auto-réparant, Météo-France Vigilance + Météo des forêts, EFFIS) ; le système de **couches de
module** à trois rendus (`pins` / `heatmap` / `fill`) avec couches **paramétrables**
(`FetchContext.params`, ex. fenêtre des périmètres EFFIS) ; le **filtre contextuel** FIRMS ×
EFFIS (seuil abaissé dans un périmètre de feu) ; le champ `stale` pour les flux morts.

**Fait aussi le 2026-07-16 (chantier « barre d'adresse & loaders », app + API)** :
- **Point+rayon dans l'API** (`bboxFromParams`) : `/api/incidents` et `/api/pois` acceptent
  `lat`+`lng`(+`r`) en plus de `bbox`. Une URL décrit la zone (app, mobile, debug).
- **Géocodage d'adresse** (`geocodeAddress` + `GET /api/geo/search`) via api-adresse.data.gouv.fr.
- **Loaders de boutons réutilisables** (`usePending` + `PendingButton`) sur tous les boutons
  d'action.
- **Synchro URL** (`lib/url.ts`) : `mode`/`lat`/`lng`/`r`/`layers`/`days`, lus au montage et
  réécrits à chaque changement. La position géoloc réelle n'est **jamais** écrite (donnée
  personnelle) ; seule une adresse/coordonnée choisie l'est.
- **Barre d'adresse** (`LocationBar`) : sélecteur « Ma position / Adresse / National »,
  autocomplétion d'adresse, saisie de coordonnées GPS, mode national (France entière).
- **Point d'observation partagé** (`context/LocationContext.tsx`, monté au layout racine) :
  mode / adresse / rayon survivent à la navigation accueil ↔ module. Les couches et la fenêtre
  EFFIS restent locales à la page module.

**Fait le 2026-07-29 (chantier « split web / ingestion », préparation au déploiement)** :
- **Instantané persistant** (`core/snapshot.ts` + tables `Snapshot`/`SourceRun`) : les données
  nationales vivent en base, partagées entre les deux exécutions et survivant au recyclage du
  process web.
- **Worker d'ingestion** (`src/worker/ingest.ts`, `npm run ingest`) : itère le registre,
  rafraîchit les sources `scope: "national"` périmées, consigne chaque passage. Aucune source
  en dur.
- **`scope` sur les contrats de source** + `ingestParams` pour les couches réglables.
- **Prêt à déployer** : `server.js` (entrée Passenger), `tsconfig.worker.json` (+ `dist/`),
  scripts `build`/`ingest`, `GET /api/health`, et `docs/DEPLOY.md` (runbook o2switch).
- Vérifié en direct : ingestion réelle des 13 unités, FIRMS **33 464 ms → 11 ms**, couches du
  module feu **45 s → 1 ms**, WAL actif, et une donnée non ingérée remonte bien `ok: false`
  au lieu d'un faux « rien à signaler ».

**Prochaine étape** : chantiers v2 (voir `docs/ROADMAP.md` §4) — score d'importance
déterministe, crawler de statuts d'événements, et le **rework du layout du module** (acté :
rayon + couches + fenêtre + barre d'adresse s'empilent, c'est devenu chargé). Les deux
premiers s'appuient désormais sur le worker, qui est leur foyer naturel.
