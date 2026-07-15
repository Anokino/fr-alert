import { meteoFranceForetsSource } from "../sources/meteofrance-forets";
import { makeMeteoFranceVigilance } from "../sources/meteofrance-vigilance";
import type { IncidentModule } from "../types";

export const weatherModule: IncidentModule = {
  slug: "weather",
  name: "Vigilance météo",
  tagline: "Tempête, orages, canicule, neige",
  icon: "cloud-lightning",
  accent: "var(--m-weather)",
  sources: [makeMeteoFranceVigilance("weather"), meteoFranceForetsSource],
  poiLayers: [],
  contextPanels: [
    {
      id: "niveaux",
      title: "Les 4 niveaux de vigilance",
      kind: "definition",
      body: "Vert : pas de vigilance. Jaune : soyez attentif. Orange : soyez très vigilant, phénomènes dangereux prévus. Rouge : vigilance absolue, phénomènes exceptionnels.",
    },
    {
      id: "phenomenes",
      title: "Ce que couvre la Vigilance",
      kind: "info",
      body: "Météo-France surveille neuf phénomènes : vent violent, pluie-inondation, orages, crues, neige-verglas, canicule, grand froid, avalanches et vagues-submersion. Le niveau affiché ici est celui de votre département pour aujourd'hui. Les crues sont suivies séparément dans l'espace Inondations, au tronçon de cours d'eau près.",
    },
  ],
};
