import { useCallback, useEffect, useRef } from "react";
import type { TripPlan, ItineraryItem } from "@travel/shared";
import { itemKey, KIND_LABEL } from "./ItineraryView";

function loadAMap(key: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.AMap) return resolve(w.AMap);
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${key}`;
    script.onload = () => resolve(w.AMap);
    script.onerror = () => reject(new Error("高德地图加载失败"));
    document.head.appendChild(script);
  });
}

const DAY_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
];

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[c];
  });
}

function buildInfoContent(item: ItineraryItem): string {
  const kind = item.kind ? KIND_LABEL[item.kind] : "";
  let html = `<div class="iw"><div class="iw-title">${escapeHtml(item.title)}</div>`;
  if (kind) html += `<span class="iw-kind">${kind}</span>`;
  if (item.address) html += `<div class="iw-addr">${escapeHtml(item.address)}</div>`;
  if (item.note) html += `<div class="iw-note">${escapeHtml(item.note)}</div>`;
  html += `</div>`;
  return html;
}

interface AmapMapProps {
  itinerary: TripPlan | null;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

interface PoiEntry {
  marker: any;
  position: [number, number];
  item: ItineraryItem;
}

export function AmapMap({ itinerary, selectedKey, onSelect }: AmapMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const amapRef = useRef<any>(null);
  const poiRefs = useRef<Map<string, PoiEntry>>(new Map());
  const infoWindowRef = useRef<any>(null);

  const selectedKeyRef = useRef(selectedKey);
  selectedKeyRef.current = selectedKey;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const focusKey = useCallback((key: string) => {
    const AMap = amapRef.current;
    const map = mapRef.current;
    const entry = poiRefs.current.get(key);
    if (!AMap || !map || !entry) return;
    if (infoWindowRef.current) {
      infoWindowRef.current.close();
      infoWindowRef.current = null;
    }
    const info = new AMap.InfoWindow({
      content: buildInfoContent(entry.item),
      offset: new AMap.Pixel(0, -32),
      anchor: "bottom-center",
    });
    info.open(map, entry.position);
    infoWindowRef.current = info;
    map.setZoomAndCenter(15, entry.position);
  }, []);

  useEffect(() => {
    if (!itinerary || !containerRef.current) return;
    let disposed = false;

    (async () => {
      try {
        const AMap = await loadAMap(import.meta.env.VITE_AMAP_KEY ?? "");
        if (disposed) return;
        amapRef.current = AMap;
        if (!mapRef.current) {
          mapRef.current = new AMap.Map(containerRef.current, { zoom: 12 });
        }
        const map = mapRef.current;
        map.clearMap();
        infoWindowRef.current = null;

        const markers: any[] = [];
        const nextPoiRefs = new Map<string, PoiEntry>();

        itinerary.days.forEach((day, di) => {
          const color = DAY_COLORS[di % DAY_COLORS.length];
          const points: [number, number][] = [];
          day.items.forEach((item, i) => {
            if (!item.location) return;
            const key = itemKey(day.day, i);
            const pos: [number, number] = [item.location.lng, item.location.lat];
            points.push(pos);
            const marker = new AMap.Marker({
              position: pos,
              title: item.title,
              anchor: "bottom-center",
            });
            marker.on("click", () => onSelectRef.current(key));
            markers.push(marker);
            map.add(marker);
            nextPoiRefs.set(key, { marker, position: pos, item });
          });
          if (points.length > 1) {
            const polyline = new AMap.Polyline({
              path: points,
              strokeColor: color,
              strokeWeight: 4,
              strokeOpacity: 0.85,
            });
            map.add(polyline);
          }
        });

        poiRefs.current = nextPoiRefs;

        if (markers.length > 0) {
          map.setFitView(markers, false, [80, 80, 80, 80]);
        }

        if (selectedKeyRef.current) {
          focusKey(selectedKeyRef.current);
        }
      } catch (e) {
        console.error(e);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [itinerary, focusKey]);

  useEffect(() => {
    if (selectedKey) focusKey(selectedKey);
  }, [selectedKey, focusKey]);

  if (!itinerary) return null;
  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}