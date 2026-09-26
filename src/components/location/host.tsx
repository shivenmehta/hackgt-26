"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { api, type FoodPlace, type Pin } from "@/lib/location/client";
import { AddressLookup, Map, PlaceDetails } from "./shared";

const offsets = Array.from({ length: 113 }, (_, i) => {
  const minutes = (i - 56) * 15;
  return `${minutes < 0 ? "-" : "+"}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0")}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;
});
export default function HostEvent() {
  const [pin, setPin] = useState<Pin>({
    latitude: 33.7756,
    longitude: -84.3963,
  });
  const [pinChosen, setPinChosen] = useState(false);
  const [address, setAddress] = useState("");
  const [startOffset, setStartOffset] = useState("-04:00");
  const [endOffset, setEndOffset] = useState("-04:00");
  const [created, setCreated] = useState<{
    event: FoodPlace;
    edit_token: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const submission = useRef<{ id: string; payload: string } | null>(null);
  const [base, setBase] = useState("");
  function choose(value: Pin) {
    setPin(value);
    setPinChosen(true);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError("");
    const fields = new FormData(e.currentTarget);
    if (!pinChosen) {
      setError("Choose and confirm the event map pin before publishing.");
      return;
    }
    const event = {
      host_name: fields.get("host_name"),
      message: fields.get("message"),
      address,
      foods: String(fields.get("foods"))
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      ...pin,
      starts_at: `${fields.get("starts_at")}:00${startOffset}`,
      ends_at: `${fields.get("ends_at")}:00${endOffset}`,
      public_location_confirmed: fields.get("confirmed") === "on",
    };
    if (new Date(event.ends_at) <= new Date(event.starts_at)) {
      setError("End time must be after start time.");
      return;
    }
    if (new Date(event.ends_at).getTime() <= Date.now()) {
      setError("This event has already ended. Choose a future end time.");
      return;
    }
    const payload = JSON.stringify(event);
    if (!submission.current || submission.current.payload !== payload)
      submission.current = { id: crypto.randomUUID(), payload };
    setBusy(true);
    try {
      const data = await api<{ event: FoodPlace; edit_token: string }>(
        "events",
        { event, request_id: submission.current.id },
      );
      setCreated(data);
      setBase(window.location.origin);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string, name: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(`${name} copied.`);
    } catch {
      setCopied("Copy was unavailable. Select and copy the link below.");
    }
  }
  if (created) {
    const publicLink = `${base}/community/events/${encodeURIComponent(created.event.place_id)}`;
    const privateLink = `${publicLink}/manage#token=${encodeURIComponent(created.edit_token)}`;
    return (
      <section className="host-success">
        <span className="location-eyebrow">A place at your table</span>
        <h1>Your event is posted.</h1>
        <p>
          It will appear in nearby searches that match its location and time.
        </p>
        <PlaceDetails place={created.event} />
        <div className="share-box">
          <h2>Share with your neighbors</h2>
          <label>
            Public event link
            <input
              readOnly
              value={publicLink}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <button
            className="location-secondary"
            onClick={() => copy(publicLink, "Public link")}
          >
            Copy public link
          </button>
          <Link href={publicLink}>View event →</Link>
        </div>
        <div className="share-box private-box">
          <h2>Save your private management link</h2>
          <p>
            Anyone with this link can cancel your event. Keep it private.
            Without an account, we cannot recover it if you lose it.
          </p>
          <label>
            Private management link
            <input
              readOnly
              value={privateLink}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <button
            className="location-secondary"
            onClick={() => copy(privateLink, "Private link")}
          >
            Copy private link
          </button>
          <Link href={privateLink} prefetch={false}>
            Manage event →
          </Link>
        </div>
        <p role="status">{copied}</p>
        <Link className="location-primary" href="/community">
          Find food nearby
        </Link>
      </section>
    );
  }
  return (
    <section>
      <Link href="/community">← Back to nearby food</Link>
      <div className="location-hero">
        <div>
          <span className="location-eyebrow">Share something good</span>
          <h1>Make room for a neighbor.</h1>
          <p>Host a free food event. No account needed.</p>
        </div>
      </div>
      <form className="host-form" onSubmit={submit}>
        <div className="host-fields">
          <label>
            Your public display name
            <input
              name="host_name"
              required
              maxLength={100}
              placeholder="Sally"
            />
          </label>
          <label>
            Public message
            <textarea
              name="message"
              required
              maxLength={4000}
              rows={4}
              placeholder="Come by for pasta and smoothies! Here’s what to expect…"
            />
          </label>
          <label>
            Food provided (comma-separated)
            <input
              name="foods"
              required
              maxLength={4000}
              placeholder="Pasta, smoothies"
            />
          </label>
          <AddressLookup
            onChoose={(value) => {
              choose(value);
              setAddress(value.address);
            }}
          />
          <label>
            Public event address
            <input
              required
              maxLength={500}
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setPinChosen(false);
              }}
              placeholder="Street address, city, state, ZIP"
            />
          </label>
          <p className="location-note">
            Look up the address, then confirm the pin. You can also click the
            map or enter coordinates. Your address will be public.
          </p>
          <div className="location-row">
            <label>
              Event latitude
              <input
                type="number"
                min="-90"
                max="90"
                step="any"
                value={pin.latitude}
                onChange={(e) =>
                  choose({ ...pin, latitude: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Event longitude
              <input
                type="number"
                min="-180"
                max="180"
                step="any"
                value={pin.longitude}
                onChange={(e) =>
                  choose({ ...pin, longitude: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <div className="location-row">
            <label>
              Starts (local time at the event)
              <input name="starts_at" type="datetime-local" required />
            </label>
            <label>
              Start timezone offset
              <select
                aria-label="Start timezone offset"
                value={startOffset}
                onChange={(e) => {
                  setStartOffset(e.target.value);
                  setEndOffset(e.target.value);
                }}
              >
                {offsets.map((o) => (
                  <option key={o} value={o}>
                    UTC{o}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="location-row">
            <label>
              Ends (local time at the event)
              <input name="ends_at" type="datetime-local" required />
            </label>
            <label>
              End timezone offset
              <select
                aria-label="End timezone offset"
                value={endOffset}
                onChange={(e) => setEndOffset(e.target.value)}
              >
                {offsets.map((o) => (
                  <option key={o} value={o}>
                    UTC{o}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="location-note">
            Choose the UTC offset for the venue on that date. Atlanta: −04:00
            during daylight time, −05:00 during standard time. For an event
            crossing a clock change, start and end offsets may differ.
          </p>
          <label className="consent">
            <input type="checkbox" name="confirmed" required />I confirm the
            public address, map pin, and event times, and intend to share this
            location publicly.
          </label>
          {error && (
            <p role="alert" className="location-error">
              {error}
            </p>
          )}
          <button className="location-primary" disabled={busy}>
            {busy ? "Publishing…" : "Publish food event"}
          </button>
          <p className="location-note">
            You’ll get a public share link and a private cancellation link. Only
            share the public one.
          </p>
        </div>
        <div className="host-map">
          <Map center={pin} onPin={choose} />
          <p className="location-note">
            {pinChosen
              ? "Pin selected. Confirm that it points to your event."
              : "Click the map or choose an address match to place your event."}
          </p>
        </div>
      </form>
    </section>
  );
}
