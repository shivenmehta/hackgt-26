"use client";
import { useEffect, useId, useState } from "react";
import { api, type Pin } from "@/lib/location/client";
type Candidate = Pin & { address: string };

export default function AddressAutocomplete({
  onChoose,
  onEdit,
}: {
  onChoose: (candidate: Candidate) => void;
  onEdit: () => void;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [chosen, setChosen] = useState("");
  const [items, setItems] = useState<Candidate[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (text.trim().length < 3 || text === chosen) return;
    const controller = new AbortController();
    let current = true;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const response = await api<{ candidates: Candidate[] }>(
          "suggest",
          { query: text },
          controller.signal,
        );
        if (current) {
          setItems(response.candidates);
          setMessage(
            response.candidates.length
              ? `${response.candidates.length} suggestions. Choose one to set your location.`
              : "No suggestions. Add a city or ZIP, or use the map or device location.",
          );
        }
      } catch (error) {
        if (current) setMessage((error as Error).message);
      } finally {
        if (current) setBusy(false);
      }
    }, 450);
    return () => {
      current = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, chosen]);
  function choose(candidate: Candidate) {
    setText(candidate.address);
    setChosen(candidate.address);
    setItems([]);
    setOpen(false);
    setBusy(false);
    setActive(-1);
    setMessage("Location selected. You can now search nearby.");
    onChoose(candidate);
  }
  const expanded = open && items.length > 0;
  return (
    <div
      className="address-autocomplete"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id}>Address or place</label>
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={`${id}-list`}
        aria-activedescendant={
          expanded && active >= 0 ? `${id}-option-${active}` : undefined
        }
        aria-describedby={`${id}-help`}
        autoComplete="off"
        maxLength={200}
        placeholder="Start typing an address, street, or city…"
        value={text}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setChosen("");
          setItems([]);
          setActive(-1);
          setOpen(true);
          setMessage("");
          setBusy(false);
          onEdit();
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter" && chosen === text && chosen) return;
          if (e.key === "ArrowDown" && items.length) {
            e.preventDefault();
            setOpen(true);
            setActive((n) => (n + 1) % items.length);
          } else if (e.key === "ArrowUp" && items.length) {
            e.preventDefault();
            setOpen(true);
            setActive((n) => (n <= 0 ? items.length - 1 : n - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (expanded && active >= 0) choose(items[active]);
            else
              setMessage(
                "Choose a suggestion, or use the map or device location.",
              );
          } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            setActive(-1);
          }
        }}
      />
      {expanded && (
        <ul id={`${id}-list`} role="listbox" aria-label="Location suggestions">
          {items.map((item, i) => (
            <li
              key={`${item.address}:${item.latitude}:${item.longitude}`}
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={i === active}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => choose(item)}
            >
              {item.address}
            </li>
          ))}
        </ul>
      )}
      <p id={`${id}-help`} className="location-note" role="status">
        {busy
          ? "Finding suggestions…"
          : message ||
            "Type at least 3 characters, then select a suggestion. No full address required."}
      </p>
      <small>
        Suggestions use{" "}
        <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">
          Photon
        </a>{" "}
        /{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap contributors
        </a>
        . Typed location text is sent to this service.
      </small>
    </div>
  );
}
