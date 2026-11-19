"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, ExternalLink, Gamepad2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSetting } from "@/hooks/use-supabase-queries";
import { SETTINGS_KEYS } from "@/lib/settings-keys";
import { DEFAULT_GAMES_PORTAL_URL, gamesPortalUrl } from "@/lib/games";
import { blockedAsMixedContent } from "@/lib/ha-embed";

/**
 * The games portal (the Games plugin's surface): the family's own games
 * page, framed so the board's navigation stays on screen — a plain link
 * out would strand a kiosk on an outside page with no way back.
 *
 * Sandboxed like the Home Assistant frames and without
 * `allow-top-navigation`, so nothing framed can send the whole display
 * away from Kinboard; `allow-same-origin` is the portal's own origin
 * (it keeps the games' saved scores and progress there), never
 * Kinboard's.
 */
export default function GamesPage() {
  const t = useTranslations("games");
  const { data: savedUrl } = useSetting<string>(
    SETTINGS_KEYS.gamesPortalUrl,
    DEFAULT_GAMES_PORTAL_URL,
  );
  const src = gamesPortalUrl(savedUrl);
  const [loaded, setLoaded] = useState(false);
  // The page's protocol is only known in the browser; the first render is the server's.
  const [mixed, setMixed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setMixed(blockedAsMixedContent(window.location.protocol, src));
  }, [src]);

  return (
    <main id="main-content" className="min-h-page p-4 pt-16 md:p-8 md:pt-20 relative safe-area-inset flex flex-col">
      <div className="relative z-10 flex flex-1 flex-col gap-4">
        <div className="flex items-center gap-3">
          <Gamepad2 className="size-6 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <div className="flex-1" />
          <Button asChild variant="outline" size="sm">
            <a href={src} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" aria-hidden="true" />
              {t("openExternal")}
            </a>
          </Button>
        </div>

        {mixed ? (
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/5 p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
              <p className="text-sm">{t("mixedContent")}</p>
            </div>
            <Button asChild variant="outline" size="sm" className="self-start">
              <Link href="/settings/games">{t("settingsLink")}</Link>
            </Button>
          </div>
        ) : (
          <div className="relative flex-1 overflow-hidden rounded-xl border border-border bg-card" style={{ minHeight: "24rem" }}>
            <iframe
              key={src}
              src={src}
              title={t("frameTitle")}
              className="absolute inset-0 size-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              onLoad={() => setLoaded(true)}
            />
            {!loaded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card p-6 text-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">{t("loading")}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
