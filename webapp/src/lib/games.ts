/**
 * The games portal the Games plugin opens: a page of the family's own
 * (a self-hosted games shelf, a school games page, anything that allows
 * being framed). The address is a family setting so it can point
 * wherever the family's portal lives without a rebuild; absent or
 * unusable values fall back to the default below.
 */
export const DEFAULT_GAMES_PORTAL_URL = "https://play.gaofam.cc";

/**
 * The portal address to actually frame: the saved value when it parses
 * as an http(s) URL, the default otherwise. A value that cannot be
 * framed at all (a `javascript:` or `data:` address typed into the
 * settings field) must never reach the iframe's src.
 */
export function gamesPortalUrl(saved: unknown): string {
  if (typeof saved === "string" && saved.trim() !== "") {
    try {
      const url = new URL(saved.trim());
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.toString();
      }
    } catch {
      // Not a URL at all — fall through to the default.
    }
  }
  return DEFAULT_GAMES_PORTAL_URL;
}
