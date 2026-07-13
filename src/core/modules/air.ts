import { openMeteoAirSource } from "../sources/openmeteo-air";
import type { IncidentModule } from "../types";

export const airModule: IncidentModule = {
  slug: "air",
  name: "Qualité de l'air",
  tagline: "Pollution et indice EAQI",
  icon: "wind",
  accent: "var(--m-air)",
  sources: [openMeteoAirSource],
  poiLayers: [],
  contextPanels: [
    {
      id: "conduite",
      title: "Pic de pollution : les bons réflexes",
      kind: "advice",
      body: "Réduisez les efforts physiques intenses en extérieur, aérez tôt le matin ou tard le soir, et soyez attentif aux personnes sensibles (enfants, personnes âgées, asthmatiques).",
    },
    {
      id: "eaqi",
      title: "L'indice EAQI",
      kind: "definition",
      body: "L'European Air Quality Index synthétise plusieurs polluants (PM2.5, PM10, NO₂, O₃). Plus l'indice est élevé, plus l'air est dégradé. Données CAMS via Open-Meteo.",
    },
  ],
};
