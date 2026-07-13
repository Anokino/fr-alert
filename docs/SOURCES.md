# Catalogue des sources de données

Statut vérifié le **2026-07-13**. `✅` = testé et fonctionnel, `⚠️` = à fiabiliser,
`🔑` = nécessite une clé (optionnel). Tous les adaptateurs sont *fail-soft*.

| Source | Module | Endpoint | Clé | TTL | Statut |
|--------|--------|----------|-----|-----|--------|
| Open-Meteo Air Quality | air | `https://air-quality-api.open-meteo.com/v1/air-quality` | — | 30 min | ✅ |
| EMSC seismicportal (FDSN) | quake | `https://www.seismicportal.eu/fdsnws/event/1/query?format=json` | — | 2 min | ✅ |
| Hub'Eau — Qualité eau potable | water | `https://hubeau.eaufrance.fr/api/v1/qualite_eau_potable/resultats_dis` | — | 6 h | ✅ |
| RappelConso | health | `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/rappelconso-v2-gtin-espaces/records` | — | 1 h | ✅ |
| Overpass (OSM) POIs | fire, flood | `https://overpass-api.de/api/interpreter` | — | 24 h | ✅ |
| geo.api.gouv.fr (géocodage commune) | water, util | `https://geo.api.gouv.fr/communes` | — | 24 h | ✅ |
| Hub'Eau — Hydrométrie temps réel | flood | `https://hubeau.eaufrance.fr/api/v1/hydrometrie/observations_tr` | — | 15 min | ⚠️ à câbler |
| Vigicrues (webservice officiel) | flood | `https://www.vigicrues.gouv.fr/services/1/InfoVigiCru.jsonld/` | — | 15 min | ⚠️ instable via fetch |
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

### Hub'Eau Hydrométrie ⚠️
- `observations_tr?grandeur_hydro=H&bbox=..` (hauteur d'eau). Sert de signal keyless pour le
  module inondation en l'absence de Vigicrues. Mapping sévérité heuristique (à calibrer).

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
