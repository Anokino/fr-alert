# Roadmap & état d'avancement

## Légende
`[x]` fait · `[~]` en cours · `[ ]` à faire

## Fondations
- [x] Scaffold Next.js + Tailwind v4 + Prisma
- [x] Cœur modulaire (types, registry, cache, geo, severity)
- [x] Routes API (incidents, modules, pois, reports, geo)
- [x] Design system + carte MapLibre
- [x] Home géolocalisée (beacon + carte + liste)
- [x] Pages modules
- [x] Formulaire de signalement

## Sources (voir SOURCES.md)
- [x] Open-Meteo air ✅ vérifiée en direct
- [x] EMSC séismes ✅ (gestion 204 No Content)
- [x] Hub'Eau eau potable ✅
- [x] RappelConso ✅ vérifiée en direct (12 rappels)
- [x] Overpass POIs (bornes incendie, casernes, mairies)
- [x] Hub'Eau hydrométrie stations (couche POI flood) ✅ **migré en v2** le 2026-07-15
      (la v1 était retirée → 403 : la couche ne renvoyait plus rien)
- [x] **Vigicrues** ✅ vérifié en direct le 2026-07-15 — incidents de vigilance crue par
      tronçon, keyless. Flux `.geojson` (le `.jsonld` de la doc est mort). Mapping des
      niveaux testé sur fixture (tout est vert en juillet).
- [x] Citizen (signalements) ✅ round-trip testé
- [x] FIRMS (clé) — adaptateur prêt, s'active avec FIRMS_MAP_KEY
- [~] Météo-France Vigilance (clé) — squelette prêt, mapping DPVigilance à finaliser.
      **Bloqué sur un token** : l'API répond 401 sans clé et data.gouv.fr ne publie que
      l'archive, pas le temps réel. Aucune voie keyless.

## Modules
- [x] fire  [x] flood  [x] water  [x] air  [x] quake  [x] weather  [x] health

## Reste à faire / v2+
- [ ] Finaliser le mapping Météo-France Vigilance (avec un token)
- [ ] Câbler les hauteurs d'eau Hub'Eau (`observations_tr`) dans le détail d'une station
- [ ] Notifications push mobile (`/api/subscribe`, service worker)
- [ ] Modération des signalements + votes de confirmation
- [ ] EFFIS surfaces brûlées, GDACS alertes globales, Atmo indices détaillés
- [ ] Cache Redis multi-instances ; historique & tendances par zone
- [ ] Polices : self-host des .woff2 pour supprimer la dépendance réseau à gstatic
