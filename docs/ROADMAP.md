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

- [x] **`poiLayers` généralisé en couches de module** ✅ — `render: 'pins' | 'heatmap' |
      'fill'` + `weightProp`, et `requiresEnv` sur `PoiSource` (une couche dont la clé manque
      n'est plus proposée du tout, au lieu d'offrir un interrupteur mort). Un `Poi` peut
      porter une `geometry` + `severity` (couches `fill`).
- [x] **Carte thermique FIRMS** ✅ vérifiée en direct le 2026-07-16 — couche `heatmap`
      MapLibre native (aucune dépendance ajoutée) alimentée par les **détections brutes**
      que le regroupement écarte (420 points/24 h pour la France, contre 42 foyers). Trop
      bruitées pour alerter, parfaites pour visualiser. **Module incendies uniquement** —
      la carte de la home reste inchangée.
- [x] **Zones de vigilance** ✅ vérifiées en direct le 2026-07-16 (épisode caniculaire, ~90
      départements colorés) — couche `fill` MapLibre native colorant les départements selon
      leur niveau de vigilance, comme la carte officielle Météo-France. Dans les modules
      `weather` et `flood` (contexte visuel, désactivable, éteinte par défaut). Contours
      départementaux simplifiés (france-geojson, cache 24 h), joints par code aux niveaux
      Vigilance ; seuls les départements concernés **et visibles** sont envoyés au client.
      Couleur du département = max des phénomènes **du module** (cohérent avec les incidents).
- [x] **Sélecteur de rayon partagé** (`RadiusSelector`) — la page module était figée à 30 km,
      ce qui rendait la nappe invisible pour la plupart des utilisateurs.
- [ ] **Périmètres de feux EFFIS** (module incendies) + **filtre hotspots contextuels** —
      voir la section EFFIS ci-dessous. **Bloqué** : serveur EFFIS en panne au 2026-07-16.
- [ ] Décliner l'idée aux autres modules (contexte utile, désactivable, grand public).
- [ ] Envisager de charger nappe et zones à l'échelle nationale plutôt que sur la bbox : à
      zoom large, changer de rayon refait un aller-retour réseau pour la même donnée.
- [ ] **Self-host du GeoJSON des contours départementaux** (555 KB, statique) pour supprimer
      la dépendance à `raw.githubusercontent.com` — même raison que les polices (voir plus bas).

## Périmètres de feux EFFIS + filtre hotspots contextuels (2026-07-16)

Idée de l'utilisateur, inspirée de Fireguard : afficher les **périmètres de zones brûlées
EFFIS** (Copernicus) dans le module incendies, ET s'en servir comme **validateur contextuel**
pour les hotspots FIRMS.

- [x] **Couche périmètres EFFIS** ✅ vérifiée en direct le 2026-07-16 (Fontainebleau 456 ha,
      Corse). Source vectorielle WFS GeoJSON sur `maps.effis` (pas les tuiles WMTS ; détail et
      pièges dans `docs/SOURCES.md`). `render: "fill"`, module incendies uniquement, gravité
      par surface brûlée. **Fenêtre temporelle réglable** (3 j par défaut, sélecteur 3/7/14/30
      dans l'UI du module) via le nouveau `FetchContext.params` (couches paramétrables).
- [x] **Filtre contextuel des hotspots** ✅ vérifié en direct le 2026-07-16. Dans/près d'un
      périmètre EFFIS, le seuil FIRMS passe de 3,5 MW à **1 MW** (plancher voulu par
      l'utilisateur). Câblé dans l'adaptateur FIRMS, fail-soft sur EFFIS (s'il ne répond pas,
      seuil normal partout). **Cas réel capturé** : un foyer résiduel de **3 MW à Fontainebleau**
      (dans le périmètre du feu de 456 ha) est désormais émis alors qu'il aurait été jeté comme
      « probablement industriel ».
      ⚠️ **Tolérance ~2 km indispensable** (`pointWithinKmOfPolygon`, pas un simple
      point-dans-polygone) : le périmètre EFFIS est la zone *déjà brûlée* (cartographiée la
      veille), le hotspot est sur le *front actif* qui a progressé + géoloc satellite ~1 km →
      mesuré, les foyers sont à 1-4 km des périmètres, jamais strictement dedans. Sans buffer,
      le filtre ne capture rien.

> Note : le layout va devenir chargé (rayon + couches + fenêtre EFFIS). L'utilisateur a acté
> un **rework complet du layout du module** plus tard ; on tolère le provisoire d'ici là.

## Veille & statuts d'événements — crawler (chantier v2, décidé le 2026-07-16)

Suivre l'**évolution** d'un événement, pas seulement sa détection. Un crawler interroge
périodiquement des sources d'information (préfectures, presse locale, pompiers, communiqués
officiels…) sur les catastrophes en cours et attache à chaque incident une **chronologie de
statuts** : un feu est-il en cours / fixé / éteint, un séisme a-t-il fait des dégâts, y a-t-il
des consignes de confinement pour un dégagement toxique, etc.

- [ ] Modéliser une **timeline de mises à jour** rattachée à un incident (statut + horodatage
      + source), affichée dans le détail de l'événement.
- [ ] Crawler périodique + sources à cadrer. Le **tri/résumé** des infos rejoint le chantier
      priorisation ; l'extraction depuis du **texte libre** (communiqués, articles) est le
      terrain légitime d'un LLM — le statut affiché, lui, doit rester sourcé et daté.
- [ ] Servira aussi au traitement des signalements citoyens (recoupement avec l'officiel).

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
- [ ] GDACS alertes globales, Atmo indices détaillés (EFFIS a sa section dédiée ci-dessus)
- [ ] Cache Redis multi-instances ; historique & tendances par zone
- [ ] Polices : self-host des .woff2 pour supprimer la dépendance réseau à gstatic
