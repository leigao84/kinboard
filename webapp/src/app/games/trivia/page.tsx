import { GameShell } from "@/plugins/games/shell";
import { TriviaGame } from "@/plugins/games/trivia/TriviaGame";
import "@/plugins/games/trivia/trivia.css";

export default function TriviaPage() {
  return (
    <GameShell gameId="trivia">
      <TriviaGame />
    </GameShell>
  );
}
