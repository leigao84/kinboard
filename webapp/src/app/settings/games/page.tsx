"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRight, Gamepad2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { GAMES } from "@/plugins/games/catalog";

/**
 * Settings → Games. There used to be a portal address here, from
 * when the Games button framed a separate games site; the games
 * are built into Kinboard now, so this page is the shelf list —
 * nothing to configure, nothing to host.
 */
export default function GamesSettingsPage() {
  const t = useTranslations("settings.games");
  const tg = useTranslations("games");

  return (
    <main id="main-content" className="min-h-page p-4 pt-16 md:p-8 md:pt-20 relative safe-area-inset">
      <div className="relative z-10 max-w-2xl mx-auto space-y-6">
        <PageHeader title={t("title")} icon={Gamepad2} />

        <p className="text-sm text-muted-foreground">{t("intro")}</p>

        <Card id="library" data-setting="library" className="p-6 space-y-2">
          <h3 className="font-medium mb-2">{t("libraryHeading")}</h3>
          {GAMES.map((game) => (
            <Link
              key={game.id}
              href={game.href}
              className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{tg(`${game.id}.name`)}</span>
                <span className="block truncate text-sm text-muted-foreground">{tg(`${game.id}.tagline`)}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          ))}
        </Card>
      </div>
    </main>
  );
}
