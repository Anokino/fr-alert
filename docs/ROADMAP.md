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
- [x] **NASA FIRMS** ✅ réécrit et vérifié en direct le 2026-07-16 (42 foyers sur la France).
      **Adaptateur auto-réparant** : aucun satellite en dur — il demande à `data_availability`
      quels flux sont à jour et utilise tous les vivants ; si aucun ne l'est, `isStale` le
      signale. Motif : `VIIRS_SNPP_NRT`, que l'ancien code ciblait en dur, est mort le
      2026-07-10 en renvoyant des CSV vides = « aucun feu en France », en silence.
      Regroupement des pixels en foyers (lien 1,5 km VIIRS / 3 km si MODIS), FRP **max** et
      jamais somme, seuil 3,5 MW, gravité par puissance et non par confiance.
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

## Priorisation & suggestions contextuelles (chantier v2, décidé le 2026-07-16)

Objectif : quelqu'un qui arrive sur le site à l'instant T doit trouver **immédiatement** ce
pour quoi il est venu. S'il y a un gros feu en région parisienne, c'est très probablement
la raison de sa visite — l'app doit le mettre en avant, pas le noyer dans une liste triée
par distance.

- [ ] **Score d'importance déterministe** (pas d'IA — voir la note ci-dessous). Ordonne et
      épingle les alertes à partir de signaux explicites : gravité, ampleur (puissance d'un
      feu, nombre de départements concernés, périmètre d'un rappel), population exposée,
      proximité, fraîcheur. Remplace le tri par distance seule de la home.
      Cas d'école : le rappel des airbags Takata doit primer sur la contamination d'un petit
      lot de camembert — ça se calcule (périmètre national × risque vital), sans modèle.
- [ ] **Épinglage automatique** des alertes exceptionnelles au-dessus de la ligne de flottaison.
- [ ] **Suggestions contextuelles par module** : proposer une couche pertinente selon la
      situation et l'intérêt de l'utilisateur. Ex. vigilance orages en cours → proposer les
      impacts de foudre (Météociel / Météo-France / autre). Règles explicites par module.
- [ ] **Traitement des signalements citoyens** (dédup, regroupement, cohérence avec les
      sources officielles) — le seul endroit où un LLM est vraiment pertinent (texte libre).

> **Note d'architecture — déterministe d'abord.** Une fonction de score explicite est
> testable, instantanée, gratuite et **auditable**. Dans une app de sécurité civile, si
> l'app relègue une alerte, on doit pouvoir expliquer pourquoi ; « le modèle en a décidé
> ainsi » n'est pas une réponse acceptable. Réserver le LLM à ce que l'algo ne sait pas
> faire : comprendre du **texte libre** (signalements, libellés RappelConso), pas arbitrer
> l'importance.

## Couches de module & contexte enrichi (chantier v2, décidé le 2026-07-16)

- [ ] **Généraliser `poiLayers` en couches de module** avec un mode de rendu
      (`pins` | `heatmap` | …). Aujourd'hui une couche = des `Poi[]` en épingles ; il faut
      pouvoir porter d'autres représentations. Toutes les couches restent **désactivables**,
      et le grand public reste la cible (pas de jargon, pas de surcharge).
- [ ] **Carte thermique FIRMS** — couche `heatmap` MapLibre (type natif, aucune dépendance)
      alimentée par les **détections brutes** que le regroupement écarte (~2200 sur 5 j pour
      la France, contre 350 foyers). Trop bruitées pour alerter, parfaites pour visualiser.
      ⚠️ **Module incendies uniquement** — ne pas surcharger la carte de la home.
- [ ] Décliner l'idée aux autres modules (contexte utile, désactivable, grand public).

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
