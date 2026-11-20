"use client";

import { useEffect, useRef } from "react";
import bankJson from "./bank.json";

/**
 * Trivia, ported from the family's standalone games site into the
 * Games plugin. Same game: pick a category and difficulty, answer
 * 10 questions, streaks earn bonus points. The question bank is
 * the Open Trivia Database set (CC BY-SA 4.0) baked into the app
 * in ./bank.json — the same bank the screensaver draws from, in
 * the fuller shape the game needs (difficulty + wrong answers,
 * which the screensaver's slimmer copy doesn't carry). No network.
 */
export function TriviaGame() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    return initTrivia(rootRef.current);
  }, []);

  return (
    <div ref={rootRef} className="kb-game kb-game-trivia">
      <div className="panel" id="setupPanel">
        <div className="setuprow">
          <label htmlFor="catSel">Category</label>
          <select id="catSel"></select>
        </div>
        <div className="setuprow">
          <label htmlFor="diffSel">Difficulty</label>
          <select id="diffSel" defaultValue="any">
            <option value="any">Any difficulty</option>
            <option value="0">Easy</option>
            <option value="1">Medium</option>
            <option value="2">Hard</option>
          </select>
        </div>
        <button id="startBtn">▶ Start — 10 questions</button>
        <div className="banknote" id="bankNote"></div>
      </div>

      <div className="panel" id="gamePanel" style={{ display: "none" }}>
        <div className="topbar">
          <span>Question <b id="qnum">1</b> of 10</span>
          <span>Score <b id="score">0</b></span>
          <span id="streak"></span>
        </div>
        <div className="progress"><div id="pbar" style={{ width: "0%" }}></div></div>
        <div className="chips"><span className="chip" id="chipCat"></span><span className="chip" id="chipDiff"></span></div>
        <div id="qtext"></div>
        <div className="answers" id="answers"></div>
        <div id="feedback"></div>
        <button id="nextBtn">Next →</button>
      </div>

      <div className="panel" id="endPanel" style={{ display: "none" }}>
        <div className="big" id="endTitle">🎉</div>
        <div className="score" id="endScore"></div>
        <div className="sub" id="endSub"></div>
        <div className="row">
          <button id="againBtn">↻ Play again</button>
          <button id="changeBtn" className="ghost">Change category</button>
        </div>
      </div>

      <div className="how"><b>How to play:</b> pick a category and difficulty, then answer 10 questions.
      Right answers earn 100 points, and streaks earn bonus points — how long a streak can you build?
      Questions are drawn from the Open Trivia Database (CC BY-SA 4.0) and won&apos;t repeat until you&apos;ve seen them all.</div>
    </div>
  );
}

type TriviaBank = {
  cats: string[];
  /** [category, difficulty, question, correct, wrong, wrong, wrong] */
  qs: [number, number, string, string, string, string, string][];
};
const QBANK = bankJson as unknown as TriviaBank;

function initTrivia(root: HTMLElement) {
  const el = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>("#" + id)!;

  const DIFFNAMES = ["Easy", "Medium", "Hard"];
  const LETTERS = ["A", "B", "C", "D"];
  const catSel = el<HTMLSelectElement>("catSel");
  const diffSel = el<HTMLSelectElement>("diffSel");
  const setupPanel = el("setupPanel");
  const gamePanel = el("gamePanel");
  const endPanel = el("endPanel");

  /* Category picker, with question counts */
  {
    const counts = QBANK.cats.map(() => 0);
    QBANK.qs.forEach(q => counts[q[0]]++);
    const any = document.createElement("option");
    any.value = "any";
    any.textContent = `Any category (${QBANK.qs.length} questions)`;
    catSel.appendChild(any);
    QBANK.cats.forEach((name, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = `${name.replace(/^Entertainment: |^Science: /, "")} (${counts[i]})`;
      catSel.appendChild(o);
    });
    el("bankNote").textContent =
      `${QBANK.qs.length.toLocaleString()} questions in the bank · ${QBANK.cats.length} categories`;
  }

  function shuffled<T>(a: T[]): T[] {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* Seen-tracking: don't repeat questions until the pool runs dry. */
  function loadSeen(): Set<number> {
    try { return new Set(JSON.parse(localStorage.getItem("triviaseen") || "[]")); }
    catch { return new Set(); }
  }
  function saveSeen(seen: Set<number>) {
    let arr = [...seen];
    if (arr.length > 4000) arr = arr.slice(arr.length - 4000);
    localStorage.setItem("triviaseen", JSON.stringify(arr));
  }

  type GameState = {
    picks: number[]; at: number; score: number; correct: number;
    streak: number; bestStreak: number; locked: boolean;
  };
  let game: GameState | null = null;
  const timeouts: ReturnType<typeof setTimeout>[] = [];
  const later = (fn: () => void, ms: number) => { timeouts.push(setTimeout(fn, ms)); };

  function startGame() {
    const cat = catSel.value, diff = diffSel.value;
    let pool = QBANK.qs.map((q, i) => i).filter(i => {
      const q = QBANK.qs[i];
      return (cat === "any" || q[0] === +cat) && (diff === "any" || q[1] === +diff);
    });
    const seen = loadSeen();
    let fresh = pool.filter(i => !seen.has(i));
    if (fresh.length < 10) { pool.forEach(i => seen.delete(i)); fresh = pool; }
    const picks = shuffled(fresh).slice(0, 10);
    picks.forEach(i => seen.add(i));
    saveSeen(seen);
    game = { picks, at: 0, score: 0, correct: 0, streak: 0, bestStreak: 0, locked: false };
    setupPanel.style.display = "none";
    endPanel.style.display = "none";
    gamePanel.style.display = "block";
    showQuestion();
  }

  function showQuestion() {
    const g = game!;
    const q = QBANK.qs[g.picks[g.at]];
    g.locked = false;
    el("qnum").textContent = String(g.at + 1);
    el("score").textContent = String(g.score);
    el("streak").textContent = g.streak >= 2 ? `🔥 streak ${g.streak}` : "";
    (el("pbar") as HTMLElement).style.width = (g.at / 10 * 100) + "%";
    el("chipCat").textContent = QBANK.cats[q[0]].replace(/^Entertainment: |^Science: /, "");
    el("chipDiff").textContent = DIFFNAMES[q[1]];
    el("qtext").textContent = q[2];
    el("feedback").textContent = "";
    const nextBtn = el<HTMLButtonElement>("nextBtn");
    nextBtn.style.display = "none";
    const answers = shuffled([
      { text: q[3], right: true },
      { text: q[4], right: false },
      { text: q[5], right: false },
      { text: q[6], right: false },
    ]);
    const box = el("answers");
    box.innerHTML = "";
    answers.forEach((a, i) => {
      const b = document.createElement("button");
      b.className = "ans";
      const letter = document.createElement("span");
      letter.className = "letter";
      letter.textContent = LETTERS[i];
      b.appendChild(letter);
      b.appendChild(document.createTextNode(a.text));
      b.addEventListener("click", () => answer(b, a.right, answers));
      box.appendChild(b);
    });
  }

  function answer(btn: HTMLButtonElement, right: boolean, answers: { text: string; right: boolean }[]) {
    const g = game!;
    if (g.locked) return;
    g.locked = true;
    const buttons = [...el("answers").children] as HTMLButtonElement[];
    buttons.forEach((b, i) => {
      b.disabled = true;
      if (answers[i].right) b.classList.add("right");
      else if (b === btn) b.classList.add("wrong");
      else b.classList.add("dim");
    });
    const fb = el("feedback");
    if (right) {
      g.streak++;
      g.bestStreak = Math.max(g.bestStreak, g.streak);
      const gain = 100 + 10 * (g.streak - 1);
      g.score += gain;
      g.correct++;
      fb.textContent = g.streak >= 2 ? `✅ Correct! +${gain} (streak ${g.streak} 🔥)` : "✅ Correct! +100";
      fb.style.color = "#2f5d2a";
      blip(720);
    } else {
      g.streak = 0;
      fb.textContent = "❌ Not quite — the green one is right.";
      fb.style.color = "#8c2b2e";
      blip(210);
    }
    el("score").textContent = String(g.score);
    el("streak").textContent = g.streak >= 2 ? `🔥 streak ${g.streak}` : "";
    (el("pbar") as HTMLElement).style.width = ((g.at + 1) / 10 * 100) + "%";
    const nextBtn = el<HTMLButtonElement>("nextBtn");
    nextBtn.textContent = g.at === 9 ? "See your score →" : "Next →";
    nextBtn.style.display = "block";
  }

  function next() {
    const g = game!;
    g.at++;
    if (g.at >= 10) return endGame();
    showQuestion();
  }

  function endGame() {
    const g = game!;
    gamePanel.style.display = "none";
    endPanel.style.display = "block";
    const best = +(localStorage.getItem("triviabest") || 0);
    if (g.score > best) localStorage.setItem("triviabest", String(g.score));
    const titles: [number, string][] = [
      [10, "🏆 Perfect game!"],
      [8, "🎉 Brilliant!"],
      [6, "👏 Great job!"],
      [4, "🙂 Good effort!"],
      [0, "🌱 Keep practicing!"],
    ];
    el("endTitle").textContent = titles.find(t => g.correct >= t[0])![1];
    el("endScore").textContent =
      `${g.correct} of 10 correct · ${g.score} points`;
    el("endSub").textContent =
      `Best streak: ${g.bestStreak} 🔥 · All-time best score: ${Math.max(best, g.score)} points`;
    [523, 659, 784].forEach((f, k) => later(() => blip(f), k * 120));
  }

  let actx: AudioContext | null = null;
  function blip(freq: number) {
    try {
      actx = actx || new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = freq; o.type = "sine";
      g.gain.setValueAtTime(0.07, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.14);
      o.connect(g).connect(actx.destination);
      o.start(); o.stop(actx.currentTime + 0.15);
    } catch { /* sound is a bonus */ }
  }

  el("startBtn").addEventListener("click", startGame);
  el("nextBtn").addEventListener("click", next);
  el("againBtn").addEventListener("click", startGame);
  el("changeBtn").addEventListener("click", () => {
    endPanel.style.display = "none";
    setupPanel.style.display = "block";
  });

  return () => {
    timeouts.forEach(clearTimeout);
  };
}
