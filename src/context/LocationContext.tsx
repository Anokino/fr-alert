"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { useGeolocation } from "@/hooks/useGeolocation";
import { bboxAround, FRANCE_BBOX, FRANCE_CENTER } from "@/core/geo";
import { readNumParam, readStrParam, writeParams } from "@/lib/url";
import type { LocationMode } from "@/components/LocationBar";
import type { BBox, LatLng } from "@/core/types";

/**
 * Point d'observation **partagé par toute l'application**. Monté une fois dans le layout
 * racine, il survit à la navigation entre l'accueil et les pages de module : choisir une
 * adresse (ou le mode national) sur l'une se répercute partout. Il centralise aussi la
 * géolocalisation (demandée une seule fois) et la synchronisation avec l'URL.
 *
 * Ce qui est global : mode, point/adresse, rayon. Ce qui reste local à une page : les
 * couches actives et la fenêtre EFFIS (spécifiques au module).
 */
interface LocationValue {
  mode: LocationMode;
  point: LatLng | null;
  bbox: BBox | null;
  national: boolean;
  radius: number;
  place?: string;
  status: ReturnType<typeof useGeolocation>["status"];
  atFallback: boolean;
  reloadKey: number;
  setRadius: (km: number) => void;
  onMode: (m: LocationMode) => void;
  onPoint: (p: LatLng, label: string) => void;
  refresh: () => void;
}

const Ctx = createContext<LocationValue | null>(null);

export function useLocation(): LocationValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLocation doit être utilisé sous <LocationProvider>");
  return v;
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { position, status, usingFallback, request } = useGeolocation(true);
  const pathname = usePathname();
  const [mode, setMode] = useState<LocationMode>("geo");
  const [manualPoint, setManualPoint] = useState<LatLng | null>(null); // mode "address"
  const [radius, setRadius] = useState(25);
  const [place, setPlace] = useState<string | undefined>();
  const [reloadKey, setReloadKey] = useState(0);

  const national = mode === "national";
  const atFallback = mode === "geo" && usingFallback;

  const point: LatLng | null = national
    ? FRANCE_CENTER
    : mode === "address"
      ? manualPoint
      : position;

  const bbox = useMemo<BBox | null>(
    () => (national ? FRANCE_BBOX : point ? bboxAround(point, radius) : null),
    [national, point, radius],
  );

  // Au montage : rejouer l'état depuis l'URL (mode / point / rayon).
  useEffect(() => {
    const m = readStrParam("mode");
    const lat = readNumParam("lat");
    const lng = readNumParam("lng");
    const r = readNumParam("r");
    if (m === "national") setMode("national");
    else if (lat !== undefined && lng !== undefined) {
      setManualPoint({ lat, lng });
      setMode("address");
    }
    if (r !== undefined) setRadius(r);
  }, []);

  // Refléter l'état dans l'URL, y compris après une navigation (le `pathname` change mais le
  // provider persiste). En mode géoloc on n'écrit PAS la position réelle (donnée personnelle).
  useEffect(() => {
    const manual = mode === "address" && manualPoint;
    writeParams({
      mode: national ? "national" : null,
      lat: manual ? manualPoint.lat.toFixed(5) : null,
      lng: manual ? manualPoint.lng.toFixed(5) : null,
      r: radius,
    });
  }, [pathname, mode, national, manualPoint, radius]);

  // Libellé : « France entière » / adresse choisie / commune géolocalisée.
  useEffect(() => {
    if (national) {
      setPlace("France entière");
      return;
    }
    if (mode === "address") return; // posé à la sélection
    if (!position || usingFallback) {
      setPlace(usingFallback ? "France (position approximative)" : undefined);
      return;
    }
    fetch(`/api/geo/reverse?lat=${position.lat}&lng=${position.lng}`)
      .then((r) => r.json())
      .then((d) => setPlace(d.commune?.nom))
      .catch(() => {});
  }, [national, mode, position, usingFallback]);

  function onMode(m: LocationMode) {
    setMode(m);
    if (m === "geo") {
      setManualPoint(null);
      request();
    } else if (m === "national") {
      setPlace("France entière");
    }
  }

  function onPoint(p: LatLng, label: string) {
    setManualPoint(p);
    setMode("address");
    setPlace(label);
  }

  const value: LocationValue = {
    mode,
    point,
    bbox,
    national,
    radius,
    place,
    status,
    atFallback,
    reloadKey,
    setRadius,
    onMode,
    onPoint,
    refresh: () => setReloadKey((k) => k + 1),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
