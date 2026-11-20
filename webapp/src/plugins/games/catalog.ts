/**
 * The games on the shelf, in the order the hub shows them. The hub,
 * the settings page and the specs all read this one list, so a game
 * added here (with its route and component) appears everywhere.
 *
 * Pixel Puzzle is deliberately absent: it was shelved by the family
 * and stays only on the old standalone site.
 */
export const GAMES = [
  { id: "jigsaw", href: "/games/jigsaw" },
  { id: "minesweeper", href: "/games/minesweeper" },
  { id: "sudoku", href: "/games/sudoku" },
  { id: "wordle", href: "/games/wordle" },
  { id: "trivia", href: "/games/trivia" },
] as const;

export type GameId = (typeof GAMES)[number]["id"];
