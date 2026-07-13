import { makeCitizenSource } from "../sources/citizen";
import { hydroStationPoi } from "../sources/hubeau-hydro";
import { makeMeteoFranceVigilance } from "../sources/meteofrance-vigilance";
import { townhallPoi } from "../sources/overpass";
import type { IncidentModule } from "../types";

export const floodModule: IncidentModule = {
  slug: "flood",
  name: "Inondations",
  tagline: "Crues, vigilance et hauteurs d'eau",
  icon: "waves",
  accent: "var(--m-flood)",
  sources: [makeMeteoFranceVigilance("flood"), makeCitizenSource("flood")],
  poiLayers: [
    {
      id: "hydro-station",
      label: "Stations hydro",
      icon: "activity",
      color: "var(--m-flood)",
      source: hydroStationPoi,
    },
    {
      id: "townhall",
      label: "Mairies",
      icon: "landmark",
      color: "var(--m-flood)",
      source: townhallPoi,
    },
  ],
  contextPanels: [
    {
      id: "conduite",
      title: "En cas de montée des eaux",
      kind: "advice",
      body: "Montez à l'étage, ne descendez pas dans les sous-sols et parkings, coupez le gaz et l'électricité, ne traversez jamais une zone inondée à pied ou en voiture (30 cm suffisent à emporter un véhicule).",
    },
    {
      id: "stations",
      title: "Stations hydrométriques",
      kind: "info",
      body: "Ces stations mesurent en temps réel la hauteur des cours d'eau. Elles alimentent Vigicrues et permettent d'anticiper une crue près de chez vous.",
    },
  ],
};
