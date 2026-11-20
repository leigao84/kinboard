import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * The Games plugin, as data: the games moved into Kinboard from the
 * family's standalone games site, and these guards keep them in.
 * The old surface framed an external portal — a regression here
 * (an iframe creeping back, a game dropped from the catalog, a
 * route without a page) would not fail any render test, because
 * every page would still draw *something*.
 *
 * Like plugin-registry-i18n.spec.ts, the bundles and sources are
 * checked as data rather than through the app.
 */

const WEBAPP = join(__dirname, "..");
const SRC = join(WEBAPP, "src");
const MESSAGES = join(WEBAPP, "messages");
const LOCALES = ["en", "de", "fr", "zh"] as const;

const EXPECTED_GAMES = ["jigsaw", "minesweeper", "sudoku", "wordle", "trivia"] as const;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function lookup(bundle: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, part) => {
    if (node && typeof node === "object") return (node as Record<string, unknown>)[part];
    return undefined;
  }, bundle);
}

test.describe("games plugin", () => {
  test("the catalog lists exactly the five games, in hub order", () => {
    const catalog = read(join(SRC, "plugins", "games", "catalog.ts"));
    const ids = [...catalog.matchAll(/\{\s*id:\s*"(\w+)",\s*href:\s*"\/games\/(\w+)"\s*\}/g)].map(
      (m) => ({ id: m[1], slug: m[2] }),
    );
    expect(ids.map((g) => g.id)).toEqual([...EXPECTED_GAMES]);
    for (const g of ids) expect(g.slug).toBe(g.id);
    // Pixel Puzzle was shelved by the family; it stays on the old site only.
    expect(catalog).not.toContain("pixel");
  });

  test("every game has a route, a component and a stylesheet in the plugin", () => {
    for (const id of EXPECTED_GAMES) {
      expect(existsSync(join(SRC, "app", "games", id, "page.tsx")), `route /games/${id}`).toBe(true);
      const dir = join(SRC, "plugins", "games", id);
      const files = ["Game.tsx", ".css"];
      expect(
        existsSync(join(dir, `${id[0].toUpperCase()}${id.slice(1)}${files[0]}`)),
        `component for ${id}`,
      ).toBe(true);
      expect(existsSync(join(dir, `${id}${files[1]}`)), `stylesheet for ${id}`).toBe(true);
    }
    expect(existsSync(join(SRC, "app", "games", "page.tsx")), "hub route /games").toBe(true);
  });

  test("nothing frames the old portal any more", () => {
    const surfaces = [
      join(SRC, "app", "games", "page.tsx"),
      join(SRC, "app", "settings", "games", "page.tsx"),
      join(SRC, "plugins", "games", "index.ts"),
      join(SRC, "plugins", "games", "catalog.ts"),
      join(SRC, "plugins", "games", "shell.tsx"),
      ...EXPECTED_GAMES.map((id) => join(SRC, "app", "games", id, "page.tsx")),
    ];
    for (const file of surfaces) {
      const source = read(file);
      expect(source, `${file} must not frame`).not.toContain("<iframe");
      expect(source, `${file} must not point at the old portal`).not.toContain("play.gaofam.cc");
      expect(source, `${file} must not read the portal setting`).not.toContain("gamesPortalUrl");
    }
    // The portal helper and its setting key are gone entirely.
    expect(existsSync(join(SRC, "lib", "games.ts"))).toBe(false);
    expect(read(join(SRC, "lib", "settings-keys.ts"))).not.toContain("gamesPortalUrl");
  });

  test("the plugin keeps its identity, so family settings carry over", () => {
    const manifest = read(join(SRC, "plugins", "games", "index.ts"));
    expect(manifest).toContain('id: "games"');
    expect(manifest).toContain('href: "/games"');
    expect(manifest).toContain('i18nNamespace: "games"');
    const registry = read(join(SRC, "plugins", "registry.ts"));
    expect(registry).toContain("gamesPlugin");
    const constants = read(join(SRC, "lib", "constants.ts"));
    expect(constants).toContain('href: "/games"');
  });

  test("every game is named and described in every language", () => {
    const missing: string[] = [];
    for (const locale of LOCALES) {
      const bundle = JSON.parse(read(join(MESSAGES, `${locale}.json`)));
      for (const path of ["games.title", "games.intro", "games.backToGames", "games.play"]) {
        const value = lookup(bundle, path);
        if (typeof value !== "string" || value.trim() === "") missing.push(`${locale}: ${path}`);
      }
      for (const id of EXPECTED_GAMES) {
        for (const field of ["name", "tagline"]) {
          const value = lookup(bundle, `games.${id}.${field}`);
          if (typeof value !== "string" || value.trim() === "") {
            missing.push(`${locale}: games.${id}.${field}`);
          }
        }
      }
      // The framed-portal copy is gone from the shelf's namespace.
      expect(lookup(bundle, "games.frameTitle"), `${locale}: games.frameTitle removed`).toBeUndefined();
      expect(lookup(bundle, "games.mixedContent"), `${locale}: games.mixedContent removed`).toBeUndefined();
      expect(lookup(bundle, "settings.games.portalHeading"), `${locale}: portal heading removed`).toBeUndefined();
      expect(
        typeof lookup(bundle, "settings.games.libraryHeading"),
        `${locale}: settings.games.libraryHeading present`,
      ).toBe("string");
    }
    expect(missing, `Games copy missing:\n  ${missing.join("\n  ")}`).toEqual([]);
  });
});
