"use client";

import { useEffect, useRef } from "react";

/**
 * Sudoku, ported from the family's standalone games site into the
 * Games plugin. The generator/solver below is the original,
 * unchanged (fill a solution, dig mirrored holes, prove uniqueness
 * by counting); only element lookups are scoped to this component
 * and the page chrome is Kinboard's.
 */
export function SudokuGame() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    return initSudoku(rootRef.current);
  }, []);

  return (
    <div ref={rootRef} className="kb-game kb-game-sudoku">
      <div className="bar">
        <select id="diff" aria-label="Difficulty" defaultValue="easy">
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <button id="newBtn">🔀 New puzzle</button>
        <button id="notesBtn" className="ghost">✏️ Notes: off</button>
        <button id="eraseBtn" className="ghost">⌫ Erase</button>
      </div>

      <div className="stats">
        <span>⏱️ <b id="time">0:00</b></span>
        <span>Mistakes <b id="mistakes">0</b></span>
        <span>Best <b id="best">—</b></span>
      </div>

      <div id="board"></div>
      <div id="pad"></div>
      <div id="msg"></div>

      <div id="win">
        <div className="big">🎉 Solved!</div>
        <div id="winText"></div>
        <div style={{ marginTop: 10 }}><button id="againBtn">Play again</button></div>
      </div>

      <div className="how"><b>How to play:</b> tap a square, then tap a number. Turn on ✏️ Notes to pencil in
      possibilities first. Wrong numbers turn red — there's no limit, just see how few mistakes you can make.
      You can also type with a keyboard (1–9, arrows to move, N for notes).</div>
    </div>
  );
}

function initSudoku(root: HTMLElement) {
  const el = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>("#" + id)!;

  /* ---- Sudoku engine: generator, solver, uniqueness check ---- */
  function shuffled(a: number[]): number[] {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const UNITS = (() => {
    const units: number[][] = [];
    for (let r = 0; r < 9; r++) units.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
    for (let c = 0; c < 9; c++) units.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
    for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++) {
      const box: number[] = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) box.push((br * 3 + r) * 9 + bc * 3 + c);
      units.push(box);
    }
    return units;
  })();
  const PEERS: number[][] = (() => {
    const peers = Array.from({ length: 81 }, () => new Set<number>());
    for (const u of UNITS) for (const i of u) for (const j of u) if (i !== j) peers[i].add(j);
    return peers.map(s => [...s]);
  })();

  function candidates(grid: number[], i: number): number[] {
    const used = new Set<number>();
    for (const p of PEERS[i]) if (grid[p]) used.add(grid[p]);
    const out: number[] = [];
    for (let v = 1; v <= 9; v++) if (!used.has(v)) out.push(v);
    return out;
  }

  /* Fill an empty grid into a complete valid solution (randomized). */
  function fillGrid(grid: number[]): boolean {
    let best = -1, bestCands: number[] | null = null;
    for (let i = 0; i < 81; i++) {
      if (grid[i]) continue;
      const c = candidates(grid, i);
      if (!c.length) return false;
      if (!bestCands || c.length < bestCands.length) { best = i; bestCands = c; if (c.length === 1) break; }
    }
    if (best === -1) return true;
    for (const v of shuffled(bestCands!)) {
      grid[best] = v;
      if (fillGrid(grid)) return true;
      grid[best] = 0;
    }
    return false;
  }

  /* Count solutions, stopping at `limit` — used to prove uniqueness. */
  function countSolutions(grid: number[], limit: number): number {
    let best = -1, bestCands: number[] | null = null;
    for (let i = 0; i < 81; i++) {
      if (grid[i]) continue;
      const c = candidates(grid, i);
      if (!c.length) return 0;
      if (!bestCands || c.length < bestCands.length) { best = i; bestCands = c; if (c.length === 1) break; }
    }
    if (best === -1) return 1;
    let total = 0;
    for (const v of bestCands!) {
      grid[best] = v;
      total += countSolutions(grid, limit - total);
      grid[best] = 0;
      if (total >= limit) break;
    }
    return total;
  }

  /* Generate a puzzle: fill a solution, then dig holes in mirrored
     pairs, keeping the solution unique. Returns { puzzle, solution }. */
  function generatePuzzle(givensTarget: number): { puzzle: number[]; solution: number[] } {
    const solution = new Array(81).fill(0);
    fillGrid(solution);
    const puzzle = solution.slice();
    let givens = 81;
    const order = shuffled([...Array(81).keys()]);
    for (const i of order) {
      if (givens <= givensTarget) break;
      const j = 80 - i; // mirror partner
      const cells = i === j ? [i] : [i, j];
      if (cells.some(k => !puzzle[k])) continue;
      const backup = cells.map(k => puzzle[k]);
      cells.forEach(k => puzzle[k] = 0);
      if (countSolutions(puzzle.slice(), 2) === 1) {
        givens -= cells.length;
      } else {
        cells.forEach((k, t) => puzzle[k] = backup[t]);
      }
    }
    return { puzzle, solution };
  }

  /* ---- Game state & UI ---- */
  const GIVENS: Record<string, number> = { easy: 40, medium: 32, hard: 27 };
  const boardEl = el("board");
  const timeEl = el("time");
  const mistakesEl = el("mistakes");
  const bestEl = el("best");
  const msgEl = el("msg");
  const winEl = el("win");
  const notesBtn = el<HTMLButtonElement>("notesBtn");
  const diffEl = el<HTMLSelectElement>("diff");

  let solution: number[] = [], given: boolean[] = [], value: number[] = [], notes: Set<number>[] = [], sel = -1, notesMode = false;
  let mistakes = 0, seconds = 0, timerId: ReturnType<typeof setInterval> | null = null, over = false;
  let genTimeout: ReturnType<typeof setTimeout> | null = null;

  function fmtTime(s: number) { return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

  function startTimer() {
    stopTimer();
    timerId = setInterval(() => { seconds++; timeEl.textContent = fmtTime(seconds); }, 1000);
  }
  function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }

  function conflicts(i: number) {
    if (!value[i]) return false;
    return PEERS[i].some(p => value[p] === value[i]);
  }

  function render() {
    boardEl.innerHTML = "";
    const selVal = sel >= 0 ? value[sel] : 0;
    for (let i = 0; i < 81; i++) {
      const d = document.createElement("div");
      d.className = "cell";
      d.dataset.i = String(i);
      if (given[i]) d.classList.add("given");
      else if (value[i]) d.classList.add("user");
      if (sel >= 0 && i !== sel) {
        if (PEERS[sel].includes(i)) d.classList.add("peer");
        if (selVal && value[i] === selVal) d.classList.add("same");
      }
      if (i === sel) d.classList.add("sel");
      if (conflicts(i)) d.classList.add("bad");
      if (value[i]) d.textContent = String(value[i]);
      else if (notes[i] && notes[i].size) {
        const g = document.createElement("div");
        g.className = "notes";
        for (let v = 1; v <= 9; v++) {
          const s = document.createElement("span");
          s.textContent = notes[i].has(v) ? String(v) : "";
          g.appendChild(s);
        }
        d.appendChild(g);
      }
      boardEl.appendChild(d);
    }
    mistakesEl.textContent = String(mistakes);
  }

  function checkWin() {
    for (let i = 0; i < 81; i++) if (value[i] !== solution[i]) return;
    over = true;
    stopTimer();
    const key = "sudokubest:" + diffEl.value;
    const prev = localStorage.getItem(key);
    if (!prev || seconds < +prev) localStorage.setItem(key, String(seconds));
    el("winText").textContent =
      `Finished in ${fmtTime(seconds)} with ${mistakes} mistake${mistakes === 1 ? "" : "s"}.`;
    winEl.style.display = "block";
    showBest();
  }

  function showBest() {
    const best = localStorage.getItem("sudokubest:" + diffEl.value);
    bestEl.textContent = best ? fmtTime(+best) : "—";
  }

  function input(v: number) {
    if (over || sel < 0 || given[sel]) return;
    if (notesMode) {
      if (!value[sel]) {
        notes[sel].has(v) ? notes[sel].delete(v) : notes[sel].add(v);
        render();
      }
      return;
    }
    value[sel] = v;
    notes[sel].clear();
    if (v !== solution[sel]) { mistakes++; msgEl.textContent = "That one doesn't fit — it turned red."; }
    else msgEl.textContent = "";
    render();
    checkWin();
  }

  function erase() {
    if (over || sel < 0 || given[sel]) return;
    value[sel] = 0;
    notes[sel].clear();
    msgEl.textContent = "";
    render();
  }

  function newGame() {
    const diff = diffEl.value;
    msgEl.textContent = "Making your puzzle…";
    // Generation can take a moment on Hard; let the message paint first.
    if (genTimeout) clearTimeout(genTimeout);
    genTimeout = setTimeout(() => {
      const g = generatePuzzle(GIVENS[diff]);
      solution = g.solution;
      given = g.puzzle.map(v => v !== 0);
      value = g.puzzle.slice();
      notes = Array.from({ length: 81 }, () => new Set<number>());
      sel = -1; mistakes = 0; seconds = 0; over = false;
      timeEl.textContent = "0:00";
      winEl.style.display = "none";
      msgEl.textContent = "";
      render();
      showBest();
      startTimer();
    }, 30);
  }

  boardEl.addEventListener("click", e => {
    const cell = (e.target as HTMLElement).closest(".cell") as HTMLElement | null;
    const i = +(cell?.dataset.i ?? NaN);
    if (Number.isInteger(i)) { sel = i; render(); }
  });

  /* Number pad */
  const padEl = el("pad");
  for (let v = 1; v <= 9; v++) {
    const b = document.createElement("button");
    b.textContent = String(v);
    b.classList.add("ghost");
    b.addEventListener("click", () => input(v));
    padEl.appendChild(b);
  }

  notesBtn.addEventListener("click", () => {
    notesMode = !notesMode;
    notesBtn.textContent = "✏️ Notes: " + (notesMode ? "on" : "off");
    notesBtn.classList.toggle("on", notesMode);
  });
  el("eraseBtn").addEventListener("click", erase);
  el("newBtn").addEventListener("click", newGame);
  el("againBtn").addEventListener("click", newGame);
  diffEl.addEventListener("change", newGame);

  function onKeydown(e: KeyboardEvent) {
    if (e.key >= "1" && e.key <= "9") input(+e.key);
    else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") erase();
    else if (e.key.toLowerCase() === "n") notesBtn.click();
    else if (sel >= 0 && e.key.startsWith("Arrow")) {
      e.preventDefault();
      const r = Math.floor(sel / 9), c = sel % 9;
      if (e.key === "ArrowUp" && r > 0) sel -= 9;
      if (e.key === "ArrowDown" && r < 8) sel += 9;
      if (e.key === "ArrowLeft" && c > 0) sel -= 1;
      if (e.key === "ArrowRight" && c < 8) sel += 1;
      render();
    }
  }
  document.addEventListener("keydown", onKeydown);

  newGame();

  return () => {
    stopTimer();
    if (genTimeout) clearTimeout(genTimeout);
    document.removeEventListener("keydown", onKeydown);
  };
}
