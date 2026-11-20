import { GameShell } from "@/plugins/games/shell";
import { SudokuGame } from "@/plugins/games/sudoku/SudokuGame";
import "@/plugins/games/sudoku/sudoku.css";

export default function SudokuPage() {
  return (
    <GameShell gameId="sudoku">
      <SudokuGame />
    </GameShell>
  );
}
