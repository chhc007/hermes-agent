/**
 * Media helpers — resolve local media references to dashboard /api/media
 * URLs. Kept out of MediaImage.tsx so that file only exports the component
 * (fast-refresh rule).
 */

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
