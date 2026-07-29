"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Suit l'état « en cours » d'une action asynchrone (requête + attente).
 * Base réutilisable des loaders de boutons : `run(action)` passe `pending` à vrai le temps
 * que l'action se termine, puis à faux. Ignore les ré-appels concurrents (double-clic).
 */
export function usePending(): {
  pending: boolean;
  run: (action: () => unknown | Promise<unknown>) => Promise<void>;
} {
  const [pending, setPending] = useState(false);
  const active = useRef(false);

  const run = useCallback(async (action: () => unknown | Promise<unknown>) => {
    if (active.current) return;
    active.current = true;
    setPending(true);
    try {
      await action();
    } finally {
      active.current = false;
      setPending(false);
    }
  }, []);

  return { pending, run };
}
