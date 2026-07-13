import type { Incident, IncidentSource } from "../types";

/**
 * Météo-France Vigilance — vent, orages, pluie-inondation, crues, canicule, etc.
 * Nécessite un token du portail API Météo-France (OAuth applicatif).
 *
 * Statut : intégration à finaliser quand un token est fourni (voir docs/SOURCES.md).
 * Sans token, la source est inactive (registry l'ignore via requiresEnv) et renvoie [].
 * On la déclare pour DEUX modules via une factory (weather + flood partagent la vigilance).
 */
export function makeMeteoFranceVigilance(
  moduleSlug: "weather" | "flood",
): IncidentSource {
  return {
    id: `meteofrance-vigilance-${moduleSlug}`,
    label: "Météo-France — Vigilance",
    attribution: "Météo-France",
    ttlSeconds: 30 * 60,
    requiresEnv: "METEOFRANCE_TOKEN",

    async fetch(): Promise<Incident[]> {
      const token = process.env.METEOFRANCE_TOKEN;
      if (!token) return [];
      // TODO: appeler l'API DPVigilance et mapper les phénomènes du module vers Incident[].
      // Laissé fail-soft en attendant un token de test.
      return [];
    },
  };
}
