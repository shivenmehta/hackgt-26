"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Pin, FoodPlace } from "@/lib/location/client";

export default function FoodMap({
  center,
  places = [],
  selected,
  onSelect,
  onPin,
}: {
  center: Pin;
  places?: FoodPlace[];
  selected?: string;
  onSelect?: (id: string) => void;
  onPin?: (pin: Pin) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const callbacks = useRef({ onSelect, onPin });
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    callbacks.current = { onSelect, onPin };
  }, [onSelect, onPin]);
  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, { scrollWheelZoom: false }).setView(
      [33.7756, -84.3963],
      13,
    );
    map.current = instance;
    L.tileLayer(
      process.env.NEXT_PUBLIC_MAP_TILE_URL ||
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      },
    )
      .on("tileerror", () => setTileError(true))
      .addTo(instance);
    layer.current = L.layerGroup().addTo(instance);
    instance.on("click", (event: L.LeafletMouseEvent) =>
      callbacks.current.onPin?.({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      }),
    );
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(element.current);
    return () => {
      resize.disconnect();
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    map.current?.setView([center.latitude, center.longitude], 13);
  }, [center.latitude, center.longitude]);
  useEffect(() => {
    const markers = layer.current;
    if (!markers) return;
    markers.clearLayers();
    L.circleMarker([center.latitude, center.longitude], {
      radius: 7,
      color: "#173b67",
      fillColor: "white",
      fillOpacity: 1,
      weight: 3,
    })
      .bindTooltip("Search / event location")
      .addTo(markers);
    for (const place of places) {
      const event = place.place_id.startsWith("community_event:");
      const color = event
        ? "#955321"
        : place.ui_category === "snap_and_assistance"
          ? "#237547"
          : "#173b67";
      const label = document.createElement("span");
      label.textContent = place.name;
      const marker = L.marker([place.latitude, place.longitude], {
        title: place.name,
        alt: place.name,
        keyboard: true,
        icon: L.divIcon({
          className: "food-map-marker",
          html: `<span style="background:${color};outline:${selected === place.place_id ? "4px solid #f4ce62" : "none"}">${event ? "♡" : "●"}</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      })
        .bindTooltip(label)
        .on("click", () => callbacks.current.onSelect?.(place.place_id))
        .addTo(markers);
      if (selected === place.place_id) marker.openTooltip();
    }
  }, [places, selected, center]);
  useEffect(() => {
    if (!selected && places.length) {
      const points: L.LatLngTuple[] = [
        [center.latitude, center.longitude],
        ...places.map((p) => [p.latitude, p.longitude] as L.LatLngTuple),
      ];
      map.current?.fitBounds(L.latLngBounds(points), {
        padding: [35, 35],
        maxZoom: 15,
      });
    }
    const match = places.find((p) => p.place_id === selected);
    if (match) map.current?.panTo([match.latitude, match.longitude]);
  }, [selected, places, center]);
  return (
    <div className="food-map-wrap">
      <div
        ref={element}
        className="food-map"
        role="region"
        aria-label="Food resource map"
      />
      {tileError && (
        <p className="map-notice" role="status">
          Map tiles could not load. The results list and coordinate fields still
          work.
        </p>
      )}
    </div>
  );
}
