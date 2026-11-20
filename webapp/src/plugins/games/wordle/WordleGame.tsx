"use client";

import { useEffect, useRef } from "react";
import { WORDLE_ANSWERS, WORDLE_ALLOWED_EXTRA } from "./word-lists";

/**
 * Wordle, ported from the family's standalone games site into the
 * Games plugin. Same real word lists (in ./word-lists, baked into
 * the bundle), same two-pass scoring, a fresh random word every
 * game. Only element lookups are scoped to this component and the
 * page chrome is Kinboard's.
 */
export function WordleGame() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    return initWordle(rootRef.current);
  }, []);

  return (
    <div ref={rootRef} className="kb-game kb-game-wordle">
      <div className="bar">
        <button id="newBtn">🔀 New word</button>
      </div>
      <div className="stats">
        <span>Played <b id="stPlayed">0</b></span>
        <span>Won <b id="stWon">0</b></span>
        <span>Streak <b id="stStreak">0</b></span>
        <span>Best streak <b id="stBest">0</b></span>
      </div>

      <div id="msg"></div>
      <div id="grid"></div>
      <div id="keys"></div>
      <div id="banner"></div>

      <div className="how"><b>How to play:</b> type a five-letter word (tap the letters or use your keyboard) and press Enter.
      <b style={{ color: "#6aaa64" }}>Green</b> = right letter, right spot. <b style={{ color: "#b39a2e" }}>Yellow</b> = right letter, wrong spot.
      <b style={{ color: "#787c7e" }}>Gray</b> = not in the word. Uses the real Wordle word lists — over 2,300 possible answers
      and nearly 13,000 accepted guesses.</div>
    </div>
  );
}

function initWordle(root: HTMLElement) {
  const el = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>("#" + id)!;

  const ANSWERS = WORDLE_ANSWERS;
  const VALID = new Set(ANSWERS);
  WORDLE_ALLOWED_EXTRA.forEach(w => VALID.add(w));

  /* Two-pass scoring: greens first, then yellows limited by how many
     of that letter remain in the answer. 2 = green, 1 = yellow, 0 = gray. */
  function scoreGuess(guess: string, answer: string): number[] {
    const res = [0, 0, 0, 0, 0], rest: Record<string, number> = {};
    for (let i = 0; i < 5; i++) {
      if (guess[i] === answer[i]) res[i] = 2;
      else rest[answer[i]] = (rest[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < 5; i++) {
      if (res[i] === 2) continue;
      if (rest[guess[i]] > 0) { res[i] = 1; rest[guess[i]]--; }
    }
    return res;
  }

  const gridEl = el("grid");
  const keysEl = el("keys");
  const msgEl = el("msg");
  const bannerEl = el("banner");

  let answer = "", row = 0, col = 0, over = false, flipping = false;
  let board: string[][] = [], keyState: Record<string, string> = {};
  const rowsEls: HTMLDivElement[] = [];
  const timeouts: ReturnType<typeof setTimeout>[] = [];
  const later = (fn: () => void, ms: number) => { timeouts.push(setTimeout(fn, ms)); };

  for (let r = 0; r < 6; r++) {
    const rowEl = document.createElement("div");
    rowEl.className = "row";
    const tiles: string[] = [];
    for (let c = 0; c < 5; c++) {
      const t = document.createElement("div");
      t.className = "tile";
      rowEl.appendChild(t);
      tiles.push("");
    }
    gridEl.appendChild(rowEl);
    rowsEls.push(rowEl);
    board.push(tiles);
  }

  const KEYROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  const keyEls: Record<string, HTMLButtonElement> = {};
  KEYROWS.forEach((letters, ri) => {
    const kr = document.createElement("div");
    kr.className = "krow";
    if (ri === 2) kr.appendChild(makeKey("Enter", "Enter", true));
    for (const ch of letters) kr.appendChild(makeKey(ch, ch, false));
    if (ri === 2) kr.appendChild(makeKey("⌫", "Backspace", true));
    keysEl.appendChild(kr);
  });
  function makeKey(label: string, value: string, wide: boolean): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = "key" + (wide ? " wide" : "");
    b.textContent = label;
    b.addEventListener("click", () => press(value));
    if (!wide) keyEls[value] = b;
    return b;
  }

  type Stats = { played: number; wins: number; streak: number; best: number };
  function stats(): Stats {
    try { return JSON.parse(localStorage.getItem("wordlestats") || "null") || { played: 0, wins: 0, streak: 0, best: 0 }; }
    catch { return { played: 0, wins: 0, streak: 0, best: 0 }; }
  }
  function showStats() {
    const s = stats();
    el("stPlayed").textContent = String(s.played);
    el("stWon").textContent = String(s.wins);
    el("stStreak").textContent = String(s.streak);
    el("stBest").textContent = String(s.best);
  }
  function recordGame(wonGame: boolean) {
    const s = stats();
    s.played++;
    if (wonGame) { s.wins++; s.streak++; s.best = Math.max(s.best, s.streak); }
    else s.streak = 0;
    localStorage.setItem("wordlestats", JSON.stringify(s));
    showStats();
  }

  function say(text: string) { msgEl.textContent = text; }

  function press(key: string) {
    if (over || flipping) return;
    if (key === "Enter") return submit();
    if (key === "Backspace") {
      if (col > 0) { col--; board[row][col] = ""; paint(); }
      return;
    }
    if (/^[a-z]$/.test(key) && col < 5) {
      board[row][col] = key;
      col++;
      paint();
    }
  }

  function paint() {
    for (let c = 0; c < 5; c++) {
      const t = rowsEls[row].children[c] as HTMLElement;
      t.textContent = board[row][c];
      t.classList.toggle("filled", !!board[row][c]);
    }
  }

  function submit() {
    const guess = board[row].join("");
    if (guess.length < 5) { say("Not enough letters"); shake(); return; }
    if (!VALID.has(guess)) { say("Not in the word list"); shake(); return; }
    say("");
    const scores = scoreGuess(guess, answer);
    flipping = true;
    scores.forEach((s, c) => {
      const t = rowsEls[row].children[c] as HTMLElement;
      later(() => t.classList.add("flip"), c * 160);
      later(() => {
        t.classList.add(s === 2 ? "g" : s === 1 ? "y" : "x");
        t.classList.remove("flip");
      }, c * 160 + 150);
    });
    later(() => {
      flipping = false;
      scores.forEach((s, c) => {
        const ch = guess[c];
        const cls = s === 2 ? "g" : s === 1 ? "y" : "x";
        const cur = keyState[ch];
        if (cls === "g" || (cls === "y" && cur !== "g") || (cls === "x" && !cur)) {
          keyState[ch] = cls;
          keyEls[ch].className = "key " + cls;
        }
      });
      if (guess === answer) return endGame(true);
      row++;
      col = 0;
      if (row === 6) return endGame(false);
    }, 5 * 160 + 200);
  }

  function shake() {
    const r = rowsEls[row];
    r.classList.remove("shake");
    void r.offsetWidth;
    r.classList.add("shake");
  }

  function endGame(wonGame: boolean) {
    over = true;
    recordGame(wonGame);
    bannerEl.textContent = wonGame
      ? `🎉 Got it in ${row + 1} — the word was ${answer.toUpperCase()}!`
      : `The word was ${answer.toUpperCase()}. Tap New word to try another!`;
    bannerEl.style.display = "block";
  }

  function newGame() {
    answer = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
    row = 0; col = 0; over = false; flipping = false; keyState = {};
    board = board.map(r => r.map(() => ""));
    rowsEls.forEach(r => {
      r.classList.remove("shake");
      [...r.children].forEach(t => { t.textContent = ""; t.className = "tile"; });
    });
    Object.values(keyEls).forEach(k => k.className = "key");
    bannerEl.style.display = "none";
    say("");
    showStats();
  }

  el("newBtn").addEventListener("click", newGame);
  function onKeydown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Enter" || e.key === "Backspace") press(e.key);
    else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toLowerCase());
  }
  document.addEventListener("keydown", onKeydown);

  newGame();

  return () => {
    timeouts.forEach(clearTimeout);
    document.removeEventListener("keydown", onKeydown);
  };
}
