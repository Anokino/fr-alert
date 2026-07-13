import type { Severity } from "./types";

/** Ordre croissant de gravité. */
export const SEVERITY_ORDER: Severity[] = ["green", "yellow", "orange", "red"];

export function severityRank(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s);
}

/** Gravité maximale d'une liste (green si vide). */
export function maxSeverity(severities: Severity[]): Severity {
  return severities.reduce<Severity>(
    (max, s) => (severityRank(s) > severityRank(max) ? s : max),
    "green",
  );
}

/** Libellé FR officiel de chaque niveau. */
export const SEVERITY_LABEL: Record<Severity, string> = {
  green: "Pas de vigilance particulière",
  yellow: "Soyez attentif",
  orange: "Soyez très vigilant",
  red: "Vigilance absolue",
};

/** Libellé court (badges). */
export const SEVERITY_SHORT: Record<Severity, string> = {
  green: "Vert",
  yellow: "Jaune",
  orange: "Orange",
  red: "Rouge",
};
