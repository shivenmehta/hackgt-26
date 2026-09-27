"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  api,
  type FoodPlace,
  type Pin,
  type SearchResult,
} from "@/lib/location/client";
import { Map, PlaceDetails } from "./shared";

import AddressAutocomplete from "./address-autocomplete";

const sourceLabels: Record<string, string> = {
  osm: "OpenStreetMap",
  snap: "USDA SNAP",
  feedam: "Feed America",
  events: "Community events",
};
export default function Community() {
  const [pin, setPin] = useState<Pin>({
    latitude: 33.7756,
    longitude: -84.3963,
  });
  const [pinChosen, setPinChosen] = useState(false);
  const [radius, setRadius] = useState("5000");
  const [sources, setSources] = useState(["osm", "snap", "feedam", "events"]);
  const [when, setWhen] = useState("24");
  const [at, setAt] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<string>();
  const [view, setView] = useState("list");
  const [clock, setClock] = useState(() => Date.now());
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const timer = setInterval(() => {
      setClock(Date.now());
      setRevision((n) => n + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    let current = true;
    api<SearchResult>(`nearby?${query}`, undefined, controller.signal)
      .then((data) => {
        if (current) {
          setResult(data);
          setError("");
        }
      })
      .catch((e) => {
        if (current && e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [query, revision]);
  function choosePin(value: Pin) {
    setPin(value);
    setPinChosen(true);
    setResult(null);
    setQuery("");
    setBusy(false);
    setSelected(undefined);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!pinChosen) {
      setError(
        "Choose your location using an address, your device location, or the map.",
      );
      return;
    }
    if (!sources.length) {
      setError("Select at least one food source.");
      return;
    }
    const params = new URLSearchParams({
      lat: String(pin.latitude),
      lon: String(pin.longitude),
      radius,
      sources: sources.join(","),
      window: when === "custom" ? "24" : when,
    });
    if (when === "custom") {
      if (!at || Number.isNaN(new Date(at).getTime())) {
        setError("Choose a valid search date and time.");
        return;
      }
      params.set("at", new Date(at).toISOString());
    }
    setResult(null);
    setBusy(true);
    setQuery(params.toString());
    setRevision((n) => n + 1);
  }
  function locate() {
    if (!navigator.geolocation) {
      setError(
        "Your browser does not provide location. Enter an address or choose a map pin.",
      );
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        choosePin({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError(
          "Location permission was unavailable. Enter an address or choose a pin on the map.",
        );
      },
      { timeout: 12000 },
    );
  }
  const historical = new URLSearchParams(query).has("at");
  const groups = result
    ? Object.entries(result.ui_categories).map(
        ([key, places]) =>
          [
            key,
            places.filter(
              (p) =>
                historical ||
                !p.ends_at ||
                new Date(p.ends_at).getTime() > clock,
            ),
          ] as const,
      )
    : [];
  const visible = groups.filter(
    ([key]) => category === "all" || key === category,
  );
  const places = visible.flatMap(([, entries]) => entries);
  function select(id: string) {
    setSelected(id);
    setView("list");
    requestAnimationFrame(() =>
      document
        .getElementById(`place-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  }
  function eventStatus(p: FoodPlace) {
    return p.starts_at &&
      (historical
        ? p.availability?.status === "upcoming"
        : new Date(p.starts_at).getTime() > clock)
      ? "Upcoming giveaway"
      : "Scheduled active · food not guaranteed";
  }
  return (
    <section className="location-feature">
      <div className="location-hero">
        <div>
          <span className="location-eyebrow">
            A little closer. A little easier.
          </span>
          <h1>Good food, around you.</h1>
          <p>Find groceries, food support, and a neighbor sharing a meal.</p>
        </div>
        <Link className="location-primary" href="/community/host">
          + Host a food event
        </Link>
      </div>
      <form className="location-search" onSubmit={submit}>
        <AddressAutocomplete
          onChoose={choosePin}
          onEdit={() => {
            setPinChosen(false);
            setResult(null);
            setQuery("");
            setBusy(false);
            setSelected(undefined);
          }}
        />
        <div className="location-toolbar">
          <button
            type="button"
            className="location-secondary"
            onClick={locate}
            disabled={locating}
          >
            {locating ? "Locating…" : "Use my location"}
          </button>
          <span>
            {pinChosen
              ? `Selected pin: ${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`
              : "Choose an address or click the map to set your location."}
          </span>
        </div>
        <details>
          <summary>Enter coordinates manually</summary>
          <div className="location-row">
            <label>
              Latitude
              <input
                type="number"
                min="-90"
                max="90"
                step="any"
                value={pin.latitude}
                onChange={(e) =>
                  choosePin({ ...pin, latitude: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Longitude
              <input
                type="number"
                min="-180"
                max="180"
                step="any"
                value={pin.longitude}
                onChange={(e) =>
                  choosePin({ ...pin, longitude: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <button
            type="button"
            className="location-secondary"
            onClick={() => choosePin(pin)}
          >
            Use these coordinates
          </button>
        </details>
        <div className="location-row">
          <label>
            Search radius
            <select value={radius} onChange={(e) => setRadius(e.target.value)}>
              <option value="1609">1 mile</option>
              <option value="5000">3.1 miles</option>
              <option value="10000">6.2 miles</option>
              <option value="25000">15.5 miles</option>
            </select>
          </label>
          <label>
            Community event times
            <select value={when} onChange={(e) => setWhen(e.target.value)}>
              <option value="24">Next 24 hours</option>
              <option value="0">Happening now</option>
              <option value="custom">Choose date/time</option>
            </select>
          </label>
          {when === "custom" && (
            <label>
              Start of 24-hour window (your device timezone)
              <input
                type="datetime-local"
                required
                value={at}
                onChange={(e) => setAt(e.target.value)}
              />
            </label>
          )}
          <button className="location-primary" disabled={busy}>
            {busy ? "Searching food resources…" : "Search nearby"}
          </button>
        </div>
        <fieldset className="source-options">
          <legend>Include sources</legend>
          {Object.entries(sourceLabels).map(([id, label]) => (
            <label key={id}>
              <input
                type="checkbox"
                checked={sources.includes(id)}
                onChange={(e) =>
                  setSources((s) =>
                    e.target.checked ? [...s, id] : s.filter((v) => v !== id),
                  )
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
        <p className="location-note">
          Event time filters apply to giveaways. Store and pantry opening hours
          may be unknown.
        </p>
      </form>
      {error && (
        <p role="alert" className="location-error">
          {error}
          {result &&
            " Displaying the last successful search; it may be outdated."}
        </p>
      )}
      <div className="location-toolbar">
        <div className="category-tabs" aria-label="Resource categories">
          {[
            ["all", "All resources"],
            ["general_food_resources", "General food"],
            ["snap_and_assistance", "SNAP & assistance"],
          ].map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={category === id}
              onClick={() => setCategory(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mobile-view">
          <button
            type="button"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            List
          </button>
          <button
            type="button"
            aria-pressed={view === "map"}
            onClick={() => setView("map")}
          >
            Map
          </button>
        </div>
      </div>
      <div className={`location-results mobile-${view}`}>
        <div className="location-list">
          <h2 ref={resultsHeading} tabIndex={-1}>
            {result
              ? `${places.length} nearby options`
              : "Your neighborhood, on the map"}
          </h2>
          <p role="status" className="location-note">
            {busy
              ? "Checking selected sources. This can take a minute."
              : !result
                ? "Set your location and search to see food resources."
                : "Sorted by straight-line distance. Check details before visiting."}
          </p>
          {result &&
            Object.values(result.source_status).every((s) => s === "error") && (
              <p className="location-error">
                All selected sources are unavailable. Please retry.
              </p>
            )}
          {result?.source_errors.map((message, i) => (
            <p className="location-error" key={i}>
              {message}
            </p>
          ))}
          {visible.map(([key, entries]) => (
            <section key={key}>
              <h3>
                {key === "general_food_resources"
                  ? "General food resources"
                  : "SNAP & food assistance"}
              </h3>
              {!entries.length && (
                <p>
                  No listings from the available selected sources. Coverage may
                  be incomplete.
                </p>
              )}
              {entries.map((place) => (
                <article
                  id={`place-${place.place_id}`}
                  key={place.place_id}
                  className={`resource-card ${selected === place.place_id ? "selected" : ""}`}
                >
                  <div className="resource-title">
                    <button
                      onClick={() => setSelected(place.place_id)}
                      aria-pressed={selected === place.place_id}
                    >
                      {place.name}
                    </button>
                    <span>{place.distance_miles?.toFixed(1)} mi</span>
                  </div>
                  <div className="resource-badges">
                    {place.service_labels?.map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                  {place.starts_at && (
                    <p className="event-badge">{eventStatus(place)}</p>
                  )}
                  <PlaceDetails place={place} />
                </article>
              ))}
            </section>
          ))}
        </div>
        <div className="location-map-panel">
          <Map
            center={pin}
            places={places}
            selected={selected}
            onSelect={select}
            onPin={choosePin}
          />
          <div className="map-legend">
            <span>🔵 Groceries</span>
            <span>🟢 Assistance / SNAP</span>
            <span>🟤 Community events</span>
          </div>
          <p className="location-note">
            Click the map to choose a new search location. Search again to
            update results.
          </p>
        </div>
      </div>
      {result && (
        <details className="source-details">
          <summary>Sources, freshness & coverage</summary>
          <p>
            OpenStreetMap: {result.source_status.osm ?? "not selected"}
            {result.fetched_at ? ` · fetched ${result.fetched_at}` : ""}
          </p>
          <p>
            USDA SNAP: {result.source_status.snap ?? "not selected"}
            {result.snap_snapshot
              ? ` · snapshot ${result.snap_snapshot.retrieved_on}`
              : ""}
          </p>
          <p>
            Feed America (feedam.org):{" "}
            {result.source_status.feedam ?? "not selected"}
          </p>
          <p>
            Community events: {result.source_status.events ?? "not selected"}
          </p>
          {Object.values(result.feedam_endpoints ?? {}).some(
            (p) => p.possibly_truncated,
          ) && (
            <p>
              Feed America results may be capped; this list is not exhaustive.
            </p>
          )}
          {result.limitations.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
          <a href="https://www.openstreetmap.org/copyright">
            © OpenStreetMap contributors
          </a>
        </details>
      )}
    </section>
  );
}
