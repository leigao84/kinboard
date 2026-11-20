"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Clapperboard, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSetting, useUpdateSetting } from "@/hooks/use-supabase-queries";
import { SETTINGS_KEYS } from "@/lib/settings-keys";
import {
  VIDEO_SERVICE_CATALOG,
  catalogService,
  videoServices,
  type VideoService,
} from "@/lib/videos";

export default function VideosSettingsPage() {
  const t = useTranslations("settings.videos");
  const { data: saved, isPending } = useSetting(SETTINGS_KEYS.videosServices, null);
  const update = useUpdateSetting<VideoService[]>();
  const [list, setList] = useState<VideoService[] | null>(null);
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");

  useEffect(() => {
    if (saved !== undefined && list === null) setList(videoServices(saved));
  }, [saved, list]);

  const services = list ?? [];
  const shownHrefs = new Set(services.map((s) => s.url));
  const customs = services.filter((s) => !catalogService(s.url));

  function toggleCatalog(service: VideoService, on: boolean) {
    setList((prev) => {
      const current = prev ?? [];
      if (on) return current.some((s) => s.url === service.url) ? current : [...current, service];
      return current.filter((s) => s.url !== service.url);
    });
  }

  function addCustom() {
    const name = customName.trim();
    let href: string | undefined;
    try {
      const url = new URL(customUrl.trim());
      if (url.protocol === "http:" || url.protocol === "https:") href = url.toString();
    } catch {
      // Not a URL at all — reported below.
    }
    if (name === "" || !href) {
      toast.error(t("invalidService"));
      return;
    }
    setList((prev) => [...(prev ?? []), { name, url: href, color: "#64748B" }]);
    setCustomName("");
    setCustomUrl("");
  }

  function removeCustom(service: VideoService) {
    setList((prev) => (prev ?? []).filter((s) => s !== service));
  }

  async function save() {
    try {
      await update.mutateAsync({
        key: SETTINGS_KEYS.videosServices,
        value: services,
      });
      toast.success(t("saved"));
    } catch {
      toast.error(t("saveFailed"));
    }
  }

  return (
    <main id="main-content" className="min-h-page p-4 pt-16 md:p-8 md:pt-20 relative safe-area-inset">
      <div className="relative z-10 max-w-2xl mx-auto space-y-6">
        <PageHeader title={t("title")} icon={Clapperboard} />

        <p className="text-sm text-muted-foreground">{t("intro")}</p>

        <Card id="services" data-setting="services" className="p-6 space-y-4">
          <h3 className="font-medium">{t("servicesHeading")}</h3>
          <div className="space-y-1">
            {VIDEO_SERVICE_CATALOG.map((service) => (
              <div key={service.url} className="flex items-center gap-3 rounded-md px-2 py-2">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-md text-base font-bold text-white"
                  style={{ backgroundColor: service.color }}
                  aria-hidden="true"
                >
                  {service.name.charAt(0)}
                </span>
                <span className="text-sm font-medium">{service.name}</span>
                <Switch
                  className="ml-auto"
                  checked={shownHrefs.has(new URL(service.url).toString())}
                  onCheckedChange={(on) => toggleCatalog({ ...service, url: new URL(service.url).toString() }, on)}
                  disabled={isPending || list === null}
                  aria-label={t("showService", { name: service.name })}
                />
              </div>
            ))}
          </div>
        </Card>

        <Card id="custom" data-setting="custom" className="p-6 space-y-4">
          <h3 className="font-medium">{t("customHeading")}</h3>
          {customs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noCustom")}</p>
          ) : (
            <div className="space-y-1">
              {customs.map((service) => (
                <div key={service.url} className="flex items-center gap-3 rounded-md px-2 py-2">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-md text-base font-bold text-white"
                    style={{ backgroundColor: service.color }}
                    aria-hidden="true"
                  >
                    {service.name.charAt(0)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{service.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">{service.url}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() => removeCustom(service)}
                    aria-label={t("removeService", { name: service.name })}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-3">
            <div>
              <Label htmlFor="videos-custom-name">{t("nameLabel")}</Label>
              <Input
                id="videos-custom-name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="videos-custom-url">{t("urlLabel")}</Label>
              <Input
                id="videos-custom-url"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://"
                inputMode="url"
                className="mt-2"
              />
            </div>
            <Button variant="outline" onClick={addCustom} disabled={list === null}>
              <Plus className="size-4 mr-2" aria-hidden="true" />
              {t("addButton")}
            </Button>
          </div>
        </Card>

        <Button onClick={save} disabled={isPending || list === null || update.isPending} className="w-full">
          {t("saveButton")}
        </Button>
      </div>
    </main>
  );
}
