"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Gamepad2 } from "lucide-react";
import { GAMES } from "@/plugins/games/catalog";
import type { GameId } from "@/plugins/games/catalog";

/**
 * The games shelf (the Games plugin's surface): one card per game
 * that ships with Kinboard. The games live in the app now — until
 * they moved in, this page framed the family's separate games site.
 * A tap opens the game on its own page inside Kinboard, so the
 * board's navigation stays on screen throughout.
 */
export default function GamesPage() {
  const t = useTranslations("games");

  return (
    <main id="main-content" className="min-h-page p-4 pt-16 md:p-8 md:pt-20 relative safe-area-inset">
      <div className="relative z-10 mx-auto max-w-5xl space-y-6">
        <div className="flex items-center gap-3">
          <Gamepad2 className="size-6 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-xl font-semibold">{t("title")}</h1>
        </div>

        <p className="text-sm text-muted-foreground">{t("intro")}</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((game) => (
            <Link
              key={game.id}
              href={game.href}
              className="flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:bg-accent/50"
            >
              <span className="flex h-44 items-center justify-center overflow-hidden" style={{ backgroundColor: GAME_ART_BG[game.id] }} aria-hidden="true">
                <GameArt id={game.id} />
              </span>
              <span className="flex flex-1 flex-col p-5">
                <span className="font-medium">{t(`${game.id}.name`)}</span>
                <span className="mt-1 text-sm text-muted-foreground">{t(`${game.id}.tagline`)}</span>
                <span className="mt-3 inline-flex w-fit items-center rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground">
                  {t("play")}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

const GAME_ART_BG: Record<GameId, string> = {
  jigsaw: "#fdf3e3",
  minesweeper: "#e9e4d8",
  sudoku: "#fdf3e3",
  wordle: "#e9e4d8",
  trivia: "#fdf3e3",
};

/** The card art, carried over from the old standalone games hub. */
function GameArt({ id }: { id: GameId }) {
  switch (id) {
    case "jigsaw":
      return (
        <img src="/games/jigsaw/photos/photo-7.jpg" alt="" className="size-full object-cover" />
      );
    case "minesweeper":
      return (
        <svg width="168" height="168" viewBox="0 0 100 100" aria-hidden="true">
          <rect x="8" y="8" width="25" height="25" rx="5" fill="#b9c8b4" />
          <rect x="37" y="8" width="25" height="25" rx="5" fill="#efe9db" />
          <text x="49.5" y="27" fontSize="16" fontWeight="bold" fill="#4361EE" textAnchor="middle">1</text>
          <rect x="66" y="8" width="25" height="25" rx="5" fill="#b9c8b4" />
          <rect x="8" y="37" width="25" height="25" rx="5" fill="#efe9db" />
          <text x="20.5" y="56" fontSize="16" fontWeight="bold" fill="#22B14C" textAnchor="middle">2</text>
          <rect x="37" y="37" width="25" height="25" rx="5" fill="#b9c8b4" />
          <circle cx="49.5" cy="49.5" r="8" fill="#26324B" />
          <g stroke="#26324B" strokeWidth="2.6" strokeLinecap="round">
            <line x1="49.5" y1="38" x2="49.5" y2="61" /><line x1="38" y1="49.5" x2="61" y2="49.5" />
            <line x1="41.5" y1="41.5" x2="57.5" y2="57.5" /><line x1="57.5" y1="41.5" x2="41.5" y2="57.5" />
          </g>
          <rect x="66" y="37" width="25" height="25" rx="5" fill="#b9c8b4" />
          <rect x="8" y="66" width="25" height="25" rx="5" fill="#b9c8b4" />
          <rect x="37" y="66" width="25" height="25" rx="5" fill="#b9c8b4" />
          <polygon points="44,70 44,84 58,76.5" fill="#E01E37" />
          <line x1="44" y1="68" x2="44" y2="88" stroke="#4a3f35" strokeWidth="2.6" strokeLinecap="round" />
          <rect x="66" y="66" width="25" height="25" rx="5" fill="#efe9db" />
          <text x="78.5" y="85" fontSize="16" fontWeight="bold" fill="#E01E37" textAnchor="middle">3</text>
        </svg>
      );
    case "sudoku":
      return (
        <svg width="150" height="150" viewBox="0 0 90 90" aria-hidden="true">
          <rect x="5" y="5" width="80" height="80" rx="4" fill="#fff" stroke="#4a3f35" strokeWidth="3" />
          <g stroke="#ddd2be" strokeWidth="1">
            <line x1="31.7" y1="5" x2="31.7" y2="85" /><line x1="58.3" y1="5" x2="58.3" y2="85" />
            <line x1="5" y1="31.7" x2="85" y2="31.7" /><line x1="5" y1="58.3" x2="85" y2="58.3" />
          </g>
          <g stroke="#4a3f35" strokeWidth="2.4">
            <line x1="45" y1="5" x2="45" y2="85" />
            <line x1="5" y1="45" x2="85" y2="45" />
          </g>
          <g fontSize="17" fontWeight="bold" textAnchor="middle">
            <text x="18" y="24" fill="#26324B">5</text>
            <text x="45" y="24" fill="#4361EE">3</text>
            <text x="72" y="51" fill="#26324B">8</text>
            <text x="18" y="78" fill="#4361EE">9</text>
            <text x="72" y="78" fill="#26324B">1</text>
            <text x="45" y="51" fill="#E01E37">6</text>
          </g>
        </svg>
      );
    case "wordle":
      return (
        <svg width="168" height="132" viewBox="0 0 150 118" aria-hidden="true">
          <g fontSize="21" fontWeight="bold" textAnchor="middle">
            <rect x="9" y="7" width="24" height="24" rx="4" fill="#6aaa64" /><text x="21" y="26" fill="#fff">C</text>
            <rect x="37" y="7" width="24" height="24" rx="4" fill="#c9b458" /><text x="49" y="26" fill="#fff">R</text>
            <rect x="65" y="7" width="24" height="24" rx="4" fill="#787c7e" /><text x="77" y="26" fill="#fff">A</text>
            <rect x="93" y="7" width="24" height="24" rx="4" fill="#6aaa64" /><text x="105" y="26" fill="#fff">N</text>
            <rect x="121" y="7" width="24" height="24" rx="4" fill="#787c7e" /><text x="133" y="26" fill="#fff">E</text>
            <rect x="9" y="47" width="24" height="24" rx="4" fill="#6aaa64" /><text x="21" y="66" fill="#fff">C</text>
            <rect x="37" y="47" width="24" height="24" rx="4" fill="#6aaa64" /><text x="49" y="66" fill="#fff">R</text>
            <rect x="65" y="47" width="24" height="24" rx="4" fill="#6aaa64" /><text x="77" y="66" fill="#fff">A</text>
            <rect x="93" y="47" width="24" height="24" rx="4" fill="#6aaa64" /><text x="105" y="66" fill="#fff">N</text>
            <rect x="121" y="47" width="24" height="24" rx="4" fill="#6aaa64" /><text x="133" y="66" fill="#fff">E</text>
            <rect x="9" y="87" width="24" height="24" rx="4" fill="#fff" stroke="#d8cbb4" strokeWidth="2" />
            <rect x="37" y="87" width="24" height="24" rx="4" fill="#fff" stroke="#d8cbb4" strokeWidth="2" />
            <rect x="65" y="87" width="24" height="24" rx="4" fill="#fff" stroke="#d8cbb4" strokeWidth="2" />
            <rect x="93" y="87" width="24" height="24" rx="4" fill="#fff" stroke="#d8cbb4" strokeWidth="2" />
            <rect x="121" y="87" width="24" height="24" rx="4" fill="#fff" stroke="#d8cbb4" strokeWidth="2" />
          </g>
        </svg>
      );
    case "trivia":
      return (
        <svg width="168" height="150" viewBox="0 0 120 108" aria-hidden="true">
          <path d="M14 12 h92 a8 8 0 0 1 8 8 v44 a8 8 0 0 1 -8 8 H48 l-20 20 v-20 H14 a8 8 0 0 1 -8 -8 V20 a8 8 0 0 1 8 -8 z" fill="#fff" stroke="#e07856" strokeWidth="3" />
          <text x="60" y="60" fontSize="44" fontWeight="bold" fill="#e07856" textAnchor="middle">?</text>
          <circle cx="30" cy="97" r="5" fill="#6aaa64" />
          <circle cx="60" cy="97" r="5" fill="#c9b458" />
          <circle cx="90" cy="97" r="5" fill="#4361EE" />
        </svg>
      );
  }
}
