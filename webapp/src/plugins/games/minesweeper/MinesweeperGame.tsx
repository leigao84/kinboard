"use client";

import { useEffect, useRef } from "react";

/**
 * Minesweeper, ported from the family's standalone games site
 * (where it lived as a single HTML file) into the Games plugin.
 * The game logic below is the original, unchanged; only the
 * element lookups are scoped to this component's root and the
 * page chrome (title, back link) is Kinboard's now.
 */
export function MinesweeperGame() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    return initMinesweeper(rootRef.current);
  }, []);

  return (
    <div ref={rootRef} className="kb-game kb-game-minesweeper">
      <div className="bar">
        <select id="diff" aria-label="Difficulty" defaultValue="beginner">
          <option value="beginner">Beginner · 9×9</option>
          <option value="intermediate">Intermediate · 16×16</option>
          <option value="expert">Expert · 30×16</option>
        </select>
        <button id="flagMode" className="ghost">🚩 Flag mode: off</button>
      </div>

      <div className="panel">
        <span className="lcd" id="mineCount">010</span>
        <button id="face" title="New game">🙂</button>
        <span className="lcd" id="timer">000</span>
      </div>

      <div className="boardwrap"><div id="board"></div></div>

      <div id="banner"></div>

      <div className="how"><b>How to play:</b> tap a square to reveal it. Numbers tell you how many mines touch
      that square. Mark mines with a flag — right-click on a computer, or turn on 🚩 Flag mode and tap,
      or press-and-hold a square. Tap a number whose flags are all placed to clear the squares around it.
      Clear every safe square to win!</div>
    </div>
  );
}

type GameState = {
  cols: number; rows: number; mines: number; n: number;
  mine: boolean[]; count: number[]; open: boolean[]; flag: boolean[];
  placed: boolean; over: boolean; won: boolean; boomAt: number;
  openCount: number; flagCount: number;
};

function initMinesweeper(root: HTMLElement) {
  const el = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>("#" + id)!;

  const LEVELS: Record<string, { cols: number; rows: number; mines: number }> = {
    beginner: { cols: 9, rows: 9, mines: 10 },
    intermediate: { cols: 16, rows: 16, mines: 40 },
    expert: { cols: 30, rows: 16, mines: 99 },
  };

  function neighborsOf(i: number, cols: number, rows: number): number[] {
    const x = i % cols, y = Math.floor(i / cols), out: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) out.push(ny * cols + nx);
    }
    return out;
  }

  /* Game state: mine[] placed lazily on the first reveal so the first
     tap (and its neighbors) are always safe. */
  function createGame(cols: number, rows: number, mines: number): GameState {
    const n = cols * rows;
    return {
      cols, rows, mines, n,
      mine: new Array(n).fill(false),
      count: new Array(n).fill(0),
      open: new Array(n).fill(false),
      flag: new Array(n).fill(false),
      placed: false, over: false, won: false, boomAt: -1,
      openCount: 0, flagCount: 0,
    };
  }

  function placeMines(G: GameState, safeIdx: number) {
    const banned = new Set([safeIdx, ...neighborsOf(safeIdx, G.cols, G.rows)]);
    const spots: number[] = [];
    for (let i = 0; i < G.n; i++) if (!banned.has(i)) spots.push(i);
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    spots.slice(0, G.mines).forEach(i => G.mine[i] = true);
    for (let i = 0; i < G.n; i++) {
      G.count[i] = neighborsOf(i, G.cols, G.rows).filter(j => G.mine[j]).length;
    }
    G.placed = true;
  }

  /* Reveal a cell (flood-filling empties). Returns "mine" if it blew up. */
  function reveal(G: GameState, i: number): string {
    if (G.over || G.flag[i] || G.open[i]) return "noop";
    if (!G.placed) placeMines(G, i);
    if (G.mine[i]) {
      G.open[i] = true; G.boomAt = i; G.over = true;
      return "mine";
    }
    const stack = [i];
    while (stack.length) {
      const cur = stack.pop()!;
      if (G.open[cur] || G.flag[cur] || G.mine[cur]) continue;
      G.open[cur] = true; G.openCount++;
      if (G.count[cur] === 0) {
        for (const nb of neighborsOf(cur, G.cols, G.rows)) if (!G.open[nb]) stack.push(nb);
      }
    }
    if (G.openCount === G.n - G.mines) { G.won = true; G.over = true; }
    return "ok";
  }

  /* Tap on an open number: if its flags are all placed, reveal the rest. */
  function chord(G: GameState, i: number): string {
    if (G.over || !G.open[i] || G.count[i] === 0) return "noop";
    const nbs = neighborsOf(i, G.cols, G.rows);
    const flags = nbs.filter(j => G.flag[j]).length;
    if (flags !== G.count[i]) return "noop";
    for (const j of nbs) {
      if (!G.flag[j] && !G.open[j]) {
        if (reveal(G, j) === "mine") return "mine";
      }
    }
    return "ok";
  }

  function toggleFlag(G: GameState, i: number): boolean {
    if (G.over || G.open[i]) return false;
    G.flag[i] = !G.flag[i];
    G.flagCount += G.flag[i] ? 1 : -1;
    return true;
  }

  /* ---- UI ---- */
  const boardEl = el("board");
  const mineEl = el("mineCount");
  const timerEl = el("timer");
  const faceEl = el<HTMLButtonElement>("face");
  const bannerEl = el("banner");
  const flagBtn = el<HTMLButtonElement>("flagMode");
  const diffEl = el<HTMLSelectElement>("diff");

  let G: GameState = createGame(9, 9, 10), flagMode = false, seconds = 0, timerId: ReturnType<typeof setInterval> | null = null, started = false;

  function fmt(v: number) { return String(Math.max(-99, Math.min(999, v))).padStart(3, "0"); }

  function render() {
    boardEl.style.gridTemplateColumns = `repeat(${G.cols}, var(--cell))`;
    boardEl.innerHTML = "";
    for (let i = 0; i < G.n; i++) {
      const b = document.createElement("button");
      b.className = "cell";
      b.dataset.i = String(i);
      if (G.open[i]) {
        b.classList.add("open");
        if (G.mine[i]) { b.classList.add(i === G.boomAt ? "boom" : "mine"); b.textContent = "💣"; }
        else if (G.count[i] > 0) { b.classList.add("n" + G.count[i]); b.textContent = String(G.count[i]); }
      } else if (G.flag[i]) {
        b.classList.add("flag");
        b.textContent = (G.over && !G.mine[i]) ? "💣" : "🚩";
        if (G.over && !G.mine[i]) b.classList.add("wrongflag");
      } else if (G.over && G.mine[i]) {
        b.classList.add("open", "mine");
        b.textContent = "💣";
      }
      boardEl.appendChild(b);
    }
    mineEl.textContent = fmt(G.mines - G.flagCount);
    faceEl.textContent = G.won ? "😎" : G.over ? "😵" : "🙂";
  }

  function startTimer() {
    if (timerId) return;
    timerId = setInterval(() => {
      seconds++;
      timerEl.textContent = fmt(seconds);
      if (seconds >= 999) stopTimer();
    }, 1000);
  }
  function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }

  function endBanner() {
    if (G.won) {
      const key = "minebest:" + diffEl.value;
      const prev = localStorage.getItem(key);
      if (!prev || seconds < +prev) localStorage.setItem(key, String(seconds));
      bannerEl.textContent = `🎉 You cleared the field in ${seconds} seconds!` +
        (prev && seconds >= +prev ? ` (best: ${prev}s)` : " A new best!");
    } else {
      bannerEl.textContent = "💥 Boom! Tap the face or pick a difficulty to try again.";
    }
    bannerEl.style.display = "block";
  }

  function afterAction(result: string) {
    if (!started && (result === "ok" || result === "mine")) { started = true; startTimer(); }
    render();
    if (G.over) { stopTimer(); endBanner(); }
  }

  function newGame() {
    const lv = LEVELS[diffEl.value];
    G = createGame(lv.cols, lv.rows, lv.mines);
    const cell = lv.cols <= 9 ? 38 : lv.cols <= 16 ? 32 : 26;
    boardEl.style.setProperty("--cell", cell + "px");
    seconds = 0; started = false;
    stopTimer();
    timerEl.textContent = "000";
    bannerEl.style.display = "none";
    render();
  }

  /* Pointer handling: tap = reveal (or flag in flag mode), right-click =
     flag, press-and-hold = flag. A long-press sets suppressClick so the
     release doesn't also reveal. */
  let pressTimer: ReturnType<typeof setTimeout> | null = null, suppressClick = false;
  boardEl.addEventListener("contextmenu", e => {
    e.preventDefault();
    const i = +(e.target as HTMLElement).dataset?.i!;
    if (Number.isInteger(i) && toggleFlag(G, i)) render();
  });
  boardEl.addEventListener("pointerdown", e => {
    const i = +(e.target as HTMLElement).dataset?.i!;
    if (!Number.isInteger(i) || G.over) return;
    suppressClick = false;
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      if (toggleFlag(G, i)) { suppressClick = true; blip(500); render(); }
    }, 550);
  });
  boardEl.addEventListener("pointerup", e => {
    if (pressTimer) clearTimeout(pressTimer);
    if (suppressClick) { suppressClick = false; return; }
    const i = +(e.target as HTMLElement).dataset?.i!;
    if (!Number.isInteger(i) || G.over) return;
    if (flagMode) { if (toggleFlag(G, i)) { blip(500); render(); } return; }
    if (G.open[i]) afterAction(chord(G, i));
    else if (!G.flag[i]) afterAction(reveal(G, i));
  });
  boardEl.addEventListener("pointerleave", () => { if (pressTimer) clearTimeout(pressTimer); });

  flagBtn.addEventListener("click", () => {
    flagMode = !flagMode;
    flagBtn.textContent = "🚩 Flag mode: " + (flagMode ? "on" : "off");
    flagBtn.classList.toggle("on", flagMode);
  });
  faceEl.addEventListener("click", newGame);
  diffEl.addEventListener("change", newGame);

  let actx: AudioContext | null = null;
  function blip(freq: number) {
    try {
      actx = actx || new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = freq; o.type = "sine";
      g.gain.setValueAtTime(0.06, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.12);
      o.connect(g).connect(actx.destination);
      o.start(); o.stop(actx.currentTime + 0.13);
    } catch { /* sound is a bonus */ }
  }

  newGame();

  return () => {
    stopTimer();
    if (pressTimer) clearTimeout(pressTimer);
  };
}
