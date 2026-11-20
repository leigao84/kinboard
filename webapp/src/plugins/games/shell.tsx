"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, Bomb, Brain, Hash, Puzzle, Type } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GameId } from "./catalog";

const GAME_ICONS: Record<GameId, LucideIcon> = {
  jigsaw: Puzzle,
  minesweeper: Bomb,
  sudoku: Hash,
  wordle: Type,
  trivia: Brain,
};

/**
 * The chrome every game page wears: a back button to the hub (the
 * board's nav stays on screen too, so nobody is stranded mid-game)
 * and the game's name, translated like the rest of the plugin.
 */
export function GameShell({ gameId, children }: { gameId: GameId; children: ReactNode }) {
  const t = useTranslations("games");
  const Icon = GAME_ICONS[gameId];

  return (
    <main id="main-content" className="min-h-page p-4 pt-16 md:p-8 md:pt-20 relative safe-area-inset">
      <div className="relative z-10 mx-auto max-w-5xl space-y-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/games">
              <ArrowLeft className="size-4" aria-hidden="true" />
              {t("backToGames")}
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
            <h1 className="text-xl font-semibold">{t(`${gameId}.name`)}</h1>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
