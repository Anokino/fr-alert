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
