import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formate une date ISO en libellé relatif court FR ("il y a 3 h", "dans 2 j").
 * Gère le futur : les incidents `forecast` portent une échéance à venir.
 */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.round(Math.abs(diff) / 60000);
  if (min < 1) return "à l'instant";
  const label = (v: string) => (diff < 0 ? `dans ${v}` : `il y a ${v}`);
  if (min < 60) return label(`${min} min`);
  const h = Math.round(min / 60);
  if (h < 24) return label(`${h} h`);
  return label(`${Math.round(h / 24)} j`);
}
