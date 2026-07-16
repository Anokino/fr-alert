import { makeCitizenSource } from "../sources/citizen";
import { firmsHeatPoi, firmsSource } from "../sources/firms";
import { fireHydrantPoi, fireStationPoi } from "../sources/overpass";
import type { IncidentModule } from "../types";

export const fireModule: IncidentModule = {
  slug: "fire",
  name: "Incendies",
  tagline: "Feux de forêt et foyers actifs",
  icon: "flame",
  accent: "var(--m-fire)",
  sources: [firmsSource, makeCitizenSource("fire")],
  poiLayers: [
    {
      id: "firms-heat",
      label: "Chaleur détectée",
      icon: "thermometer",
      color: "var(--m-fire)",
      source: firmsHeatPoi,
      render: "heatmap",
      weightProp: "frp",
    },
    {
      id: "fire-hydrant",
      label: "Bornes incendie",
      icon: "droplets",
      color: "var(--m-fire)",
      source: fireHydrantPoi,
    },
    {
      id: "fire-station",
      label: "Casernes",
      icon: "building-2",
      color: "var(--m-fire)",
      source: fireStationPoi,
    },
  ],
  contextPanels: [
    {
      id: "conduite",
      title: "En cas de feu proche",
      kind: "advice",
      body: "Éloignez-vous dos au vent, ne prenez pas la voiture pour fuir un feu de forêt, réfugiez-vous dans un bâtiment en dur. Appelez le 18 ou le 112. Ne surchargez pas les lignes.",
    },
    {
      id: "hydrants",
      title: "À quoi servent les bornes incendie ?",
      kind: "definition",
      body: "Les points d'eau (bornes, poteaux) alimentent les pompiers. Connaître les plus proches aide à comprendre la couverture opérationnelle d'un secteur.",
    },
    {
      id: "chaleur",
      title: "La couche « Chaleur détectée »",
      kind: "definition",
      body: "Les satellites repèrent les sources de chaleur au sol. La nappe montre où ils en ont vu ces dernières 24 heures — sans trier : une usine, une torchère ou un brûlage agricole y apparaissent comme un feu. Les foyers listés ci-contre, eux, sont filtrés. Cette couche sert à voir l'ensemble, pas à identifier un incendie.",
    },
  ],
};
