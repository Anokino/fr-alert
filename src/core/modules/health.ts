import { rappelConsoSource } from "../sources/rappelconso";
import type { IncidentModule } from "../types";

export const healthModule: IncidentModule = {
  slug: "health",
  name: "Sanitaire & rappels",
  tagline: "Rappels de produits à risque",
  icon: "shield-alert",
  accent: "var(--m-health)",
  sources: [rappelConsoSource],
  poiLayers: [],
  contextPanels: [
    {
      id: "conduite",
      title: "Un produit que vous avez est rappelé ?",
      kind: "advice",
      body: "Ne le consommez pas et ne l'utilisez pas. Rapportez-le au point de vente pour remboursement, ou détruisez-le selon les consignes de la fiche de rappel.",
    },
    {
      id: "source",
      title: "RappelConso",
      kind: "info",
      body: "Service public de signalement des produits dangereux (alimentation, jouets, cosmétiques, véhicules…). Les rappels concernent souvent tout le territoire.",
    },
  ],
};
