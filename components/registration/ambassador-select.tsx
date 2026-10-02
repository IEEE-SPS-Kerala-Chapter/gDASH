"use client";

import { useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  NO_AMBASSADOR,
  NO_AMBASSADOR_LABEL,
  ambassadorNumbers,
  formatAmbassadorId,
  parseAmbassadorInput,
} from "@/lib/ambassador";
import { TextInput } from "./ui";

type Option = { value: string; label: string };

function labelFor(value: string): string {
  if (value === NO_AMBASSADOR) return NO_AMBASSADOR_LABEL;
  const n = Number(value);
  return value !== "" && Number.isInteger(n) ? formatAmbassadorId(n) : "";
}

/**
 * Searchable dropdown of ambassador IDs (AMGIG-00 … AMGIG-<lastNumber>)
 * plus "No ambassador referred". Typing "7", "07" or "AMGIG-07" narrows the
 * list to that ID; only a value from the list can be chosen. The value is
 * "none" or the number as text (see lib/ambassador.ts).
 */
export function AmbassadorSelect({
  value,
  lastNumber,
  onChange,
  onOpen,
  invalid,
}: {
  value: string;
  lastNumber: number;
  onChange: (value: string) => void;
  /** Called each time the list opens — the form uses it to re-read the current range. */
  onOpen?: () => void;
  invalid?: boolean;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const options = useMemo<Option[]>(() => {
    const ids = ambassadorNumbers(lastNumber).map((n) => ({ value: String(n), label: formatAmbassadorId(n) }));
    const q = query.trim().toLowerCase();
    if (!q) return [{ value: NO_AMBASSADOR, label: NO_AMBASSADOR_LABEL }, ...ids];

    const digits = q.replace(/^amgig[\s-]*/, "");
    const exact = parseAmbassadorInput(q);
    const matchingIds = /^\d+$/.test(digits)
      ? ids
          .filter((o) => o.value.startsWith(String(Number(digits))) || o.label.slice(6).startsWith(digits))
          .sort((a, b) => (Number(a.value) === exact ? -1 : Number(b.value) === exact ? 1 : 0))
      : "amgig".startsWith(q) || q.startsWith("amgig")
        ? ids
        : [];
    const showNone = NO_AMBASSADOR_LABEL.toLowerCase().includes(q) || "none".startsWith(q);
    return [...(showNone ? [{ value: NO_AMBASSADOR, label: NO_AMBASSADOR_LABEL }] : []), ...matchingIds];
  }, [lastNumber, query]);

  function choose(option: Option) {
    onChange(option.value);
    setQuery("");
    setOpen(false);
  }

  function openList() {
    if (!open) onOpen?.();
    setOpen(true);
    setActive(0);
  }

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        // Typed an exact ID and tabbed away: take it.
        const typed = parseAmbassadorInput(query);
        if (typed !== null && typed <= lastNumber) onChange(String(typed));
        setQuery("");
        setOpen(false);
      }}
    >
      <TextInput
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        autoComplete="off"
        // Closed, it reads like the form's other dropdowns ("Choose a
        // district" in normal text); open, the placeholder invites typing.
        placeholder={open ? "Type an ID like 07" : "Choose an ambassador"}
        value={open ? query : labelFor(value)}
        onFocus={openList}
        onClick={openList}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) openList();
            else setActive((i) => Math.min(i + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            if (open && options[active]) {
              e.preventDefault();
              choose(options[active]);
            }
          } else if (e.key === "Escape") {
            setQuery("");
            setOpen(false);
          }
        }}
        className={cn(!open && "cursor-pointer placeholder:text-ignite-ink")}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-ignite-edge/[0.12] bg-ignite-surface py-1 shadow-xl"
        >
          {options.length === 0 ? (
            <li className="px-[15px] py-2.5 font-ui text-[14px] text-ignite-muted">No matching ambassador ID</li>
          ) : (
            options.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                // mousedown, not click: keeps focus in the input so the
                // blur handler above doesn't close the list first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "cursor-pointer px-[15px] py-2.5 font-ui text-[15px] text-ignite-ink",
                  i === active && "bg-ignite-lavender",
                  o.value === value && "font-semibold",
                  o.value === NO_AMBASSADOR && "text-ignite-ink-soft",
                )}
              >
                {o.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
