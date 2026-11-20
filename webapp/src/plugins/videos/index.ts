import { Clapperboard } from "lucide-react";
import type { SurfacePlugin } from "../types";

/**
 * The video services.
 *
 * A launcher surface: the nav button opens a page of streaming-service
 * tiles (YouTube, Netflix, … — the list is a family setting, Settings →
 * Videos), and a tap takes the whole display to that service. The
 * plugin holds no data of its own, so it is visible whenever it is
 * enabled.
 */
export const videosPlugin: SurfacePlugin = {
  id: "videos",
  navItem: {
    href: "/videos",
    icon: Clapperboard,
    labelKey: "videos",
  },
  settingsItem: {
    href: "/settings/videos",
    icon: Clapperboard,
    titleKey: "title",
    descriptionKey: "description",
  },
  isNavVisible: () => true,
  useOwnDataCount: () => ({ count: undefined, loading: false }),
  i18nNamespace: "videos",
};
