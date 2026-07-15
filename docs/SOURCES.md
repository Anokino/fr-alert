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
- Obtenir une MAP_KEY gratuite : https://firms.modaps.eosdis.nasa.gov/api/map_key/.
- CSV `area/csv/{KEY}/VIIRS_SNPP_NRT/{minLng,minLat,maxLng,maxLat}/1` (1 jour).
- Colonnes : `latitude,longitude,bright_ti4,acq_date,acq_time,confidence,frp`.
- Sévérité par FRP/confidence.

### Météo-France Vigilance 🔑
- Portail API Météo-France (token OAuth applicatif). Couvre vent, orages, pluie-inondation,
  crues, canicule, etc. par département. À brancher quand un token est fourni.

## Ajouter une source
Voir `CONTEXT.md` §5.2 pour le contrat `IncidentSource` / `PoiSource`.
