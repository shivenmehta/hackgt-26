"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type FoodPlace } from "@/lib/location/client";
import { Map, PlaceDetails } from "./shared";

export default function EventPage({
  id,
  manage = false,
}: {
  id: string;
  manage?: boolean;
}) {
  const [event, setEvent] = useState<FoodPlace>();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!manage) return;
    const frame = requestAnimationFrame(() => {
      const found = new URLSearchParams(window.location.hash.slice(1)).get(
        "token",
      );
      // Fragment never goes to the server or Referer; retain per-tab for reloads.
      const key = `event-management:${id}`;
      if (found) {
        setToken(found);
        try {
          sessionStorage.setItem(key, found);
        } catch {}
        history.replaceState(null, "", window.location.pathname);
      } else {
        try {
          setToken(sessionStorage.getItem(key) ?? "");
        } catch {}
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [id, manage]);
  useEffect(() => {
    let current = true;
    async function refresh() {
      try {
        const data = await api<{ event: FoodPlace }>(
          `events/${encodeURIComponent(id)}`,
        );
        if (current) {
          setEvent(data.event);
          setError("");
        }
      } catch (e) {
        if (current) setError((e as Error).message);
      }
    }
    void refresh();
    const timer = setInterval(refresh, 30000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [id]);
  async function cancel() {
    setBusy(true);
    setError("");
    try {
      await api(`events/${encodeURIComponent(id)}/cancel`, {
        edit_token: token,
      });
      setEvent((e) => (e ? { ...e, status: "cancelled" } : e));
      setConfirm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const status =
    event?.status === "cancelled"
      ? "Canceled"
      : event?.status === "ended"
        ? "Ended"
        : event?.status === "upcoming"
          ? "Upcoming"
          : "Scheduled active";
  return (
    <section className="event-page">
      <Link href="/community">← Find food nearby</Link>
      {error && (
        <p role="alert" className="location-error">
          {error}
        </p>
      )}
      {!event ? (
        <p role="status">
          {error ? "Event details are unavailable." : "Loading event…"}
        </p>
      ) : (
        <>
          <div className="location-hero">
            <div>
              <span className="location-eyebrow">
                {manage ? "Private event management" : "A neighbor is sharing"}
              </span>
              <h1>{event.name}</h1>
              <p className="event-badge" role="status">
                {status}
              </p>
            </div>
          </div>
          <div className="event-layout">
            <div>
              <PlaceDetails place={event} />
              <p className="location-note">
                Host-reported giveaway. Food availability and host identity are
                not verified.
              </p>
              {manage && event.status !== "cancelled" && (
                <div className="share-box private-box">
                  <h2>Manage this event</h2>
                  {!token ? (
                    <p>
                      Open the private management link you received when
                      creating this event. The public event link cannot
                      authorize cancellation.
                    </p>
                  ) : (
                    <>
                      <p>
                        Canceling removes this event from nearby searches. Its
                        public link will show “Canceled.”
                      </p>
                      <label className="consent">
                        <input
                          type="checkbox"
                          checked={confirm}
                          onChange={(e) => setConfirm(e.target.checked)}
                        />
                        Yes, cancel this event.
                      </label>
                      <button
                        className="location-danger"
                        disabled={!confirm || busy}
                        onClick={cancel}
                      >
                        {busy ? "Canceling…" : "Cancel event"}
                      </button>
                    </>
                  )}
                </div>
              )}
              {manage && (
                <Link href={`/community/events/${encodeURIComponent(id)}`}>
                  Open public event page →
                </Link>
              )}
            </div>
            <Map center={event} places={[event]} />
          </div>
        </>
      )}
    </section>
  );
}
