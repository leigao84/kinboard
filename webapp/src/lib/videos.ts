/**
 * The streaming services the Videos plugin offers: a built-in catalog
 * (the services a family usually wants on the board) plus whatever the
 * family adds itself. The shown list is a family setting (Settings →
 * Videos) so it can be trimmed to the services the family actually has
 * and extended with its own, without a rebuild.
 *
 * A tap on a service navigates the whole display to it: the streaming
 * sites refuse to be framed, so unlike the games portal there is no
 * frame here — the browser's back button is the way back to Kinboard.
 */
export interface VideoService {
  name: string;
  url: string;
  /** Brand colour as a #RRGGBB hex string, used for the tile's swatch. */
  color: string;
}

export const VIDEO_SERVICE_CATALOG: readonly VideoService[] = [
  { name: "YouTube", url: "https://www.youtube.com/tv", color: "#FF0000" },
  { name: "Netflix", url: "https://www.netflix.com", color: "#E50914" },
  { name: "Prime Video", url: "https://www.primevideo.com", color: "#00A8E1" },
  { name: "Hulu", url: "https://www.hulu.com", color: "#1CE783" },
  { name: "Disney+", url: "https://www.disneyplus.com", color: "#315BFF" },
];

/** What a family that never touched the setting sees: the whole catalog. */
export const DEFAULT_VIDEO_SERVICES: readonly VideoService[] = VIDEO_SERVICE_CATALOG;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const FALLBACK_COLOR = "#64748B";

/** The href a URL string parses to, or undefined when it is not http(s). */
function httpHref(raw: string): string | undefined {
  try {
    const url = new URL(raw.trim());
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {
    // Not a URL at all.
  }
  return undefined;
}

/**
 * The service list to show: the saved value's usable entries, in the
 * saved order. Anything that is not an array at all (nothing saved yet,
 * a hand-edited value) falls back to the catalog; an array is taken at
 * face value, so a family can deliberately show few services — or none.
 * Entries without a name or an http(s) address are dropped, so a
 * `javascript:` address typed into the settings form can never become
 * a tile's link.
 */
export function videoServices(saved: unknown): VideoService[] {
  if (!Array.isArray(saved)) {
    // Normalized like saved entries, so addresses compare equal either way.
    return DEFAULT_VIDEO_SERVICES.map((s) => ({ ...s, url: httpHref(s.url) ?? s.url }));
  }
  const out: VideoService[] = [];
  for (const entry of saved) {
    if (typeof entry !== "object" || entry === null) continue;
    const { name, url, color } = entry as Record<string, unknown>;
    if (typeof name !== "string" || name.trim() === "") continue;
    if (typeof url !== "string") continue;
    const href = httpHref(url);
    if (!href) continue;
    out.push({
      name: name.trim(),
      url: href,
      color: typeof color === "string" && HEX_COLOR.test(color) ? color : FALLBACK_COLOR,
    });
  }
  return out;
}

/** The catalog entry for an address, when the address is a catalog one. */
export function catalogService(url: string): VideoService | undefined {
  const href = httpHref(url);
  if (!href) return undefined;
  return VIDEO_SERVICE_CATALOG.find((s) => httpHref(s.url) === href);
}
