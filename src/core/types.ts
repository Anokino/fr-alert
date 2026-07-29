// Contrats de domaine — STABLES. Voir CONTEXT.md §5.
// Toute l'app (API + UI) ne connaît QUE ces types ; elle n'a aucune connaissance en dur des
// modules ou des sources concrètes.

/** Échelle de gravité — reprend le langage officiel Vigilance FR. */
export type Severity = "green" | "yellow" | "orange" | "red";

/** [minLng, minLat, maxLng, maxLat] (ordre GeoJSON). */
export type BBox = [number, number, number, number];

export interface LatLng {
  lat: number;
  lng: number;
}

/** Un incident normalisé, quelle que soit sa source. */
export interface Incident {
  /** Identifiant stable, préfixé par la source: "firms:123", "citizen:<uuid>". */
  id: string;
  moduleSlug: string;
  title: string;
  description?: string;
  severity: Severity;
  lat: number;
  lng: number;
  /** ISO 8601. */
  startedAt: string;
  updatedAt?: string;
  sourceId: string;
  sourceLabel: string;
  /** Lien vers la fiche officielle si disponible. */
  url?: string;
  /** Vrai pour les incidents non localisés précisément (ex. rappel national). */
  national?: boolean;
  /**
   * Vrai pour un risque **prévu**, pas en cours (ex. Météo des forêts, à J+1).
   * La home l'exclut du beacon et du compteur « N incidents à proximité » et l'affiche dans
   * son propre bandeau daté : le verdict de la home porte sur *maintenant* et ne doit pas
   * s'allumer pour demain (principes produit n°1 et n°3, cf. §1). `startedAt` porte alors
   * la date d'échéance du risque. Même mécanique que `national`.
   */
  forecast?: boolean;
  /** Données spécifiques au module (affichées dans le détail). */
  props?: Record<string, unknown>;
}

/** Géométrie surfacique (GeoJSON), pour les couches `render: "fill"`. */
export type AreaGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

/**
 * Un élément de couche contextuelle. Ponctuel par défaut (borne, caserne, station).
 * Peut aussi porter une **zone** (`geometry`) colorée par `severity` — même pipeline, un
 * autre rendu (cf. `PoiLayer.render`). `lat`/`lng` reste renseigné (point représentatif de
 * la zone) pour le tri, les popups et le repli si la géométrie manque.
 */
export interface Poi {
  id: string;
  layerId: string;
  label: string;
  lat: number;
  lng: number;
  /** Zone à colorer (couches `fill`). Absente = élément ponctuel. */
  geometry?: AreaGeometry;
  /** Gravité de la zone, pour la couleur du remplissage (couches `fill`). */
  severity?: Severity;
  props?: Record<string, unknown>;
}

export interface FetchContext {
  bbox: BBox;
  center?: LatLng;
  signal?: AbortSignal;
  /**
   * Paramètres de couche réglables par l'utilisateur (ex. fenêtre temporelle des périmètres
   * de feux : `{ days: "3" }`). Transmis depuis la query string de `/api/pois`. Une source
   * qui n'en attend pas les ignore ; toujours prévoir un défaut.
   */
  params?: Record<string, string>;
}

/**
 * Portée d'une source — décide si le **worker d'ingestion** peut la préparer à l'avance.
 *
 * `national` : la donnée amont ne dépend pas de la zone demandée (flux national ou européen
 * qu'on récupère en entier puis qu'on filtre). Le worker l'exerce sur la France et remplit
 * l'instantané ; le web n'appelle donc plus l'API amont. C'est le cas de tout ce qui est lent
 * ou lourd (EFFIS, FIRMS, Vigicrues, contours départementaux).
 *
 * `local` (défaut) : la requête amont dépend intrinsèquement du point ou de la bbox
 * (une mesure d'air à une coordonnée, les POIs OSM d'un rectangle, la commune d'un point).
 * Pré-calculer toute la France à cette granularité est impraticable → reste à la demande.
 *
 * ⚠️ Ne déclarer `national` qu'une source dont le travail coûteux passe par `snapshot()` :
 * c'est l'instantané qui est mutualisé, pas le résultat final (celui-ci reste filtré par
 * bbox à chaque requête, donc toujours juste pour l'utilisateur).
 */
export type SourceScope = "national" | "local";

/** Contrat d'une source d'incidents. fail-soft : peut throw, capté en amont. */
export interface IncidentSource {
  id: string;
  label: string;
  attribution: string;
  ttlSeconds: number;
  /** Nom de la variable d'env requise (clé). Si absente, la source est ignorée. */
  requiresEnv?: string;
  /** Cf. `SourceScope`. Défaut `local` — une source n'est ingérée que si elle le déclare. */
  scope?: SourceScope;
  fetch(ctx: FetchContext): Promise<Incident[]>;
  /**
   * Optionnel : signale que le flux amont est **périmé** alors même que la requête réussit.
   * Certaines APIs répondent 200 avec un contenu vide quand leur alimentation est morte —
   * indiscernable d'un « rien à signaler ». Une source qui sait dater sa donnée l'implémente
   * pour que `meta.sources[].stale` le dise au lieu de laisser croire au calme plat.
   * Vécu : le satellite VIIRS Suomi-NPP a cessé d'alimenter FIRMS le 2026-07-10 en renvoyant
   * des CSV vides.
   */
  isStale?(ctx: FetchContext): Promise<boolean>;
}

/** Contrat d'une source de POIs. */
export interface PoiSource {
  id: string;
  label: string;
  attribution: string;
  ttlSeconds: number;
  /** Nom de la variable d'env requise (clé). Si absente, la couche n'est pas proposée. */
  requiresEnv?: string;
  /** Cf. `SourceScope`. Défaut `local`. */
  scope?: SourceScope;
  /**
   * Jeux de paramètres à pré-ingérer, pour une couche **paramétrable** (`FetchContext.params`).
   * Chaque entrée produit une entrée d'instantané distincte : sans ça, seul le défaut serait
   * chaud et choisir une autre valeur dans l'UI retomberait sur un appel amont lent.
   * Ex. les fenêtres proposées pour les périmètres EFFIS : `[{days:"3"}, {days:"7"}, …]`.
   */
  ingestParams?: Record<string, string>[];
  fetch(ctx: FetchContext): Promise<Poi[]>;
}

/** Comment une couche se dessine sur la carte. */
export type PoiRender = "pins" | "heatmap" | "fill";

export interface PoiLayer {
  id: string;
  label: string;
  /** nom d'icône lucide */
  icon: string;
  /** token de couleur (var CSS) */
  color: string;
  source: PoiSource;
  /**
   * Rendu de la couche. `pins` par défaut : des épingles cliquables, une par POI.
   * `heatmap` : une nappe de densité, pour une donnée trop dense ou trop bruitée pour être
   * lue point par point (ex. les détections satellite brutes de FIRMS). `fill` : des zones
   * colorées par `Poi.severity` (ex. départements en vigilance, périmètres de feux). Ni
   * `heatmap` ni `fill` ne sont cliquables ou libellés — c'est du contexte visuel, pas de
   * l'information ponctuelle.
   */
  render?: PoiRender;
  /**
   * `heatmap` uniquement : clé de `Poi.props` portant l'intensité du point (nombre).
   * Absente → tous les points pèsent pareil (densité pure).
   */
  weightProp?: string;
}

/** Bloc d'information contextuelle affiché dans l'espace d'un module. */
export interface ContextPanel {
  id: string;
  title: string;
  body: string;
  kind?: "advice" | "info" | "definition";
}

/** Contrat d'un module d'incident. Ajouter un module = créer un de ces objets. */
export interface IncidentModule {
  slug: string;
  name: string;
  tagline: string;
  /** nom d'icône lucide */
  icon: string;
  /** token de couleur d'accent (var CSS) */
  accent: string;
  sources: IncidentSource[];
  poiLayers: PoiLayer[];
  contextPanels?: ContextPanel[];
}

/** Métadonnées d'un module sérialisables (envoyées au client, sans les fonctions). */
export interface ModuleMeta {
  slug: string;
  name: string;
  tagline: string;
  icon: string;
  accent: string;
  poiLayers: {
    id: string;
    label: string;
    icon: string;
    color: string;
    render: PoiRender;
    weightProp?: string;
  }[];
  contextPanels: ContextPanel[];
  /** Sources actives (clé présente le cas échéant). */
  activeSources: { id: string; label: string; attribution: string }[];
}

export interface SourceStatus {
  id: string;
  label: string;
  ok: boolean;
  count: number;
  /** La requête a réussi mais le flux amont est périmé (cf. `IncidentSource.isStale`). */
  stale?: boolean;
}

export interface IncidentsResponse {
  incidents: Incident[];
  meta: {
    generatedAt: string;
    sources: SourceStatus[];
  };
}
