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
- [x] **Météo-France Vigilance** ✅ vérifié en direct le 2026-07-15 sur un épisode
      caniculaire réel (69 dép. en orange) — sortie recoupée département par département
      contre la donnée brute MF, concordance totale. Alimente `weather` (7 phénomènes) et
      `flood` (pluie-inondation). Le phénomène « crues » est écarté au profit de Vigicrues,
      plus fin. Auth `apikey:`, pas Bearer.
- [x] **Météo des forêts** ✅ vérifié en direct le 2026-07-16 — recoupé département par
      département contre le CSV brut. Rattaché à `weather` (pas `fire` : Météo-France
      précise que « ce n'est pas une carte des incendies »). Émis avec `forecast: true` →
      hors beacon, bandeau « Risques prévus » dédié. ⚠️ CSV ; échéance dérivée de
      `reference_time` en heure de Paris ; saisonnier (3 juin → automne).
      Va dans le module **weather** (c'est une prévision météo), pas fire : fire reste les
      feux réels et directs. Ne doit pas alimenter le verdict « maintenant » de la home.

## Modules
- [x] fire  [x] flood  [x] water  [x] air  [x] quake  [x] weather  [x] health

## Reste à faire / v2+
- [ ] Finaliser le mapping Météo-France Vigilance (avec un token)
- [ ] Câbler les hauteurs d'eau Hub'Eau (`observations_tr`) dans le détail d'une station
- [ ] Notifications push mobile (`/api/subscribe`, service worker)
- [ ] Modération des signalements + votes de confirmation
- [ ] **Module `avalanche` (8e module)** — API Bulletin Avalanche (BRA), déjà souscrite,
      même token. Décidé le 2026-07-15 : **repoussé à la saison** (nov.–mai). Motif : mi-
      juillet aucun bulletin n'est actif, donc invérifiable sur données réelles. La doc du
      portail MF est complète, donc l'implémentation ne sera pas à l'aveugle pour autant.
      Ressources : `/liste-massifs`, `/massif/BRA`. ⚠️ **XML**, seule source non-JSON du
      projet → prévoir un parser. Ce module sera le test grandeur nature du « ajouter un
      module = ajouter un fichier ».
- [ ] EFFIS surfaces brûlées, GDACS alertes globales, Atmo indices détaillés
- [ ] Cache Redis multi-instances ; historique & tendances par zone
- [ ] Polices : self-host des .woff2 pour supprimer la dépendance réseau à gstatic
