/**
 * MediaImage — renders an image from a local path through the dashboard's
 * /api/media endpoint. Click to open a fullscreen lightbox (zoom + close),
 * touch-friendly for mobile browsers.
 *
 * The agent emits images as a standalone `MEDIA:/abs/path.png` line (or a
 * markdown image `![alt](path)`). Both resolve to /api/media?path=…, which
 * is auth-gated by the session cookie (same-origin, so plain <img> works).
 */

import { Loader2, X, ZoomIn } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const MEDIA_ENDPOINT = "/api/media";

/** Resolve a media reference (absolute path, ~-path, or relative) to the
 *  /api/media URL the backend can serve. Relative paths are tried as-is;
 *  the backend resolves ~ and absolute paths. */
export function mediaUrl(path: string): string {
  const p = path.trim();
  if (!p) return "";
  // Already a URL or data URL — pass through.
  if (/^(https?:|data:|blob:)/i.test(p)) return p;
  return `${MEDIA_ENDPOINT}?path=${encodeURIComponent(p)}`;
}

/** True when a line (or markdown alt) is a media reference we can render. */
export function isMediaPath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg|ico)(\?.*)?$/i.test(path.trim());
}

interface MediaImageProps {
  src: string; // raw path or URL
  alt?: string;
  className?: string;
}

export function MediaImage({ src, alt, className }: MediaImageProps) {
  const url = mediaUrl(src);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
  }, [url]);

  // Lock body scroll while the lightbox is open (mobile-friendly).
  useEffect(() => {
    if (!zoom) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [zoom]);

  const closeOnEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
    },
    [],
  );

  useEffect(() => {
    if (!zoom) return;
    window.addEventListener("keydown", closeOnEsc);
    return () => window.removeEventListener("keydown", closeOnEsc);
  }, [zoom, closeOnEsc]);

  if (!url) return null;

  return (
    <>
      <div className={cn("relative inline-block max-w-full", className)}>
        <div className="group relative overflow-hidden rounded-md border border-border/60 bg-secondary/20">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-secondary/40">
              <Loader2 className="size-5 animate-spin text-text-secondary" />
            </div>
          )}
          <img
            src={url}
            alt={alt ?? "media"}
            loading="lazy"
            onClick={() => setZoom(true)}
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError(true);
            }}
            className={cn(
              "block max-h-80 w-auto max-w-full cursor-zoom-in object-contain transition-opacity",
              loading && "opacity-0",
            )}
          />
          {/* Hover affordance (desktop) */}
          <div className="pointer-events-none absolute inset-0 z-20 flex items-end justify-end p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
            <ZoomIn className="size-4 text-white drop-shadow" />
          </div>
        </div>
        {error && <div className="mt-1 text-xs text-destructive">图片加载失败</div>}
      </div>

      {/* Lightbox */}
      {zoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3 sm:p-6"
          onClick={() => setZoom(false)}
          role="dialog"
          aria-modal="true"
          aria-label={alt ?? "media preview"}
        >
          <button
            type="button"
            onClick={() => setZoom(false)}
            aria-label="Close preview"
            className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="size-5" />
          </button>
          <img
            src={url}
            alt={alt ?? "media preview"}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[92vw] rounded-md object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  );
}
