import { GameShell } from "@/plugins/games/shell";
import { JigsawGame } from "@/plugins/games/jigsaw/JigsawGame";
import "@/plugins/games/jigsaw/jigsaw.css";

export default function JigsawPage() {
  return (
    <GameShell gameId="jigsaw">
      <JigsawGame />
    </GameShell>
  );
}
