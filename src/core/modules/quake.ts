import { emscQuakesSource } from "../sources/emsc-quakes";
import { makeCitizenSource } from "../sources/citizen";
import type { IncidentModule } from "../types";

export const quakeModule: IncidentModule = {
  slug: "quake",
  name: "Séismes",
  tagline: "Secousses ressenties (30 derniers jours)",
  icon: "activity",
  accent: "var(--m-quake)",
  sources: [emscQuakesSource, makeCitizenSource("quake")],
  poiLayers: [],
  contextPanels: [
    {
      id: "conduite",
      title: "Pendant une secousse",
      kind: "advice",
      body: "À l'intérieur : abritez-vous sous une table solide, éloignez-vous des fenêtres. À l'extérieur : éloignez-vous des bâtiments. Après la secousse, coupez le gaz et évacuez calmement.",
    },
    {
      id: "magnitude",
      title: "Magnitude et ressenti",
      kind: "definition",
      body: "La magnitude mesure l'énergie libérée. En France métropolitaine, la plupart des séismes sont faibles (M < 4) et rarement destructeurs. Données EMSC-CSEM.",
    },
  ],
};
