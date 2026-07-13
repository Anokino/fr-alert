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
  /** Données spécifiques au module (affichées dans le détail). */
  props?: Record<string, unknown>;
}

/** Un point d'intérêt contextuel (borne incendie, caserne, station…). */
export interface Poi {
  id: string;
  layerId: string;
  label: string;
  lat: number;
  lng: number;
  props?: Record<string, unknown>;
}

export interface FetchContext {
  bbox: BBox;
  center?: LatLng;
  signal?: AbortSignal;
}

/** Contrat d'une source d'incidents. fail-soft : peut throw, capté en amont. */
export interface IncidentSource {
  id: string;
  label: string;
  attribution: string;
  ttlSeconds: number;
  /** Nom de la variable d'env requise (clé). Si absente, la source est ignorée. */
  requiresEnv?: string;
  fetch(ctx: FetchContext): Promise<Incident[]>;
}

/** Contrat d'une source de POIs. */
export interface PoiSource {
  id: string;
  label: string;
  attribution: string;
  ttlSeconds: number;
  fetch(ctx: FetchContext): Promise<Poi[]>;
}

export interface PoiLayer {
  id: string;
  label: string;
  /** nom d'icône lucide */
  icon: string;
  /** token de couleur (var CSS) */
  color: string;
  source: PoiSource;
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
  poiLayers: { id: string; label: string; icon: string; color: string }[];
  contextPanels: ContextPanel[];
  /** Sources actives (clé présente le cas échéant). */
  activeSources: { id: string; label: string; attribution: string }[];
}

export interface SourceStatus {
  id: string;
  label: string;
  ok: boolean;
  count: number;
}

export interface IncidentsResponse {
  incidents: Incident[];
  meta: {
    generatedAt: string;
    sources: SourceStatus[];
  };
}
