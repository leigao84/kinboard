"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSetting } from "@/hooks/use-supabase-queries";
import { SETTINGS_KEYS } from "@/lib/settings-keys";
import { videoServices } from "@/lib/videos";

/**
 * The video services (the Videos plugin's surface): one tile per
 * service in the family's list. A tap navigates the whole display to
 * the service — the streaming sites refuse to be framed, so there is
 * deliberately no frame here (unlike the games portal); the browser's
 * back button is the way back to Kinboard.
 */
export default function VideosPage() {
  const t = useTranslations("videos");
  const { data: saved } = useSetting(SETTINGS_KEYS.videosServices, null);
  const services = videoServices(saved);

  return (
    <main id="main-content" className="min-h-page p-4 pt-16 md:p-8 md:pt-20 relative safe-area-inset">
      <div className="relative z-10 mx-auto max-w-5xl space-y-6">
        <div className="flex items-center gap-3">
          <Clapperboard className="size-6 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-xl font-semibold">{t("title")}</h1>
        </div>

        <p className="text-sm text-muted-foreground">{t("intro")}</p>

        {services.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
            <p className="text-sm">{t("empty")}</p>
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/videos">{t("settingsLink")}</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <a
                key={service.url}
                href={service.url}
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:bg-accent/50"
              >
                <span
                  className="flex size-12 shrink-0 items-center justify-center rounded-lg text-xl font-bold text-white"
                  style={{ backgroundColor: service.color }}
                  aria-hidden="true"
                >
                  {service.name.charAt(0)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{service.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {new URL(service.url).hostname.replace(/^www\./, "")}
                  </span>
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
