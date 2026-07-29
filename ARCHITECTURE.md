# France Alert — ARCHITECTURE

Complément technique de `CONTEXT.md`. Décrit l'arborescence **réelle**, le flux de données et
les décisions d'implémentation. Mis à jour le 2026-07-29.

## Arborescence

```
fr-alert/
├── CONTEXT.md                 # vision + contrats + conventions (lire en premier)
├── ARCHITECTURE.md            # ce fichier
├── README.md                  # démarrage rapide + routes API
├── docs/
│   ├── SOURCES.md             # catalogue des sources + pièges vérifiés (lire avant d'y toucher)
│   ├── ROADMAP.md             # état d'avancement : livré / prochaine étape / backlog
│   └── DEPLOY.md              # mise en ligne o2switch : app Node, cron, bascule, dépannage
├── .env.example               # DATABASE_URL + FA_INGEST + clés optionnelles
├── server.js                  # ENTRÉE WEB — chargée par Passenger (listen('passenger'))
├── tsconfig.worker.json       # ENTRÉE WORKER — compile core+worker vers dist/ (CommonJS)
├── scripts/postbuild-worker.mjs  # dépose dist/package.json {"type":"commonjs"}
├── prisma/schema.prisma       # Report · Snapshot · SourceRun (SQLite)
└── src/
    ├── worker/
    │   └── ingest.ts          # WORKER : une passe d'ingestion, lancé par cron
    ├── app/
    │   ├── layout.tsx         # shell, polices, thème
    │   ├── globals.css        # tokens Tailwind v4 (OKLCH) + styles MapLibre
    │   ├── page.tsx           # HOME géolocalisée (beacon + carte + listes)
    │   ├── m/[slug]/page.tsx  # espace d'un module (carte, couches, incidents, contexte)
    │   ├── signaler/page.tsx  # formulaire de signalement
    │   └── api/
    │       ├── incidents/route.ts       # agrégation multi-modules par bbox
    │       ├── modules/route.ts         # métadonnées de tous les modules
    │       ├── modules/[slug]/route.ts  # méta + incidents d'un module
    │       ├── pois/route.ts            # couches contextuelles (+ params réglables)
    │       ├── reports/route.ts         # GET liste · POST création (Zod)
    │       ├── health/route.ts          # état base + ingestion (vérif de déploiement)
    │       └── geo/reverse/route.ts     # commune d'un point (geo.api.gouv.fr)
    ├── core/                  # ← métier pur, agnostique UI et API
    │   │                      #   ⚠️ imports RELATIFS uniquement (pas d'alias @/) :
    │   │                      #   compilé par tsc pour le worker, hors bundler Next
    │   ├── types.ts           # CONTRATS : Incident, Poi, sources, modules, couches, scope
    │   ├── registry.ts        # registre des modules + agrégation fail-soft
    │   ├── cache.ts           # cache mémoire TTL + fetch avec timeout (fail-soft)
    │   ├── snapshot.ts        # instantané PERSISTANT des données nationales (worker ↔ web)
    │   ├── geo.ts             # bbox, haversine, point-dans-polygone, distances
    │   ├── geocode.ts         # reverse-geocode commune (geo.api.gouv.fr)
    │   ├── departements.ts    # contours départementaux simplifiés (couches `fill`)
    │   ├── severity.ts        # échelle Vigilance + helpers
    │   ├── sources/           # 1 fichier = 1 adaptateur
    │   │   ├── firms.ts               # points chauds satellite (auto-réparant, filtre EFFIS)
    │   │   ├── effis-burnt.ts         # périmètres de zones brûlées (+ export pour le filtre)
    │   │   ├── meteofrance-vigilance.ts # incidents + zones de vigilance
    │   │   ├── meteofrance-forets.ts  # danger de feu prévu (CSV)
    │   │   ├── vigicrues.ts           # vigilance crue par tronçon
    │   │   ├── hubeau-water.ts        # qualité eau potable
    │   │   ├── hubeau-hydro.ts        # stations hydrométriques (v2)
    │   │   ├── openmeteo-air.ts       # qualité de l'air
    │   │   ├── emsc-quakes.ts         # séismes
    │   │   ├── rappelconso.ts         # rappels produits (nationaux)
    │   │   ├── overpass.ts            # POIs OSM génériques
    │   │   └── citizen.ts             # signalements SQLite → Incident[]
    │   └── modules/           # 1 fichier = 1 module, enregistré dans registry.ts
    │       ├── fire.ts  flood.ts  water.ts  air.ts  quake.ts  weather.ts  health.ts
    ├── context/
    │   └── LocationContext.tsx # point d'observation PARTAGÉ par toute l'app (voir décisions)
    ├── components/
    │   ├── map/MapView.tsx    # MapLibre : marqueurs + couches heatmap/fill
    │   ├── StatusBeacon.tsx   # signature de la home
    │   ├── IncidentCard.tsx · ModuleGrid.tsx · SeverityBadge.tsx
    │   ├── LocationBar.tsx    # Ma position / Adresse / National + autocomplétion + GPS
    │   ├── RadiusSelector.tsx # rayon d'observation
    │   ├── PendingButton.tsx  # bouton d'action avec loader (usePending)
    │   ├── SiteHeader.tsx · Icon.tsx
    ├── hooks/
    │   ├── useGeolocation.ts
    │   └── usePending.ts      # état « en cours » d'une action async (loaders de boutons)
    └── lib/
        ├── utils.ts           # cn(), timeAgo()
        ├── db.ts              # client Prisma
        ├── url.ts             # lecture/écriture de l'état dans la query string
        └── api-client.ts      # fetch typé côté client
```

(Routes API : `api/geo/search` = recherche d'adresse ; `api/incidents` et `api/pois`
acceptent `bbox` **ou** `lat`+`lng`+`r`.)

## Flux « ai-je un danger près de moi ? »

1. La home demande la **géolocalisation navigateur** (`useGeolocation`) ; fallback centre France.
2. On calcule une **bbox** autour du point (`RadiusSelector`, 10 → 500 km).
3. `GET /api/incidents?bbox=…` → l'API itère le registre, appelle **en parallèle** les sources
   de chaque module (cachées, fail-soft) et renvoie `{ incidents, meta }`.
4. Le **StatusBeacon** prend la gravité max des incidents *en cours et localisés* → couleur
   Vigilance + libellé. La carte les affiche, la liste les détaille.

Les **couches de contexte** sont chargées séparément et à la demande :
`GET /api/pois?module=fire&layers=…&bbox=…[&params]` — jamais au chargement initial.

## Deux exécutions

Le même dépôt produit **deux processus**, qui se rejoignent sur la base SQLite :

```
   cron ──▶ node dist/worker/ingest.js ──écrit──▶ ┌──────────┐
                (scope: "national")                │  SQLite  │
                                                   │ Snapshot │
   Passenger ──▶ node server.js (Next) ──lit──────▶└──────────┘
                (+ sources scope: "local", à la demande)
```

**Pourquoi.** Trois raisons, par ordre d'importance :

1. **Les chantiers v2 l'exigent.** Le crawler de statuts (chronologie) est lent et
   rate-limité : il ne peut pas vivre dans un route handler qui doit répondre en 200 ms. Le
   score d'importance, lui, veut raisonner à l'échelle nationale, pas dans la bbox d'un
   utilisateur. Et les notifications push (v2) ne peuvent structurellement rien déclencher si
   la donnée n'est calculée que quand quelqu'un regarde.
2. **La latence sort du chemin utilisateur.** Mesuré : FIRMS 33 464 ms → 11 ms, couches du
   module feu 45 s → 1 ms.
3. **La charge amont s'effondre** : une requête par source et par TTL, au lieu d'une par
   utilisateur en cache froid.

**Pourquoi un script one-shot et pas un démon.** Sur l'hébergement cible (Passenger sur
mutualisé), un process de fond n'est pas garanti de survivre : Passenger arrête les processus
applicatifs quand le trafic faiblit (comportement documenté du *dynamic scaling*), donc un
`setInterval` meurt en silence — précisément la nuit, quand un feu peut démarrer. Constat
confirmé sur place : o2switch maintient **son propre Redis** en vie par un cron toutes les
10 minutes avec `flock`. Un script qui démarre, travaille et sort est la forme fiable ici, et
reste valable partout ailleurs.

**Le cron ne connaît aucune source.** Une seule ligne, à vie. La cadence de chaque source est
son `ttlSeconds`, déjà présent dans le contrat ; le worker ne rafraîchit que ce qui a expiré.
Ajouter une source ingérable = créer son fichier et déclarer `scope: "national"` — ni le cron,
ni le worker, ni l'API ne changent.

**L'app reste autonome sans worker.** `FA_INGEST=1` est un interrupteur : sans lui, le web
appelle les APIs lui-même comme avant (plus lent, mais complet). C'est ce qui permet de
développer normalement, de déployer avant d'avoir branché le cron, et de revenir en arrière.

## Décisions

- **Agrégation côté serveur** : le client ne parle qu'à `/api/*`. Les clés restent serveur, le
  CORS des sources externes n'impacte pas le navigateur, le cache est mutualisé.
- **Cache mémoire process** (`Map` + TTL, survit au HMR via `globalThis`) pour les données
  **locales**, et comme niveau 1 devant l'instantané. ⚠️ Il survit aussi aux **changements de
  code** : après un refactor de structure de données, redémarrer le serveur (déjà vécu : cache
  empoisonné par l'ancienne forme → `TypeError`).
- **Instantané persistant** (`core/snapshot.ts`, table `Snapshot`) pour les données
  **nationales**. S'utilise exactement comme `cached()` — mêmes clé, TTL, producteur — donc
  **aucun adaptateur n'a été réécrit** : basculer une source revient à changer l'appel de
  cache et à déclarer `scope: "national"`. Le filtrage par bbox continue de tourner à chaque
  requête, la réponse reste donc propre à l'utilisateur.
  ⚠️ Corollaire du point précédent : un instantané **ne s'efface pas au redémarrage**. D'où
  `SCHEMA_VERSION` dans le fichier — à incrémenter dès qu'on change la forme d'une charge utile.
- **SQLite en WAL, deux process.** Le worker écrit pendant que le web lit : sans WAL,
  l'écriture verrouille toute la base et les requêtes web échouent. ⚠️ Les `PRAGMA` se lisent
  avec `$queryRaw` — `journal_mode` et `busy_timeout` renvoient une ligne, et Prisma refuse un
  `execute` qui produit un résultat. Vécu : avec `$executeRaw`, les trois PRAGMA échouaient et
  le WAL n'était jamais posé, en silence. Le worker journalise désormais le mode effectif.
- **Une donnée nationale absente échoue franchement.** En mode délégué, si l'instantané n'a
  jamais été produit, la source lève → le registre pose `ok: false`. Servir `[]` afficherait
  « rien à signaler » alors que l'app est aveugle (principe produit n°3). Un instantané
  seulement *périmé*, lui, est servi tel quel et sa fraîcheur est reportée.
- **Fail-soft au registre, jamais dans l'adaptateur** : une source qui échoue *laisse remonter*
  son erreur ; `runSource`/`collectPois` loggent et posent `ok: false`. Un
  `catch { return [] }` local produirait une réponse vide annoncée comme un succès.
  *Exception assumée* : une source **auxiliaire** peut être catchée par son appelant si son
  absence ne fait que dégrader un raffinement (ex. EFFIS pour le seuil FIRMS) — documenté sur place.
- **`isStale` / `meta.sources[].stale`** : certaines APIs répondent 200 avec un contenu vide
  quand leur alimentation est morte, ce qui est indiscernable d'un « rien à signaler ». Une
  source qui sait dater sa donnée le signale.
- **Sévérité normalisée** : chaque adaptateur mappe sa donnée native vers
  `green|yellow|orange|red`. Un seul langage de gravité dans toute l'app.
- **Deux représentations pour une même donnée** : l'**incident** (l'alerte, qui peut allumer le
  beacon) et la **couche** (le contexte visuel, qui ne le fait jamais). Vigilance = points +
  zones ; FIRMS = foyers + nappe thermique.
- **Le verdict de la home porte sur « maintenant, ici »** : sont exclus du beacon et du
  compteur les incidents `national` (non localisés) et `forecast` (pas encore là), chacun ayant
  son propre bandeau.
- **Couches de carte** : `render: 'pins' | 'heatmap' | 'fill'`, désactivables, éteintes par
  défaut, et **paramétrables** via `FetchContext.params` (query string de `/api/pois`).
- **MapLibre ne connaît pas les tokens CSS** (rendu WebGL) : les couleurs des couches natives
  sont **résolues à l'exécution** depuis les variables CSS (`resolveRgb` dans `MapView`), jamais
  écrites en hex. Une couche `fill` = 1 source pour 2 calques (remplissage + contour) → au
  nettoyage, retirer les **calques avant** les sources.
- **Regroupement géospatial** (FIRMS) : les pixels satellite d'un même feu sont regroupés en
  foyers, avec un rayon de lien **dépendant de la résolution du capteur**, et l'on prend la
  puissance **max** (jamais la somme : VIIRS réplique la valeur du foyer sur chaque pixel).
- **Rapprochement de données décalées** : comparer deux sources géospatiales exige une
  **tolérance** (`pointWithinKmOfPolygon`) — un périmètre de feu de la veille et un point chaud
  du front actif ne se superposent jamais exactement.
- **Point d'observation partagé** (`context/LocationContext.tsx`) : mode (Ma position /
  Adresse / National), point/adresse et rayon vivent dans un Context monté au **layout
  racine** — ils survivent donc à la navigation entre l'accueil et les modules (choisir une
  adresse sur l'un se répercute sur l'autre). Ce qui reste local à une page : les couches
  actives et la fenêtre EFFIS. Le provider gère aussi la géoloc (demandée une fois) et la
  synchro URL globale ; chaque page ne synchronise que ses paramètres locaux (`writeParams`
  fusionne). La **position géoloc réelle n'est jamais écrite dans l'URL** (donnée personnelle) ;
  seule une adresse/coordonnée choisie l'est.

## Extensibilité (checklist)

- **Nouvelle source** → 1 fichier `core/sources/*` implémentant `IncidentSource`/`PoiSource`,
  ajouté au module concerné. Cache et fail-soft sont gratuits. *Sonder l'API en direct d'abord.*
  Si son appel amont ne dépend pas de la zone : passer son travail coûteux par `snapshot()` et
  déclarer `scope: "national"` → elle est ingérée d'office, **sans toucher au cron**.
- **Nouveau module** → 1 fichier `core/modules/*` + entrée dans `registry.ts`. API et UI
  suivent automatiquement.
- **Nouvelle couche** → un `PoiLayer` dans le module (`render` + `source`, `weightProp` ou
  `requiresEnv` si besoin).
- **API mobile** → ces mêmes routes ; ajouter `/api/subscribe` (push) sans toucher au cœur.
