import { Gamepad2 } from "lucide-react";
import type { SurfacePlugin } from "../types";

/**
 * The games portal.
 *
 * A surface for the games shelf a family hosts itself (the Gao family's
 * lives at play.gaofam.cc): the nav button opens the portal inside
 * Kinboard, framed, so the board's navigation stays on screen and
 * nobody is stranded on an outside page with no way back. The portal
 * address is a family setting (Settings → Games); the plugin itself
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
