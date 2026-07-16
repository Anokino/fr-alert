"use client";

import { useEffect, useRef } from "react";
import maplibregl, {
  Map as MlMap,
  Marker,
  type ExpressionSpecification,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Incident, LatLng, ModuleMeta, Poi, Severity } from "@/core/types";

const SEV_VAR: Record<Severity, string> = {
  green: "var(--sev-green)",
  yellow: "var(--sev-yellow)",
  orange: "var(--sev-orange)",
  red: "var(--sev-red)",
};

type Rgb = [number, number, number];

let colorProbe: CanvasRenderingContext2D | null = null;

/**
 * Résout un token du design system (`var(--sev-red)`) en composantes RGB.
 *
 * Les marqueurs sont du DOM et acceptent les variables CSS ; les couches natives de MapLibre
 * peignent en WebGL et n'en connaissent aucune. Plutôt que de figer des hex dans le code —
 * ce que les conventions interdisent (CONTEXT.md §7) — on lit le token à l'exécution et on
 * laisse le navigateur convertir l'`oklch()` en RGB via un pixel de canvas. Un changement de
 * token (ou de thème) se propage donc aussi à la carte.
 */
function resolveRgb(css: string): Rgb {
  const varName = css.match(/^var\((--[\w-]+)\)$/)?.[1];
  const value = varName
    ? getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
    : css;
  colorProbe ??= document
    .createElement("canvas")
    .getContext("2d", { willReadFrequently: true });
  if (!colorProbe) return [128, 128, 128];
  colorProbe.fillStyle = "#000"; // repli si `value` est invalide (fillStyle serait ignoré)
  colorProbe.fillStyle = value;
  colorProbe.fillRect(0, 0, 1, 1);
  const d = colorProbe.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

function rgba([r, g, b]: Rgb, a: number): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

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
  poiLayers = [],
  className,
  selectable = false,
  onPick,
}: {
  center: LatLng;
  zoom?: number;
  incidents?: Incident[];
  pois?: Poi[];
  /** Décrit comment dessiner chaque couche. Sans entrée, une couche est rendue en épingles. */
  poiLayers?: ModuleMeta["poiLayers"];
  className?: string;
  selectable?: boolean;
  onPick?: (p: LatLng) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const heatIdsRef = useRef<string[]>([]);
  // Une couche `fill` = une source partagée par deux layers (remplissage + contour). D'où le
  // suivi structuré : au nettoyage il faut retirer les DEUX layers avant la source, sinon
  // MapLibre refuse (« source in use »).
  const fillIdsRef = useRef<{ source: string; layers: string[] }[]>([]);
  /**
   * Le style est-il prêt à recevoir des sources/couches ?
   *
   * On ne se fie pas à `isStyleLoaded()` : il repasse à `false` par moments (pendant une
   * animation de zoom, le temps que les tuiles reviennent). Un effet qui tombait dans ce
   * creux se rabattait sur `once("load")` — un événement déjà passé, qui ne se reproduit
   * jamais — et la nappe n'était alors jamais créée.
   */
  const styleReadyRef = useRef(false);
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
    styleReadyRef.current = false;
    map.on("load", () => {
      styleReadyRef.current = true;
    });

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

  // Recadre quand le centre OU le zoom demandé change. `zoom` n'était appliqué qu'à
  // l'init : changer le rayon recentrait la carte sans jamais l'ajuster, et la zone
  // affichée ne correspondait plus au rayon annoncé.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ center: [center.lng, center.lat], zoom, duration: 600 });
  }, [center.lat, center.lng, zoom]);

  // Nappes de densité (couches `render: "heatmap"`).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const heat = poiLayers.filter((l) => l.render === "heatmap");

    const apply = () => {
      for (const id of heatIdsRef.current) {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      }
      heatIdsRef.current = [];

      const yellow = resolveRgb("var(--sev-yellow)");
      const orange = resolveRgb("var(--sev-orange)");
      const red = resolveRgb("var(--sev-red)");

      for (const layer of heat) {
        const points = pois.filter((p) => p.layerId === layer.id);
        if (!points.length) continue;
        const id = `heat-${layer.id}`;

        map.addSource(id, {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: points.map((p) => ({
              type: "Feature" as const,
              geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
              properties: layer.weightProp
                ? { w: Number(p.props?.[layer.weightProp]) || 0 }
                : {},
            })),
          },
        });

        map.addLayer({
          id,
          type: "heatmap",
          source: id,
          paint: {
            // Un point faible pèse peu sans disparaître ; au-delà de 30 MW il pèse plein.
            "heatmap-weight": layer.weightProp
              ? ["interpolate", ["linear"], ["get", "w"], 0, 0.15, 30, 1]
              : 0.5,
            // Rayon et intensité relevés aux zooms larges : à l'échelle nationale les
            // détections sont trop dispersées pour que la densité s'allume, et la nappe
            // restait invisible. Calibré à l'œil sur données réelles, zooms 6 et 10.
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 4, 2.5, 12, 3],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 4, 14, 8, 20, 12, 30],
            // S'efface en zoomant pour laisser lire les foyers et le fond de carte.
            "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.85, 13, 0.45],
            // Même langage de couleur que le reste : jaune → orange → rouge.
            "heatmap-color": [
              "interpolate",
              ["linear"],
              ["heatmap-density"],
              0,
              "rgba(0, 0, 0, 0)",
              0.15,
              rgba(yellow, 0.45),
              0.4,
              rgba(yellow, 0.85),
              0.7,
              rgba(orange, 0.9),
              1,
              rgba(red, 0.95),
            ],
          },
        });
        heatIdsRef.current.push(id);
      }
    };

    // addSource/addLayer exigent un style chargé (cf. `styleReadyRef`).
    if (styleReadyRef.current) {
      apply();
      return;
    }
    map.once("load", apply);
    return () => {
      map.off("load", apply);
    };
  }, [pois, poiLayers]);

  // Zones colorées (couches `render: "fill"` — ex. départements en vigilance).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const fills = poiLayers.filter((l) => l.render === "fill");

    const apply = () => {
      // Tous les layers d'abord, puis les sources (une source reste « en usage » tant qu'un
      // de ses layers existe).
      for (const { layers } of fillIdsRef.current) {
        for (const l of layers) if (map.getLayer(l)) map.removeLayer(l);
      }
      for (const { source } of fillIdsRef.current) {
        if (map.getSource(source)) map.removeSource(source);
      }
      fillIdsRef.current = [];

      // Couleur par gravité, résolue depuis les tokens (pas de hex en dur, cf. resolveRgb).
      const bySev: Record<string, string> = {
        yellow: rgba(resolveRgb("var(--sev-yellow)"), 1),
        orange: rgba(resolveRgb("var(--sev-orange)"), 1),
        red: rgba(resolveRgb("var(--sev-red)"), 1),
      };
      const colorExpr: ExpressionSpecification = [
        "match",
        ["get", "sev"],
        "yellow",
        bySev.yellow,
        "orange",
        bySev.orange,
        "red",
        bySev.red,
        "#888888",
      ];

      for (const layer of fills) {
        const zones = pois.filter((p) => p.layerId === layer.id && p.geometry);
        if (!zones.length) continue;
        const srcId = `fillsrc-${layer.id}`;
        const fillId = `fill-${layer.id}`;
        const lineId = `fillline-${layer.id}`;

        map.addSource(srcId, {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: zones.map((p) => ({
              type: "Feature" as const,
              geometry: p.geometry as GeoJSON.Geometry,
              properties: { sev: p.severity ?? "" },
            })),
          },
        });

        // Remplissage léger : « colorer légèrement », le fond de carte reste lisible.
        map.addLayer({
          id: fillId,
          type: "fill",
          source: srcId,
          paint: { "fill-color": colorExpr, "fill-opacity": 0.22 },
        });
        // Contour net pour délimiter le département sans alourdir le remplissage.
        map.addLayer({
          id: lineId,
          type: "line",
          source: srcId,
          paint: { "line-color": colorExpr, "line-width": 1, "line-opacity": 0.6 },
        });
        fillIdsRef.current.push({ source: srcId, layers: [fillId, lineId] });
      }
    };

    if (styleReadyRef.current) {
      apply();
      return;
    }
    map.once("load", apply);
    return () => {
      map.off("load", apply);
    };
  }, [pois, poiLayers]);

  // Met à jour les marqueurs incidents + POIs.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Les couches non ponctuelles (nappe, zones) sont dessinées par leurs propres effets.
    const nonPinIds = new Set(
      poiLayers
        .filter((l) => l.render === "heatmap" || l.render === "fill")
        .map((l) => l.id),
    );

    for (const poi of pois) {
      if (nonPinIds.has(poi.layerId)) continue; // dessiné en nappe/zone, pas en épingle
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
  }, [incidents, pois, poiLayers]);

  return <div ref={containerRef} className={className} />;
}
