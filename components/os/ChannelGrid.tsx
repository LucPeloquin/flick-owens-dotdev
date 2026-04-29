"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { allSlots } from "@/lib/channels/registry";
import { ChannelTile, type ChannelTileHandle } from "./ChannelTile";
import { getAudio } from "@/lib/audio/engine";

const COLS = 4;
const ROWS = 3;
const PAGE_SIZE = COLS * ROWS;

export function ChannelGrid() {
  const slots = useMemo(() => allSlots(), []);
  const [page, setPage] = useState(0);
  const [focused, setFocused] = useState<number | null>(() => {
    const initialFocus = allSlots().findIndex((c) => !!c);
    return initialFocus >= 0 ? initialFocus : null;
  });
  const tileRefs = useRef<Array<ChannelTileHandle | null>>([]);

  const pageSlots = slots.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(slots.length / PAGE_SIZE));

  const firstOccupiedIndex = useMemo(
    () => pageSlots.findIndex((c) => !!c),
    [pageSlots],
  );

  const goToPage = useCallback(
    (nextPage: number) => {
      const boundedPage = Math.min(totalPages - 1, Math.max(0, nextPage));
      const nextSlots = slots.slice(
        boundedPage * PAGE_SIZE,
        (boundedPage + 1) * PAGE_SIZE,
      );
      const nextFocus = nextSlots.findIndex((c) => !!c);
      setPage(boundedPage);
      setFocused(nextFocus >= 0 ? nextFocus : null);
    },
    [slots, totalPages],
  );


  const moveFocus = useCallback(
    (delta: { dx?: number; dy?: number }) => {
      setFocused((cur) => {
        const start = cur ?? firstOccupiedIndex;
        if (start < 0) return cur;
        let idx = start;
        // Walk up to PAGE_SIZE steps, skipping empty slots
        for (let step = 0; step < PAGE_SIZE; step++) {
          const row = Math.floor(idx / COLS);
          const col = idx % COLS;
          const nextRow = Math.min(
            ROWS - 1,
            Math.max(0, row + (delta.dy ?? 0)),
          );
          const nextCol = Math.min(
            COLS - 1,
            Math.max(0, col + (delta.dx ?? 0)),
          );
          const nextIdx = nextRow * COLS + nextCol;
          if (nextIdx === idx) return idx; // at edge in that direction
          idx = nextIdx;
          if (pageSlots[idx]) {
            getAudio().play("hover", { volume: 0.2 });
            return idx;
          }
        }
        return cur;
      });
    },
    [firstOccupiedIndex, pageSlots],
  );

  // Keep DOM focus synced so the outline/ring shows for keyboard users
  useEffect(() => {
    if (focused == null) return;
    tileRefs.current[focused]?.focus();
  }, [focused]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Don't steal keys from form elements inside channels
      if (target && target.matches("input, textarea, select")) return;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          moveFocus({ dx: 1 });
          break;
        case "ArrowLeft":
          e.preventDefault();
          moveFocus({ dx: -1 });
          break;
        case "ArrowDown":
          e.preventDefault();
          moveFocus({ dy: 1 });
          break;
        case "ArrowUp":
          e.preventDefault();
          moveFocus({ dy: -1 });
          break;
        case "Enter":
        case " ": {
          if (focused != null) {
            e.preventDefault();
            tileRefs.current[focused]?.activate();
          }
          break;
        }
        case "[":
          if (totalPages > 1) goToPage(page - 1);
          break;
        case "]":
          if (totalPages > 1) goToPage(page + 1);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, goToPage, moveFocus, page, totalPages]);

  return (
    <div className="mx-auto w-full max-w-5xl px-8 pt-10">
      <div className="grid grid-cols-[48px_1fr_48px] items-center gap-4 pb-40">
        <PageArrow
          direction="prev"
          disabled={page === 0}
          onClick={() => goToPage(page - 1)}
        />

        <div className="grid grid-cols-4 gap-5">
          {Array.from({ length: PAGE_SIZE }, (_, i) => {
            const channel = pageSlots[i];
            const slot = page * PAGE_SIZE + i;
            return (
              <ChannelTile
                key={slot}
                ref={(el) => {
                  tileRefs.current[i] = el;
                }}
                slot={slot}
                channel={channel}
                focused={focused === i && !!channel}
                onFocus={() => channel && setFocused(i)}
              />
            );
          })}
        </div>

        <PageArrow
          direction="next"
          disabled={page >= totalPages - 1}
          onClick={() => goToPage(page + 1)}
        />
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              data-wii-interactive
              aria-label={`Page ${i + 1}`}
              onClick={() => goToPage(i)}
              className={`h-2 w-8 rounded-full transition-colors ${
                i === page ? "bg-white" : "bg-white/40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PageArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      data-wii-interactive
      aria-label={direction === "prev" ? "Previous page" : "Next page"}
      onClick={() => {
        if (disabled) return;
        getAudio().play("tink");
        onClick();
      }}
      disabled={disabled}
      className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-white/70 text-black shadow-lg transition-all hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-30"
    >
      <span className="text-xl leading-none">
        {direction === "prev" ? "‹" : "›"}
      </span>
    </button>
  );
}
