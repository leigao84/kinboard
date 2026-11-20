import { GameShell } from "@/plugins/games/shell";
import { SolitaireGame } from "@/plugins/games/solitaire/SolitaireGame";
import "@/plugins/games/solitaire/solitaire.css";

export default function SolitairePage() {
  return (
    <GameShell gameId="solitaire">
      <SolitaireGame />
    </GameShell>
  );
}
