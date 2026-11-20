import { GameShell } from "@/plugins/games/shell";
import { MinesweeperGame } from "@/plugins/games/minesweeper/MinesweeperGame";
import "@/plugins/games/minesweeper/minesweeper.css";

export default function MinesweeperPage() {
  return (
    <GameShell gameId="minesweeper">
      <MinesweeperGame />
    </GameShell>
  );
}
