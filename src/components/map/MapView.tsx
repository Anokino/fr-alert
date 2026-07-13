"use client";

import { useEffect, useRef } from "react";
import maplibregl, {
  Map as MlMap,
  Marker,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Incident, LatLng, Poi, Severity } from "@/core/types";

const SEV_VAR: Record<Severity, string> = {
  green: "var(--sev-green)",
  yellow: "var(--sev-yellow)",
  orange: "var(--sev-orange)",
  red: "var(--sev-red)",
};

// Fond de carte sombre, sans clé (Carto basemaps).
const DARK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#0f1521" } },
    { id: "carto", type: "raster", source: "carto" },
  ],
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function incidentMarkerEl(inc: Incident): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `width:18px;height:18px;border-radius:9999px;cursor:pointer;
    background:${SEV_VAR[inc.severity]};
    box-shadow:0 0 0 3px color-mix(in oklch, ${SEV_VAR[inc.severity]} 30%, transparent),0 1px 4px rgba(0,0,0,.5);
    border:1.5px solid rgba(255,255,255,.65);`;
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", inc.title);
  return el;
}

function poiMarkerEl(): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `width:9px;height:9px;border-radius:9999px;
    background:color-mix(in oklch, var(--primary) 70%, white 10%);
    border:1px solid rgba(255,255,255,.6);opacity:.85;`;
  return el;
}

export function MapView({
  center,
  zoom = 10,
  incidents = [],
  pois = [],
  className,
  selectable = false,
  onPick,
}: {
  center: LatLng;
  zoom?: number;
  incidents?: Incident[];
  pois?: Poi[];
  className?: string;
  selectable?: boolean;
  onPick?: (p: LatLng) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const pickMarkerRef = useRef<Marker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Init une seule fois.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: [center.lng, center.lat],
      zoom,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), "top-right");
    mapRef.current = map;

    if (selectable) {
      map.on("click", (e) => {
        const p = { lat: e.lngLat.lat, lng: e.lngLat.lng };
        if (!pickMarkerRef.current) {
          pickMarkerRef.current = new maplibregl.Marker({ color: "#e5484d" })
            .setLngLat([p.lng, p.lat])
            .addTo(map);
        } else {
          pickMarkerRef.current.setLngLat([p.lng, p.lat]);
        }
        onPickRef.current?.(p);
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recentre quand le centre change significativement.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ center: [center.lng, center.lat], duration: 600 });
  }, [center.lat, center.lng]);

  // Met à jour les marqueurs incidents + POIs.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const poi of pois) {
      const marker = new maplibregl.Marker({ element: poiMarkerEl() })
        .setLngLat([poi.lng, poi.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 10, closeButton: false }).setHTML(
            `<strong>${escapeHtml(poi.label)}</strong>`,
          ),
        )
        .addTo(map);
      markersRef.current.push(marker);
    }

    for (const inc of incidents) {
      if (inc.national) continue; // les nationaux ne sont pas géolocalisés
      const popup = new maplibregl.Popup({ offset: 14 }).setHTML(
        `<div style="max-width:220px">
           <strong>${escapeHtml(inc.title)}</strong>
           ${inc.description ? `<p style="margin:.35rem 0 0;font-size:12px;color:var(--muted-foreground)">${escapeHtml(inc.description)}</p>` : ""}
           <p style="margin:.4rem 0 0;font-size:11px;color:var(--muted-foreground)">${escapeHtml(inc.sourceLabel)}</p>
         </div>`,
      );
      const marker = new maplibregl.Marker({ element: incidentMarkerEl(inc) })
        .setLngLat([inc.lng, inc.lat])
        .setPopup(popup)
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [incidents, pois]);

  return <div ref={containerRef} className={className} />;
}
