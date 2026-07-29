"use client";

import { Loader2 } from "lucide-react";
import { usePending } from "@/hooks/usePending";
import { cn } from "@/lib/utils";

/**
 * Bouton d'action asynchrone : pendant `onClick` (fetch + attente), son `icon` est remplacé
 * par un spinner et le bouton devient non-cliquable. Mécanisme réutilisable pour tous les
 * boutons qui déclenchent une requête (Actualiser, activer une couche…).
 *
 * Pour un bouton dont le chargement est piloté par un état extérieur (un `useEffect` qui
 * fetch après un changement d'état), passer `busy` au lieu de compter sur `onClick`.
 */
export function PendingButton({
  onClick,
  icon,
  busy,
  children,
  className,
  disabled,
  "aria-label": ariaLabel,
}: {
  onClick?: () => unknown | Promise<unknown>;
  icon?: React.ReactNode;
  /** Force l'état chargement depuis l'extérieur (loader piloté par un effet). */
  busy?: boolean;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const { pending, run } = usePending();
  const loading = pending || busy;

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-busy={loading}
      disabled={disabled || loading}
      onClick={onClick ? () => run(onClick) : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 transition disabled:pointer-events-none",
        className,
      )}
    >
      {loading ? (
        <Loader2 size={15} className="animate-spin" aria-hidden />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
