"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Gamepad2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSetting, useUpdateSetting } from "@/hooks/use-supabase-queries";
import { SETTINGS_KEYS } from "@/lib/settings-keys";
import { DEFAULT_GAMES_PORTAL_URL, gamesPortalUrl } from "@/lib/games";

export default function GamesSettingsPage() {
  const t = useTranslations("settings.games");
  const { data: savedUrl, isPending } = useSetting<string>(
    SETTINGS_KEYS.gamesPortalUrl,
    DEFAULT_GAMES_PORTAL_URL,
  );
  const update = useUpdateSetting<string>();
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (savedUrl !== undefined) setUrl(gamesPortalUrl(savedUrl));
  }, [savedUrl]);

  async function save() {
    try {
      await update.mutateAsync({
        key: SETTINGS_KEYS.gamesPortalUrl,
        value: url.trim(),
      });
      toast.success(t("saved"));
    } catch {
      toast.error(t("saveFailed"));
    }
  }

  return (
    <main id="main-content" className="min-h-page p-4 pt-16 md:p-8 md:pt-20 relative safe-area-inset">
      <div className="relative z-10 max-w-2xl mx-auto space-y-6">
        <PageHeader title={t("title")} icon={Gamepad2} />

        <p className="text-sm text-muted-foreground">{t("intro")}</p>

        <Card id="portal" data-setting="portal" className="p-6 space-y-4">
          <div>
            <h3 className="font-medium mb-2">{t("portalHeading")}</h3>
            <Label htmlFor="games-portal-url">{t("urlLabel")}</Label>
            <Input
              id="games-portal-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={DEFAULT_GAMES_PORTAL_URL}
              disabled={isPending}
              inputMode="url"
              className="mt-2"
            />
            <p className="text-sm text-muted-foreground mt-2">{t("urlHint")}</p>
          </div>
          <Button onClick={save} disabled={isPending || update.isPending}>
            {t("saveButton")}
          </Button>
        </Card>
      </div>
    </main>
  );
}
