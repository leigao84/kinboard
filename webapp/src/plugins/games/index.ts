import { Gamepad2 } from "lucide-react";
import type { SurfacePlugin } from "../types";

/**
 * The games shelf.
 *
 * The games are built into Kinboard itself: the nav button opens a
 * hub of games that ship with the app (jigsaw, minesweeper, sudoku,
 * wordle, trivia, solitaire) and run on the device — nothing is framed and
 * nothing is fetched from outside, so nobody is stranded on an
 * external page with no way back. (Until this plugin grew up, the
 * button framed a separate games site the family hosted; the games
 * moved in and the portal address setting went away.) The plugin
 * holds no data, so it is visible whenever it is enabled.
 */
export const gamesPlugin: SurfacePlugin = {
  id: "games",
  navItem: {
    href: "/games",
    icon: Gamepad2,
    labelKey: "games",
  },
  settingsItem: {
    href: "/settings/games",
    icon: Gamepad2,
    titleKey: "title",
    descriptionKey: "description",
  },
  isNavVisible: () => true,
  useOwnDataCount: () => ({ count: undefined, loading: false }),
  i18nNamespace: "games",
};
