"use client";

import { useCallback, useEffect, useState } from "react";
import type { LatLng } from "@/core/types";
import { FRANCE_CENTER } from "@/core/geo";

export type GeoStatus = "idle" | "locating" | "granted" | "denied" | "unavailable";

interface GeoState {
  position: LatLng | null;
  status: GeoStatus;
  /** true si on utilise le fallback (centre France) faute de position réelle. */
  usingFallback: boolean;
  request: () => void;
}

/** Géolocalisation navigateur avec fallback centre France. */
export function useGeolocation(auto = true): GeoState {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [usingFallback, setUsingFallback] = useState(false);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      setPosition(FRANCE_CENTER);
      setUsingFallback(true);
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setUsingFallback(false);
        setStatus("granted");
      },
      () => {
        setStatus("denied");
        setPosition(FRANCE_CENTER);
        setUsingFallback(true);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    if (auto) request();
  }, [auto, request]);

  return { position, status, usingFallback, request };
}
