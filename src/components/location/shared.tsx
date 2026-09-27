"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { BridgeMark } from "@/components/bridge/food-art";
import {
  api,
  eventTime,
  safeWebsite,
  type FoodPlace,
  type Pin,
} from "@/lib/location/client";
export const Map = dynamic(() => import("./map"), {
  ssr: false,
  loading: () => <div className="food-map map-loading">Loading map…</div>,
});

export function CommunityShell({ children }: { children: ReactNode }) {
  return (
    <div className="bridge">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="Bridge home">
            <BridgeMark />
            bridge<span className="brand-period">.</span>
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/">Weekly planner</Link>
            <Link href="/community">Community</Link>
            <Link href="/mission">Our mission</Link>
          </nav>
        </div>
      </header>
      <main id="main" className="location-page">
        {children}
      </main>
    </div>
  );
}
export function AddressLookup({
  onChoose,
}: {
  onChoose: (pin: Pin & { address: string }) => void;
}) {
  const [address, setAddress] = useState("");
  const [candidates, setCandidates] = useState<(Pin & { address: string })[]>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function lookup() {
    setBusy(true);
    setError("");
    setCandidates([]);
    try {
      const data = await api<{ candidates: (Pin & { address: string })[] }>(
        "geocode",
        { address },
      );
      setCandidates(data.candidates);
      if (!data.candidates.length)
        setError(
          "No address match. Try a full US street address or place a pin on the map.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="address-lookup">
      <label>
        Find a US street address
        <input
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            setCandidates([]);
          }}
          placeholder="736 Peachtree St NE, Atlanta, GA 30308"
        />
      </label>
      <button
        type="button"
        className="location-secondary"
        disabled={busy || !address.trim()}
        onClick={lookup}
      >
        {busy ? "Finding address…" : "Find address"}
      </button>
      {error && (
        <p role="alert" className="location-error">
          {error}
        </p>
      )}
      {candidates.map((candidate, i) => (
        <button
          className="address-candidate"
          type="button"
          key={i}
          onClick={() => {
            onChoose(candidate);
            setCandidates([]);
          }}
        >
          Use {candidate.address}
        </button>
      ))}
    </div>
  );
}
const scheduleSource: Record<string, string> = {
  nearby_food_access: "OpenStreetMap",
  alternative_food_retail: "OpenStreetMap",
  food_assistance: "OpenStreetMap",
  potential_assistance: "OpenStreetMap",
  snap_retailers: "USDA SNAP",
  feedam_resources: "Feed America",
  community_events: "Host",
};
export function PlaceDetails({ place }: { place: FoodPlace }) {
  const website = safeWebsite(place.website);
  const schedules = place.availability?.schedules.filter((s) => s.hours) ?? [];
  return (
    <div className="place-details">
      <p>{place.address || "Address not supplied"}</p>
      {place.foods && (
        <p>
          <strong>Food:</strong> {place.foods.join(", ")}
        </p>
      )}
      {place.message && <p className="event-message">{place.message}</p>}
      {place.starts_at && place.ends_at ? (
        <p className="event-time">
          {eventTime(place.starts_at)} — {eventTime(place.ends_at)}
        </p>
      ) : schedules.length ? (
        <div>
          <strong>Reported hours</strong>
          {schedules.map((s, i) => (
            <p key={i}>
              {scheduleSource[s.source] ?? "Provider"}:{" "}
              {typeof s.hours === "string" ? s.hours : JSON.stringify(s.hours)}
            </p>
          ))}
          <small>
            Confirm with the provider; opening status is unverified.
          </small>
        </div>
      ) : (
        <p>Hours unknown · contact the provider</p>
      )}
      {place.reported_by_urgent_endpoint && (
        <p>Feedam urgent listing · call to confirm availability</p>
      )}
      {!!place.possible_duplicate_ids?.length && (
        <p>Possible duplicate listing; source details differ.</p>
      )}
      <div className="resource-links">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Directions ↗
        </a>
        {website && (
          <a href={website} target="_blank" rel="noopener noreferrer">
            Website ↗
          </a>
        )}
        {place.phone && <span>Phone: {place.phone}</span>}
        {place.place_id.startsWith("community_event:") && (
          <Link
            href={`/community/events/${encodeURIComponent(place.place_id)}`}
          >
            Event details →
          </Link>
        )}
      </div>
    </div>
  );
}
