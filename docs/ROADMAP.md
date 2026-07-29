# Roadmap & état d'avancement

Dernière mise à jour : **2026-07-29**. Légende : `[x]` fait · `[~]` en cours · `[ ]` à faire.

> Tout ce qui est marqué ✅ a été **vérifié en direct sur données réelles** (appel API réel +
> rendu observé), pas seulement compilé. Les pièges rencontrés sont dans `docs/SOURCES.md`.

---

## En un coup d'œil

| Domaine | État |
|---|---|
| Fondations (cœur modulaire, API, UI, carte) | ✅ complet |
| 7 modules d'incidents | ✅ complets |
| Sources de données live | ✅ **11/11 branchées et vérifiées** |
| Couches de carte (épingles / nappe / zones) | ✅ complet, couches paramétrables |
| Fiabilité (fail-soft, `stale`, auto-réparation) | ✅ complet |
| Loaders de boutons + barre d'adresse & URL | ✅ complet |
| **Split web / worker d'ingestion + prêt à déployer** | ✅ **complet, vérifié en direct** |
| Priorisation / score d'importance | ⬜ chantier v2 |
| Crawler de statuts d'événements | ⬜ chantier v2 |
| Rework du layout du module | ⬜ chantier v2 |
| Notifications push mobile | ⬜ v2 |

---

## 1. Livré

### Fondations
- [x] Scaffold Next.js (App Router) + TypeScript + Tailwind v4 + Prisma/SQLite
- [x] Cœur modulaire : `types` (contrats), `registry`, `cache` TTL, `geo`, `severity`
- [x] Routes API : `incidents`, `modules`, `modules/[slug]`, `pois`, `reports`, `geo/reverse`
- [x] Design system (tokens OKLCH sémantiques) + carte MapLibre sans clé
- [x] Home géolocalisée : beacon signature + carte + liste
- [x] Pages de module + formulaire de signalement citoyen

### Sources de données (détail et pièges : `docs/SOURCES.md`)
- [x] **Open-Meteo** qualité de l'air ✅
- [x] **EMSC** séismes ✅ (gère le 204 No Content)
- [x] **Hub'Eau eau potable** ✅
- [x] **Hub'Eau hydrométrie** ✅ — migré en **v2** (la v1 retirée renvoyait 403 en silence)
- [x] **RappelConso** ✅
- [x] **Overpass/OSM** ✅ (bornes incendie, casernes, mairies)
- [x] **Vigicrues** ✅ keyless — flux `.geojson` (le `.jsonld` documenté est mort)
- [x] **Citizen** (signalements SQLite → incidents) ✅ round-trip testé
- [x] **NASA FIRMS** ✅ réécrit **auto-réparant** : aucun satellite en dur, il demande à
      `data_availability` quels flux sont vivants. Motif : Suomi-NPP, codé en dur, était mort
      et renvoyait des CSV vides = « aucun feu en France », en silence. Regroupement des pixels
      en foyers (lien 1,5 km VIIRS / 3 km si MODIS), FRP **max** jamais somme, seuil 3,5 MW,
      gravité par puissance et non par confiance.
- [x] **Météo-France Vigilance** ✅ recoupé département par département contre la donnée brute
      lors d'un épisode caniculaire réel. Alimente `weather` (7 phénomènes) et `flood`
      (pluie-inondation) ; « crues » écarté au profit de Vigicrues, plus fin.
- [x] **Météo des forêts** ✅ rattaché à `weather` (pas `fire` : Météo-France précise que « ce
      n'est pas une carte des incendies »). Émis en `forecast: true` → hors beacon.
- [x] **EFFIS / Copernicus** ✅ périmètres de zones brûlées, WFS **GeoJSON vectoriel**
      (surtout pas les tuiles WMTS, ni `ies-ows` souvent en panne).

### Modules
- [x] `fire` · `flood` · `water` · `air` · `quake` · `weather` · `health`

### Couches de carte & contexte
- [x] **Trois rendus** : `pins` (épingles cliquables), `heatmap` (nappe de densité),
      `fill` (zones colorées par gravité). Toute couche est **désactivable**, éteinte par défaut.
- [x] **Couches paramétrables** — `FetchContext.params` via la query string de `/api/pois`
      (1er usage : fenêtre temporelle des périmètres EFFIS, 3/7/14/30 j).
- [x] **`requiresEnv` sur les couches** : sans la clé, la couche n'est pas proposée du tout
      (plus d'interrupteur mort).
- [x] **Carte thermique FIRMS** ✅ — alimentée par les détections brutes que le regroupement
      écarte (trop bruitées pour alerter, parfaites pour visualiser). Module incendies seul.
- [x] **Zones de vigilance** ✅ — départements colorés selon leur niveau, comme la carte
      officielle MF. Modules `weather` et `flood`.
- [x] **Périmètres de feux EFFIS** ✅ — fenêtre réglable, gravité par surface brûlée.
- [x] **`RadiusSelector` partagé** home/module (10 → 500 km).

### Fiabilité (leçons devenues des règles — cf. `CONTEXT.md` §8)
- [x] **Fail-soft au registre, jamais dans l'adaptateur** — un `catch { return [] }` local
      annonce un succès vide ; deux pannes réelles ont été masquées ainsi.
- [x] **`meta.sources[].stale`** — un flux qui répond 200 en servant de la donnée morte est
      signalé au lieu de passer pour du calme plat.
- [x] **Filtre contextuel FIRMS × EFFIS** ✅ — dans/près d'un périmètre de feu connu, le seuil
      passe de 3,5 à **1 MW** (plancher). Cas réel capturé : foyer résiduel de 3 MW à
      Fontainebleau, qui aurait été jeté comme « probablement industriel ».
      ⚠️ Tolérance ~2 km indispensable : le périmètre est la zone *déjà brûlée* (veille), le
      hotspot est sur le *front actif* → mesuré, ils sont à 1-4 km, jamais superposés.

---

## 2. Ajouté en cours de route (hors plan initial)

Ces chantiers sont nés des sessions, pas du périmètre v1 — d'où leur présence ici :

- **Priorisation & suggestions contextuelles** (§3) — demandé après constat que le tri par
  distance enterre l'événement majeur que tout le monde vient chercher.
- **Couches enrichies** (nappe, zones, paramétrables) — inspiré de l'app Fireguard.
- **Périmètres EFFIS + filtre hotspots** — même origine ; le filtre est le premier cas concret
  de « priorisation déterministe contextuelle ».
- **Crawler de statuts d'événements** (§4) — suivre l'*évolution* (feu fixé/éteint…), pas
  seulement la détection.
- **`stale` + adaptateur auto-réparant** — nés du satellite mort découvert en sondant FIRMS.
- **Module `avalanche`** — découvert en explorant le portail Météo-France (3 APIs souscrites).
- **Loaders de boutons + barre d'adresse/URL** (§3) — demandé le 2026-07-16.

---

## 3. Prochaine étape (demandée le 2026-07-16) — **en cours**

À intégrer **à l'app ET à l'API** (la future app mobile consomme les mêmes routes).

### Fait
- [x] **API point+rayon** ✅ — `bboxFromParams` (`src/core/geo.ts`) : les routes `/api/incidents`
      et `/api/pois` acceptent `lat`+`lng`(+`r`) en plus de `bbox`. Une URL suffit à décrire la
      zone (app, mobile, debug). Vérifié.
- [x] **Géocodage d'adresse** ✅ — `geocodeAddress` (`src/core/geocode.ts`) via
      `api-adresse.data.gouv.fr` (keyless, autocomplete) + route **`GET /api/geo/search?q=`**.
      Vérifié (adresse/commune → coords).
- [x] **Mécanisme de loader réutilisable** ✅ — `usePending` (hook) + `PendingButton`
      (`src/components/`). Appliqué au bouton Actualiser/Position, au `RadiusSelector`, aux
      **toggles de couche** et au **sélecteur de fenêtre EFFIS** (spinner sur l'option active
      pendant le chargement, via `busy`/`poisLoading`). Vérifié home + module.
- [x] **État dans l'URL** ✅ — `src/lib/url.ts` (`readNumParam`/`readStrParam`/`writeParams`,
      via `history.replaceState`, sans re-render). Home : `lat`+`lng`+`r`. Module : idem +
      `layers`+`days`. Lus au montage, réécrits à chaque changement. Un **point manuel** (URL)
      prime sur la géolocalisation ; le bouton « Ma position » y revient. Vérifié :
      `/?lat=43.30&lng=5.40&r=25` → « Autour de Marseille ». L'API acceptait déjà ces params.

- [x] **Barre d'adresse (UI)** ✅ vérifiée en direct le 2026-07-16 (home + module). Composant
      `LocationBar` : sélecteur **« Ma position / Adresse / National »**, champ de recherche
      avec **autocomplétion** (`/api/geo/search`, label + contexte) et saisie de **coordonnées
      GPS** (« 43.60, 3.88 » → point). Mode `national` = France entière (`FRANCE_BBOX`, rayon
      masqué). Synchro URL complète (`mode`/`lat`/`lng`/`r`), **sans écrire la position réelle**
      en mode géoloc (donnée personnelle).

- [x] **Point d'observation partagé par toute l'app** ✅ vérifié en direct le 2026-07-16
      (bidirectionnel). `context/LocationContext.tsx` monté au layout racine : mode / adresse /
      rayon survivent à la navigation accueil ↔ module. Testé : Nice choisi sur l'accueil →
      hérité par le module feu ; National choisi sur le module → hérité par l'accueil.

> **Chantier « prochaine étape » terminé.** Loaders, synchro URL, barre d'adresse **et point
> partagé** : livrés et vérifiés, app **et** API.

---

## 3 bis. Split web / ingestion + mise en production (2026-07-29) — **terminé**

Décidé après examen de l'hébergement cible : l'app était autonome (chaque visiteur déclenchait
les appels amont). Les chantiers v2 §4 — score **national** et crawler de chronologie — ne
peuvent pas vivre dans un route handler ; le worker est leur foyer naturel. Détail des
motivations : `ARCHITECTURE.md` § « Deux exécutions ».

- [x] **Instantané persistant** ✅ — `core/snapshot.ts` + tables `Snapshot` / `SourceRun`.
      S'utilise comme `cached()` (même clé/TTL/producteur), donc **aucun adaptateur réécrit** :
      zéro régression de comportement (positionnement Vigicrues, commune Météo-France…).
- [x] **`scope: "national" | "local"`** ✅ dans les contrats de source, + `ingestParams` pour
      les couches réglables (les 4 fenêtres EFFIS sont chacune pré-ingérées).
- [x] **Worker d'ingestion** ✅ — `src/worker/ingest.ts` (`npm run ingest [--force] [--only=]`).
      Itère le registre, ne rafraîchit que ce qui a expiré, consigne chaque passage.
      **Aucune source en dur, et le cron n'a jamais besoin d'être retouché** (la cadence est le
      `ttlSeconds` de chaque source).
- [x] **Prêt à déployer** ✅ — `server.js` (entrée Passenger, `listen('passenger')`),
      `tsconfig.worker.json` → `dist/` en CommonJS, scripts `build` / `build:worker` / `ingest`,
      `GET /api/health`, `.gitignore` (WAL), `.env.example` (`FA_INGEST`, chemin absolu).
- [x] **Runbook** ✅ — `docs/DEPLOY.md` : app Node cPanel, `.env`, build, première ingestion,
      bascule `FA_INGEST=1`, ligne de cron `flock`, vérification, mise à jour, dépannage.

**Vérifié en direct le 2026-07-29** (pas seulement compilé) :

| Contrôle | Résultat |
|---|---|
| Ingestion réelle | 13 unités, 12 ok — 1 timeout EFFIS (instabilité documentée, fail-soft) |
| FIRMS (chemin utilisateur) | **33 464 ms → 11 ms** |
| Couches du module feu | **45 s → 1 ms** |
| Journal SQLite | `wal` |
| Mode délégué (`FA_INGEST=1`) | 15 incidents en 255 ms, dont l'essentiel = Open-Meteo (`local`, appel légitime) |
| Donnée non ingérée | `ok: false` — **pas** un faux « rien à signaler » |
| `server.js` + `npm run build` | démarrage et build de production OK |

> **Deux bugs attrapés à l'exécution, invisibles au typecheck** — encore une fois :
> `PRAGMA journal_mode` refusé par `$executeRaw` (le WAL n'était jamais activé, en silence),
> et le worker qui ne lisait pas `.env` (cron n'hérite pas des variables du cPanel).

---

## 4. Chantiers v2

### Priorisation & suggestions contextuelles
- [ ] **Score d'importance déterministe** — ordonne et épingle à partir de signaux explicites :
      gravité, ampleur, population exposée, proximité, fraîcheur. Remplace le tri par distance.
      Cas d'école : les airbags Takata priment sur un lot de camembert contaminé — ça se calcule.
- [ ] **Épinglage automatique** des alertes exceptionnelles.
- [ ] **Suggestions contextuelles par module** (ex. vigilance orages → proposer les impacts de
      foudre). Règles explicites par module.
- [ ] **Traitement des signalements citoyens** (dédup, recoupement avec l'officiel).

> **Déterministe d'abord.** Un score explicite est testable, instantané, gratuit et
> **auditable**. Dans une app de sécurité civile, reléguer une alerte doit pouvoir s'expliquer ;
> « le modèle en a décidé ainsi » n'est pas une réponse acceptable. Le LLM est réservé à ce que
> l'algo ne sait pas faire : comprendre du **texte libre** (signalements, libellés RappelConso).

### Veille & statuts d'événements (crawler)
- [ ] **Timeline de statuts** rattachée à un incident (statut + horodatage + source) : feu en
      cours / fixé / éteint, séisme avec dégâts, consignes de confinement…
- [ ] Crawler périodique (préfectures, presse locale, pompiers, communiqués). L'extraction
      depuis du texte libre est le terrain légitime d'un LLM ; le statut affiché reste **sourcé
      et daté**.

> **L'infrastructure est là** (§3 bis) : le worker tourne déjà par cron et sait écrire en base.
> Un crawler = une nouvelle unité d'ingestion à côté des sources, et une table de statuts.
> Reste à faire, dans l'ordre : **sonder** les sources candidates en direct (préfectures,
> presse) avant d'écrire la moindre ligne — c'est la méthode du projet, et aucune de ces
> sources n'a encore été vérifiée.

### Interface
- [ ] **Rework complet du layout du module** — acté : rayon + couches + fenêtre + barre
      d'adresse s'empilent, ça deviendra chargé. Provisoire toléré d'ici là.

---

## 5. Backlog

- [ ] **Module `avalanche` (8e)** — API BRA déjà souscrite (même token MF). **Repoussé à la
      saison** (nov.–mai) : en été aucun bulletin n'est actif, donc invérifiable. ⚠️ **XML**,
      seule source non-JSON → prévoir un parser. Sera le test grandeur nature du « ajouter un
      module = ajouter un fichier ».
- [ ] Hauteurs d'eau Hub'Eau (`observations_tr`) dans le détail d'une station
- [ ] Notifications push mobile (`/api/subscribe`, service worker)
- [ ] Modération des signalements + votes de confirmation
- [ ] GDACS (alertes globales), Atmo (indices détaillés)
- [ ] Charger nappe et zones à l'échelle nationale plutôt que par bbox (à zoom large, changer
      de rayon refait un aller-retour réseau pour la même donnée)
- [ ] **Self-host** du GeoJSON des contours départementaux (555 Ko, statique) et des polices
      `.woff2` — supprimer les dépendances réseau à `raw.githubusercontent.com` et gstatic
- [ ] Cache Redis multi-instances ; historique & tendances par zone
