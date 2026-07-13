import { makeCitizenSource } from "../sources/citizen";
import { hubeauWaterSource } from "../sources/hubeau-water";
import type { IncidentModule } from "../types";

export const waterModule: IncidentModule = {
  slug: "water",
  name: "Eau potable",
  tagline: "Conformité de l'eau du robinet",
  icon: "glass-water",
  accent: "var(--m-water)",
  sources: [hubeauWaterSource, makeCitizenSource("water")],
  poiLayers: [],
  contextPanels: [
    {
      id: "conduite",
      title: "Eau non conforme : que faire ?",
      kind: "advice",
      body: "Suivez les consignes de votre ARS et de votre mairie : selon le paramètre en cause, l'eau peut rester utilisable pour l'hygiène mais pas pour la boisson. En cas de doute, utilisez de l'eau embouteillée pour boire et cuisiner.",
    },
    {
      id: "controle",
      title: "D'où vient l'information ?",
      kind: "info",
      body: "Le contrôle sanitaire de l'eau distribuée est réalisé par les Agences régionales de santé (ARS) et publié via Hub'Eau. On affiche le dernier prélèvement de votre commune.",
    },
  ],
};
