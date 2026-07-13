import { makeMeteoFranceVigilance } from "../sources/meteofrance-vigilance";
import type { IncidentModule } from "../types";

export const weatherModule: IncidentModule = {
  slug: "weather",
  name: "Vigilance météo",
  tagline: "Tempête, orages, canicule, neige",
  icon: "cloud-lightning",
  accent: "var(--m-weather)",
  sources: [makeMeteoFranceVigilance("weather")],
  poiLayers: [],
  contextPanels: [
    {
      id: "niveaux",
      title: "Les 4 niveaux de vigilance",
      kind: "definition",
      body: "Vert : pas de vigilance. Jaune : soyez attentif. Orange : soyez très vigilant, phénomènes dangereux prévus. Rouge : vigilance absolue, phénomènes exceptionnels.",
    },
    {
      id: "source",
      title: "Activation de la source",
      kind: "info",
      body: "La vigilance météo officielle nécessite une clé Météo-France. Une fois configurée, les alertes de votre département s'affichent ici automatiquement.",
    },
  ],
};
