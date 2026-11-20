import { GameShell } from "@/plugins/games/shell";
import { WordleGame } from "@/plugins/games/wordle/WordleGame";
import "@/plugins/games/wordle/wordle.css";

export default function WordlePage() {
  return (
    <GameShell gameId="wordle">
      <WordleGame />
    </GameShell>
  );
}
