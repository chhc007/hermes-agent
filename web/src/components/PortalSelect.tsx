/**
 * PortalSelect — a dropdown select whose listbox renders into
 * `document.body` via a portal with `position: fixed` coordinates, so it
 * is never clipped by an ancestor with `overflow-y-auto` (the ChatSidebar
 * / mobile chat-side-panel containers crop the stock absolute-positioned
 * `@nous-research/ui` Select).
 *
 * API-compatible with the official `Select` / `SelectOption` pair
 * (`children / className / disabled / id / onValueChange / placeholder /
 * style / value`); the trigger button and option row visuals are copied
 * verbatim from the official select.tsx so the sidebar looks identical.
 *
 * Positioning: opened from the trigger's `getBoundingClientRect()` —
 * below by default, flipped above when there isn't enough room below.
 * The position is recomputed (rAF-throttled) on window scroll/resize while
 * open, so the list tracks the trigger even inside scroll containers.
 */

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

const TRIGGER_CN =
  "flex h-9 w-full items-center justify-between gap-2 " +
  "border border-midground/15 bg-background/40 px-3 py-1 " +
  "font-courier text-sm text-left text-midground transition-colors " +
  "hover:border-midground/25 " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-midground/30 focus-visible:border-midground/30 " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  "cursor-pointer";

// Portal listbox: fixed instead of absolute, z-[100] (above z-50 stacks),
// max-h-60 keeps the same internal scroll semantics as the official one.
const LISTBOX_CN =
  "fixed z-[100] max-h-60 overflow-auto " +
  "border border-midground/15 bg-background-base text-midground shadow-lg";

const OPTION_CN =
  "flex cursor-pointer items-center gap-2 px-3 py-2 " +
  "font-courier text-sm transition-colors";

/** Estimated open listbox height used for flip decisions (matches max-h-60). */
const MAX_LIST_HEIGHT = 240;
/** Per-option row height estimate (py-2 + text-sm ≈ 36px). */
const ROW_HEIGHT = 36;
const GAP = 4; // gap between trigger and listbox
const EDGE_MARGIN = 8; // keep the listbox off the viewport edges

export function PortalSelect({
  children,
  className,
  disabled,
  id,
  onValueChange,
  placeholder,
  style,
  value,
}: PortalSelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => collectOptions(children), [children]);
  const selected = options.find((o) => o.value === value);
  const displayLabel = selected?.label ?? placeholder ?? value ?? "";

  const close = useCallback(() => {
    setOpen(false);
    setHighlightedIndex(-1);
  }, []);

  // Position the portal listbox relative to the trigger's current rect.
  // Below by default; flip above when there isn't enough room below.
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const estimatedHeight = Math.min(options.length * ROW_HEIGHT + EDGE_MARGIN, MAX_LIST_HEIGHT);
    const fitsBelow = rect.bottom + GAP + estimatedHeight <= window.innerHeight - EDGE_MARGIN;
    const top = fitsBelow
      ? rect.bottom + GAP
      : Math.max(EDGE_MARGIN, rect.top - estimatedHeight - GAP);
    setPos({ top, left: rect.left, width: rect.width });
  }, [options.length]);

  // While open: recompute on window scroll (capture phase catches scrolls
  // inside nested overflow containers) and resize, rAF-throttled.
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePosition();
    let raf = 0;
    const recompute = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updatePosition);
    };
    window.addEventListener("scroll", recompute, { capture: true, passive: true });
    window.addEventListener("resize", recompute, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", recompute, { capture: true });
      window.removeEventListener("resize", recompute);
    };
  }, [open, updatePosition]);

  // Close on outside mousedown. The listbox is a body child (portal), so
  // check both the trigger wrapper and the list ref.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open, close]);

  // Keep the highlighted option in view while keyboard-navigating.
  useEffect(() => {
    if (!open || highlightedIndex < 0) return;
    const el = listRef.current?.children[highlightedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [open, highlightedIndex]);

  const openAtCurrent = useCallback(() => {
    setOpen(true);
    setHighlightedIndex(options.findIndex((o) => o.value === value));
  }, [options, value]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        if (!open) {
          openAtCurrent();
        } else if (highlightedIndex >= 0 && options[highlightedIndex]) {
          onValueChange?.(options[highlightedIndex].value);
          close();
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (!open) {
          openAtCurrent();
        } else {
          setHighlightedIndex((i) => Math.min(i + 1, options.length - 1));
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (open) setHighlightedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          setHighlightedIndex(0);
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          setHighlightedIndex(options.length - 1);
        }
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
    }
  };

  return (
    <div className={cn("relative", className)} id={id} ref={containerRef} style={style}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={TRIGGER_CN}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        ref={triggerRef}
        role="combobox"
        type="button"
      >
        <span className={cn("truncate", !selected && "text-midground/50")}>
          {displayLabel}
        </span>

        <ChevronDownGlyph
          className={cn(
            "size-3 shrink-0 text-midground/60 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            className={LISTBOX_CN}
            ref={listRef}
            role="listbox"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            {options.map((opt, i) => {
              const isSelected = opt.value === value;
              const isHighlighted = i === highlightedIndex;

              return (
                <div
                  aria-selected={isSelected}
                  className={cn(
                    OPTION_CN,
                    isHighlighted && "bg-midground/10",
                    isSelected ? "text-midground" : "text-midground/70",
                  )}
                  key={opt.value}
                  onClick={() => {
                    onValueChange?.(opt.value);
                    close();
                  }}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  role="option"
                >
                  <CheckGlyph
                    className={cn(
                      "size-3 shrink-0",
                      isSelected ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{opt.label}</span>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

// Marker component — `PortalSelect` reads `value`/`children` from its tree.
// Renders nothing on its own.
export function PortalSelectOption(_props: PortalSelectOptionProps) {
  return null;
}

const ChevronDownGlyph = ({ className }: { className?: string }) => (
  <svg
    aria-hidden
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="square"
    strokeWidth={1.5}
    viewBox="0 0 12 12"
  >
    <path d="M2.5 4.5 6 8l3.5-3.5" />
  </svg>
);

const CheckGlyph = ({ className }: { className?: string }) => (
  <svg
    aria-hidden
    className={className}
    fill="none"
    stroke="currentColor"
    strokeLinecap="square"
    strokeWidth={1.5}
    viewBox="0 0 12 12"
  >
    <path d="m2.5 6.5 2.5 2.5L9.5 3.5" />
  </svg>
);

function collectOptions(children: ReactNode): PortalSelectOptionData[] {
  const out: PortalSelectOptionData[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{
      children?: ReactNode;
      value?: unknown;
    }>;
    if (el.props.value !== undefined) {
      out.push({
        label:
          typeof el.props.children === "string"
            ? el.props.children
            : String(el.props.value),
        value: String(el.props.value),
      });
    } else if (el.props.children) {
      out.push(...collectOptions(el.props.children));
    }
  });
  return out;
}

interface PortalSelectOptionData {
  label: string;
  value: string;
}

interface PortalSelectOptionProps {
  children: ReactNode;
  value: string;
}

interface PortalSelectProps {
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  style?: CSSProperties;
  value?: string;
}
