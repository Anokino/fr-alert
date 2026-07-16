# Catalogue des sources de données

Statut vérifié le **2026-07-15**. `✅` = testé et fonctionnel, `⚠️` = à fiabiliser,
`🔑` = nécessite une clé (optionnel). Tous les adaptateurs sont *fail-soft*.

| Source | Module | Endpoint | Clé | TTL | Statut |
|--------|--------|----------|-----|-----|--------|
| Open-Meteo Air Quality | air | `https://air-quality-api.open-meteo.com/v1/air-quality` | — | 30 min | ✅ |
| EMSC seismicportal (FDSN) | quake | `https://www.seismicportal.eu/fdsnws/event/1/query?format=json` | — | 2 min | ✅ |
| Hub'Eau — Qualité eau potable | water | `https://hubeau.eaufrance.fr/api/v1/qualite_eau_potable/resultats_dis` | — | 6 h | ✅ |
| RappelConso | health | `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/rappelconso-v2-gtin-espaces/records` | — | 1 h | ✅ |
| Overpass (OSM) POIs | fire, flood | `https://overpass-api.de/api/interpreter` | — | 24 h | ✅ |
| geo.api.gouv.fr (géocodage commune) | water, util | `https://geo.api.gouv.fr/communes` | — | 24 h | ✅ |
| Vigicrues — Vigilance crues | flood | `https://www.vigicrues.gouv.fr/services/1/InfoVigiCru.geojson/` | — | 10 min | ✅ |
| Hub'Eau — Hydrométrie (stations, POI) | flood | `https://hubeau.eaufrance.fr/api/v2/hydrometrie/referentiel/stations` | — | 24 h | ✅ |
| Hub'Eau — Hydrométrie temps réel (hauteurs) | flood | `https://hubeau.eaufrance.fr/api/v2/hydrometrie/observations_tr` | — | 15 min | ⚠️ à câbler |
| NASA FIRMS (feux actifs) | fire | `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/{bbox}/1` | `FIRMS_MAP_KEY` | 15 min | 🔑 |
| Météo-France Vigilance | weather | `https://public-api.meteofrance.fr/public/DPVigilance/v1/...` | `METEOFRANCE_TOKEN` | 30 min | 🔑 |

## Détails d'intégration

### Open-Meteo Air Quality ✅
- Params : `latitude`, `longitude`, `hourly=european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone`.
- Renvoie `hourly.european_aqi[]`. On prend l'heure courante. Mapping AQI→sévérité :
  0–40 vert, 40–60 jaune, 60–80 orange, >80 rouge (échelle EAQI simplifiée).
- Sans clé, illimité raisonnable. 1 point = 1 requête → on interroge le centre de la bbox.

### EMSC seismicportal ✅
- GeoJSON `FeatureCollection`. Props utiles : `mag`, `time`, `flynn_region` (lieu), `depth`.
- Filtrer par bbox via `minlat/maxlat/minlon/maxlon`, `minmag` optionnel, `limit`.
- Sévérité par magnitude : <2.5 vert, 2.5–4 jaune, 4–5 orange, ≥5 rouge.

### Hub'Eau Qualité eau potable ✅
- `resultats_dis?code_commune=…&size=…` ou `?nom_commune=…`. Pas de coordonnées → on géocode
  la commune via geo.api.gouv.fr (`fields=centre`). Champ clé :
  `conclusion_conformite_prelevement` (texte). Non conforme ⇒ orange/rouge.
- On croise avec la commune de l'utilisateur (reverse geocode) plutôt que la bbox brute.

### RappelConso ✅
- Explore API v2.1, `order_by=date_publication desc`, `where` sur `categorie_produit`.
- Champs : `libelle`, `categorie_produit`, `sous_categorie_produit`, `risques_encourus`,
  `motif_rappel`, `date_publication`, `marque_produit`, `zone_geographique_de_vente`.
- `zone_geographique_de_vente` est textuel ("france entière", régions…). Rappels traités
  comme **incidents nationaux** (bandeau + liste), pas comme pins carte sauf zone géocodable.

### Overpass (OSM) ✅
- POST body Overpass QL. Ex. bornes incendie :
  `node["emergency"="fire_hydrant"](bbox);` ; casernes :
  `node["amenity"="fire_station"](bbox);` ; mairies : `node["amenity"="townhall"](bbox);`.
- Réponse `elements[]` avec `lat`/`lon`/`tags`. Timeout court, cache 24 h.

### geo.api.gouv.fr ✅
- `communes?lat=..&lon=..&fields=nom,code,centre,codesPostaux` pour reverse-geocode.
- `communes?code=..&fields=centre` pour centroïde.
- ⚠️ `?geometry=contour&format=geojson` **ne renvoie pas** la géométrie des départements
  (juste les métadonnées) — d'où le recours à `france-geojson` ci-dessous pour les contours.

### Contours départementaux ✅ (keyless) → couches `fill`
- Fichier unique **simplifié** : `raw.githubusercontent.com/gregoiredavid/france-geojson/
  master/departements-version-simplifiee.geojson` (555 KB, 96 départements dont `2A`/`2B`).
- Frontières administratives statiques → chargées une fois, cache 24 h (`core/departements.ts`).
- Propriété `code` = code département, **clé de jointure** directe avec les niveaux Vigilance.
- On ne renvoie au client que les contours des départements **concernés et visibles** (jamais
  les 96), via une bbox pré-calculée par département (`bboxIntersects`).
- ⚠️ Dépendance à `raw.githubusercontent.com` → self-host à terme (cf. `docs/ROADMAP.md`).

### EFFIS / Copernicus 🔴 (périmètres de feux — **en panne au 2026-07-16**)
- WFS `ies-ows.jrc.ec.europa.eu/effis`. Couche cible : **`ms:ercc.ba`** (Burnt Areas =
  périmètres polygonaux, ce que Fireguard affiche) ; hotspots en `ms:ercc.hs_24hrs_point`.
- **Panne serveur** : toutes les couches renvoient `msOracleSpatialLayerOpen(): Cannot create
  OCI Handlers. Connection failure` (WMS compris) ; le serveur alt
  `maps.effis.emergency.copernicus.eu` timeout. Schéma des périmètres **non vérifié** → à
  sonder au retour, ne pas coder à l'aveugle. Détail et usage (filtre hotspots) dans ROADMAP.

### Vigicrues ✅
- **Piège** : `/services/1/InfoVigiCru.jsonld/` répond **404**. La forme qui fonctionne est
  `.geojson` (302 → `/services/InfoVigiCru.geojson`). Ne pas réintroduire `.jsonld`.
- GeoJSON national (~2 Mo, 337 tronçons). Chaque feature = un tronçon de cours d'eau
  (`MultiLineString`, WGS84). Champs utiles :
  - `NivInfViCr` : niveau de vigilance **1 vert · 2 jaune · 3 orange · 4 rouge** → mappe
    directement sur `Severity` (le seul mapping 1:1 du projet, c'est la même échelle).
  - `CdEntCru` : code entité (unique, vérifié 337/337) → id stable `vigicrues:<code>` et
    lien de fiche `https://www.vigicrues.gouv.fr/?CdEntVigiCru=<code>`.
  - `lbentcru` : libellé du tronçon ("Golo aval").
  - `DtHrInfoVigiCru` (racine) : horodatage du bulletin → `startedAt`. **Ne pas utiliser**
    `dhcentcru`/`dhmentcru`, qui datent le référentiel (valeurs 2020), pas la vigilance.
- Le flux étant national et volumineux, l'adaptateur le met en cache **une seule fois** (clé
  non liée à la bbox) et ne conserve **que les tronçons en vigilance** (niveau ≥ 2) ; hors
  épisode de crue, tout est vert et le cache est donc quasi vide.
- Un tronçon est un linéaire : on le retient si l'un de ses points tombe dans la bbox, et on
  place l'incident au point du cours d'eau **le plus proche de l'utilisateur**.
- Le niveau 1 (vert) n'émet pas d'incident (même parti pris que EMSC / Open-Meteo air).

### Hub'Eau Hydrométrie ✅ / ⚠️
- ⚠️ **L'API `hydrometrie` est en v2 ; la v1 est retirée et répond `403`** (pas 404 — un 403
  ici veut dire « version morte », pas « accès refusé »). Vérifié le 2026-07-15.
- ✅ `v2/hydrometrie/referentiel/stations?bbox=..` → couche POI « Stations hydro ». Champs
  identiques à la v1 (`code_station`, `libelle_station`, `latitude_station`, …).
- ⚠️ `v2/hydrometrie/observations_tr?grandeur_hydro=H&code_entite=..` (hauteur d'eau) : pas
  encore câblé. Vigicrues couvre désormais le besoin d'alerte ; les hauteurs serviraient à
  enrichir le détail d'une station. Mapping sévérité à calibrer (pas de seuil universel).
- Les réponses paginées renvoient **`206 Partial Content`** — c'est un succès (`res.ok`).

### NASA FIRMS 🔑
- MAP_KEY gratuite : https://firms.modaps.eosdis.nasa.gov/api/map_key/. Quota : 5000
  transactions / 10 min (`mapserver/mapkey_status/?MAP_KEY=…` pour le vérifier).
- `area/csv/{KEY}/{SOURCE}/{minLng,minLat,maxLng,maxLat}/{jours}` → CSV. Colonnes :
  `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,
  confidence,version,bright_ti5,frp,daynight`.
- ⚠️ **`day_range` plafonne à 5** (le message d'erreur dit `[1..5]`), et `1` = « aujourd'hui »
  au sens calendaire : à 00h10 ça ne couvre que 10 minutes. Utiliser ≥ 2 puis filtrer sur
  l'horodatage, sinon la source est vide toutes les nuits.
- ⚠️ **Ne jamais coder un satellite en dur.** Vérifié le 2026-07-16 :
  `VIIRS_SNPP_NRT` s'arrête au **2026-07-10** et renvoie des **CSV vides** — 0 détection
  même en Afrique centrale (contrôle : NOAA-20 → 72 565 sur la même zone). Un CSV vide est
  une réponse *valide* : la source répondait `ok=true, count=0`, soit « aucun feu en
  France », indéfiniment et sans bruit.
  → Interroger `api/data_availability/csv/{KEY}/ALL` (donne `min_date`/`max_date` par flux),
  **utiliser tous les capteurs vivants** et marquer les autres via `isStale` /
  `meta.sources[].stale`. Quand un satellite revient, il est repris sans toucher au code.
- **FIRMS détecte des anomalies thermiques, pas des incendies.** Sur la France (5 j,
  NOAA-20+21) : 2205 détections, **FRP médiane 3 MW** — usines, torchères, brûlages. Un vrai
  feu, c'est des dizaines à des centaines de MW. Le titre affiché doit rester « foyer
  thermique détecté », jamais « incendie ».
- ⚠️ **Un feu = plusieurs pixels, et VIIRS réplique la FRP du foyer sur chacun.** Vérifié :
  437 groupes de pixels partagent une FRP identique au même instant, écart médian 0,53 km
  (= pixels adjacents à 375 m). **Cumuler serait faux** (4 × 203 MW pour un feu de 203) →
  regrouper spatialement et prendre le **max**. Une FRP identique peut aussi être une
  coïncidence à 1000 km : le regroupement doit être spatial, pas basé sur la FRP.
- ⚠️ **Le rayon de lien dépend de la résolution des capteurs.** MODIS a des pixels d'1 km et
  une géolocalisation grossière ; VIIRS 375 m. Un même feu apparaît décalé de 2-3 km entre
  les deux. Constaté : le feu de Navarre, vu à 952 MW par VIIRS (91 pixels) et à 1093 MW par
  MODIS **2,9 km plus loin** — un lien serré uniforme le comptait deux fois.
  → lien **1,5 km entre pixels VIIRS**, **3 km dès qu'un pixel MODIS est impliqué**.
  Résultat mesuré : 44 → 42 foyers, **0 doublon restant**, et les 8 foyers vus par MODIS seul
  (de vrais feux manqués par VIIRS, passages à d'autres heures) sont conservés.
- ⚠️ **Filtrer par ancienneté APRÈS le regroupement, jamais avant.** Retirer les détections
  anciennes du nuage de points casse les chaînes et fait éclater un grand incendie en
  plusieurs foyers. C'est ce qui coupait le feu de Navarre en deux. Regrouper sur toute la
  fenêtre, puis écarter les groupes sans détection récente (< 24 h).
- **Calibration retenue** (mesurée sur données réelles) : lien 1,5 / 3 km selon capteurs, FRP
  **max** des détections récentes, seuil d'émission **3,5 MW** (choix de l'utilisateur, côté
  prudence : mieux vaut une torchère de trop qu'un départ de feu manqué).
  → **42 foyers sur la France** (24 h, 3 capteurs), dont 2 rouges et 3 oranges — soit ~0 dans
  un rayon de 25 km autour d'un utilisateur la plupart du temps. Seuils de gravité :
  < 30 MW jaune, 30-100 orange, ≥ 100 rouge.
  Repères si le seuil doit bouger (mesuré sur 5 j) : 5 MW → 27 foyers/j · 10 MW → 14/j ·
  30 MW → 3/j · 100 MW → 1,2/j. Étendue p90 d'un foyer = 1,6 km (pas de chaînage aberrant ;
  les rares foyers de ~9 km sont de vrais grands incendies, identiques à 0,75 km de lien).
- Le regroupement est fait sur une **zone nationale fixe**, pas sur la bbox demandée : sinon
  deux utilisateurs verraient des foyers différents pour le même feu et les identifiants ne
  seraient pas stables (ils doivent l'être — futures notifications).
- La gravité doit venir de la **puissance**, pas de la confiance : 89 % des détections sont
  `confidence=n`, donc un mapping basé sur la confiance rend presque tout orange (~180
  incidents orange/jour).
- ✅ Les détections brutes écartées par le regroupement alimentent la **carte thermique** du
  module incendies (`firmsHeatPoi`, couche `render: "heatmap"`, 420 points/24 h sur la
  France contre 42 foyers). Trop bruitées pour alerter, exactement ce qu'il faut pour
  visualiser. Module incendies uniquement, couche désactivable, éteinte par défaut.

### Portail API Météo-France 🔑 (3 APIs, **un seul token**)

Compte souscrit à **trois** APIs gratuites sous l'application `DefaultApplication`,
abonnements valides jusqu'au **15/07/2028**. Les trois partagent la **même** application,
donc **un seul `METEOFRANCE_TOKEN` suffit** — inutile de multiplier les variables d'env.

**Authentification** : en-tête **`apikey: <token>`**. Vérifié en direct — `Authorization:
Bearer <token>` est **refusé** (401 `900901 Invalid Credentials`) avec une API key.

**Type de token** : prendre l'**API key** à longue durée (validité en secondes ; ~63072000 s
= 2 ans, aligné sur la fin d'abonnement), **pas** l'OAuth2 à 1 h. L'OAuth2 imposerait un flux
client-credentials (cache du token, 401 → refresh → retry) dans un chemin fail-soft, pour de
l'open data public en lecture seule. Si une rotation devient souhaitable, l'OAuth2 se
rajoutera derrière la même variable d'env.

Base commune : `https://public-api.meteofrance.fr/public/<API>/v1/…`

| API | id portail / base | Ressource utile | Format | Quota |
|-----|-----------|-----------------|--------|-------|
| Bulletin Vigilance | `DPVigilance` | `/cartevigilance/encours`, `/textesvigilance/encours` | JSON | 60/min |
| Météo des forêts | `DPMeteoForets` | `/carte/encours`, `/carte/departement/encours` | **CSV** | 100/min |
| Bulletin Avalanche | `DPBRA` (à confirmer) | `/liste-massifs`, `/massif/BRA` | **XML** | 100/min |

⚠️ Les ids du portail (`DonneesPubliquesVigilance`) ne sont **pas** les bases d'URL
(`DPVigilance`). Pour Météo des forêts, seul `DPMeteoForets` répond — `DPMeteoDesForets`,
`DPForets` et `DPMeteoForet` renvoient 404.

#### Bulletin Vigilance ✅ → modules `weather` + `flood`
Vérifié en direct le 2026-07-15 (épisode caniculaire : 69 départements en orange). Sortie de
l'app **recoupée département par département contre la donnée brute** — concordance totale.
Descriptif technique officiel (PDF) : `data.gouv.fr/api/1/datasets/r/85a64f7e-8b3f-47be-80f0-b3dd9cdd01d0`.

- `/cartevigilance/encours` : niveau par **département**, jours J et J+1, 9 phénomènes.
  C'est la source de référence de l'échelle de gravité du projet — `color_id` **est** notre
  `Severity`, sans traduction : `1` vert, `2` jaune, `3` orange, `4` rouge.
- `phenomenon_id` (table officielle) : `1` vent · `2` pluie · `3` orages · **`4` crues** ·
  `5` neige/verglas · `6` canicule · `7` grand froid · `8` avalanches · `9` vagues-submersion.
- **Le phénomène `4` (crues) n'est PAS émis** : Vigicrues le couvre déjà au tronçon près,
  alors que la Vigilance est départementale. L'émettre afficherait deux incidents pour un
  seul danger et gonflerait le compteur de la home. `flood` ne prend donc que `2`
  (pluie-inondation = ruissellement/crues rapides, un aléa distinct) ; `weather` prend le
  reste. `8` (avalanches) restera dans `weather` jusqu'au module dédié.
- **Pièges vérifiés en direct** :
  - Pour les crues (`4`), `timelaps_items` est **toujours vide** (documenté, voulu) — lire
    `phenomenon_max_color_id`, jamais la chronologie.
  - `periods` contient **un seul bloc (J) entre 0h et 6h locales** : ne jamais supposer que
    J+1 existe.
  - `domain_ids` mélange 96 départements (2 car., dont `2A`/`2B`), 25 littoraux
    départementaux (`3010`…) et `FRA`. Filtrer sur la longueur pour cibler un département.
  - `/textesvigilance/encours` peut répondre **404 « no matching blob »** : c'est un cas
    **nominal** prévu par le web service, pas une panne. Ce produit peut aussi être
    **désynchronisé** de la carte → comparer `meta/product_datetime` avant de les croiser.
    (Non utilisé aujourd'hui : la carte suffit.)
- Diffusion : au moins 2×/jour (6h et 16h locales), et plus souvent si la situation l'exige.
  TTL 30 min.
- **Deux représentations de la même donnée** (comme foyers vs nappe pour FIRMS) :
  - *Incidents ponctuels* (`makeMeteoFranceVigilance`) — l'alerte, au point de l'utilisateur.
  - *Zones* (`makeVigilanceAreaSource`, couche `fill`) — contexte visuel : colore les
    départements sur la carte du module. Couleur = max des phénomènes **du module** par
    département (jointure code ↔ contour). Ne remonte pas d'incident, n'allume pas le beacon.

#### Météo des forêts ✅ → module `weather` (**pas** `fire`)
Vérifié en direct le 2026-07-16 ; sortie **recoupée département par département** contre le
CSV brut (Aude/Gard/Var/Nord élevé, Ain/Paris modéré) — concordance totale.
Fiche produit officielle (PDF) : `data.gouv.fr/api/1/datasets/r/7ce90994-113c-4fb2-831a-14c79adba96e`.

- ⚠️ **CSV**, pas JSON (`text/csv`) — le catalogue ne le précise pas. Colonnes :
  `reference_time;dep_code;niveau_j1;niveau_j2;dep_nom`, 96 lignes (dont `2A`/`2B`).
  Utiliser `fetchText` (comme FIRMS), pas `fetchJson`.
- Échelle officielle à 4 niveaux : `1` faible · `2` modéré · `3` élevé · `4` très élevé
  (vert/jaune/orange/rouge) → même mapping que la Vigilance.
- **Rattaché à `weather`, pas à `fire`** : la fiche produit le dit noir sur blanc — « la
  Météo des forêts **n'est pas une carte des incendies en cours ou à venir** ». C'est un
  indicateur de prévention météo ; `fire` reste dédié aux feux **réels et en direct**
  (FIRMS, signalements). Les incidents portent donc `forecast: true` et n'allument jamais le
  beacon (cf. CONTEXT.md §5.1).
- ⚠️ **« J+1 » est relatif à la date de DIFFUSION, pas à maintenant.** Le produit est publié
  chaque jour vers **17h heures locales** pour le lendemain et le surlendemain. De minuit à
  17h, le dernier produit disponible est celui de la veille : son `niveau_j1` désigne alors
  **aujourd'hui**. Calculer l'échéance depuis `Date.now()` affiche « demain » à tort les
  deux tiers de la journée → dériver l'échéance de `reference_time`.
- ⚠️ **Faire ce calcul en `Europe/Paris`**, pas en UTC : les jours du produit sont des jours
  français. En UTC, entre minuit et 2h du matin on est encore la veille → même bug d'un jour.
- ⚠️ **Produit saisonnier** : diffusé seulement **du 3 juin à l'automne**. Hors saison le
  flux peut être absent ou périmé — un `reference_time` de plus de 48 h est ignoré (cas
  nominal, pas une panne).
- Émis à partir du niveau `2` (modéré), comme toutes les sources du projet (seul le vert est
  écarté). En plein été la majorité des départements sont à `2` : si le bandeau « Risques
  prévus » devient bruyant, monter le seuil à `3` (élevé) est un changement d'une ligne.

#### Bulletin Avalanche → futur module `avalanche`
- Reporté à la saison (nov.–mai) : aucun bulletin actif en été, donc invérifiable. Voir
  `docs/ROADMAP.md`. Seule source **XML** du projet → nécessitera un parser.

## Ajouter une source
Voir `CONTEXT.md` §5.2 pour le contrat `IncidentSource` / `PoiSource`.
