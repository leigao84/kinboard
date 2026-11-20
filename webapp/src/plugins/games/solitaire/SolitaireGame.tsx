"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  RANK_LABELS,
  SUIT_GLYPHS,
  applyMove,
  cloneState,
  drawCards,
  findAutoMove,
  isRed,
  isWin,
  movingCards,
  newGame,
  popHistory,
  pushHistory,
  recycleStock,
} from "./logic";
import type { CardT, GameState, Source, Target } from "./logic";

/**
 * Klondike solitaire, written for the Games plugin (the shelf's
 * first card game). The rules live in ./logic as plain data; this
 * component draws them and reads the player's hands.
 *
 * The interaction model, built for a wall touchscreen:
 *   - Drag: press a face-up card (or the waste's top card) and
 *     move — the card, or the run it heads, follows the finger and
 *     drops where it lands legally, or snaps back.
 *   - Tap: tap a card to select it, tap a destination to move it
 *     there. Tapping a selected card again deselects it — unless
 *     the two taps land close together, which is a double-tap and
 *     sends the card home: its foundation if it fits, else the
 *     first tableau pile that takes it.
 *   - Tap the stock to draw; tap the empty stock to turn the
 *     waste back over.
 * One pointer system (pointerdown/move/up) serves mouse and touch
 * alike, with a small movement threshold so a tap never becomes
 * an accidental drag.
 */
export function SolitaireGame() {
  const t = useTranslations("games.solitaire");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    return initSolitaire(rootRef.current);
  }, []);

  return (
    <div ref={rootRef} className="kb-game kb-game-solitaire">
      <div className="bar">
        <button id="newBtn">🔀 {t("newGame")}</button>
        <span className="seg" role="group" aria-label={`${t("draw1")} / ${t("draw3")}`}>
          <button id="draw1Btn" className="ghost">{t("draw1")}</button>
          <button id="draw3Btn" className="ghost">{t("draw3")}</button>
        </span>
        <button id="undoBtn" className="ghost">↩ {t("undo")}</button>
      </div>

      <div className="stats">
        <span>⏱️ {t("time")} <b id="time">0:00</b></span>
        <span>{t("moves")} <b id="moves">0</b></span>
        <span>{t("best")} <b id="best">—</b></span>
      </div>

      <div id="table"></div>

      <div id="win">
        <div className="big">🎉 {t("won")}</div>
        <div id="winText"></div>
        <div style={{ marginTop: 10 }}><button id="againBtn">{t("newGame")}</button></div>
      </div>

      <div className="how">{t("how")}</div>
    </div>
  );
}

function initSolitaire(root: HTMLElement) {
  const el = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>("#" + id)!;
  const tableEl = el("table");
  const timeEl = el("time");
  const movesEl = el("moves");
  const bestEl = el("best");
  const winEl = el("win");
  const undoBtn = el<HTMLButtonElement>("undoBtn");
  const draw1Btn = el<HTMLButtonElement>("draw1Btn");
  const draw3Btn = el<HTMLButtonElement>("draw3Btn");

  /* ---- State ---- */
  let state: GameState = newGame();
  let history: GameState[] = [];
  let drawMode: 1 | 3 = localStorage.getItem("solitaire:draw") === "3" ? 3 : 1;
  let sel: Source | null = null;
  let selAt = 0; // when the current selection was tapped (double-tap detection)
  let seconds = 0;
  let over = false;
  let timerId: ReturnType<typeof setInterval> | null = null;

  // Layout metrics, recomputed by fit() whenever the table resizes.
  let cw = 90, ch = 126, gap = 10, fanX = 22;
  // The top offset of every card in every tableau pile, from the
  // last render — the drag layer stacks its cards the same way.
  let pileTops: number[][] = [];

  function fmtTime(s: number) {
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function startTimer() {
    stopTimer();
    timerId = setInterval(() => {
      seconds++;
      timeEl.textContent = fmtTime(seconds);
    }, 1000);
  }
  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  function showBest() {
    const best = localStorage.getItem("solitairebest:" + drawMode);
    bestEl.textContent = best ? fmtTime(+best) : "—";
  }

  /* ---- Rendering ---- */

  function cardEl(card: CardT): HTMLDivElement {
    const d = document.createElement("div");
    d.className = "card" + (card.faceUp ? " up" : " down") + (isRed(card.suit) ? " red" : " black");
    d.dataset.cid = String(card.id);
    if (card.faceUp) {
      const rank = RANK_LABELS[card.rank - 1];
      const glyph = SUIT_GLYPHS[card.suit];
      const tl = document.createElement("span");
      tl.className = "corner tl";
      tl.innerHTML = `<b>${rank}</b><i>${glyph}</i>`;
      const pip = document.createElement("span");
      pip.className = "pip";
      pip.textContent = glyph;
      const br = document.createElement("span");
      br.className = "corner br";
      br.innerHTML = `<b>${rank}</b><i>${glyph}</i>`;
      d.append(tl, pip, br);
    }
    return d;
  }

  function markSource(d: HTMLElement, source: Source) {
    d.dataset.zone = source.zone;
    if (source.zone !== "waste") d.dataset.pile = String(source.pile);
    if (source.zone === "tableau") d.dataset.index = String(source.index);
  }

  function sameSource(a: Source, b: Source): boolean {
    if (a.zone !== b.zone) return false;
    if (a.zone === "waste") return true;
    if (a.zone === "foundation" && b.zone === "foundation") return a.pile === b.pile;
    if (a.zone === "tableau" && b.zone === "tableau") return a.pile === b.pile && a.index === b.index;
    return false;
  }

  function fit() {
    const w = tableEl.clientWidth || 700;
    lastFitWidth = tableEl.clientWidth;
    gap = Math.max(6, Math.min(14, w * 0.014));
    cw = (w - 6 * gap) / 7;
    ch = cw * 1.4;
    fanX = cw * 0.24;
    tableEl.style.setProperty("--cw", cw + "px");
    tableEl.style.setProperty("--ch", ch + "px");
    tableEl.style.setProperty("--gap", gap + "px");
  }

  function render() {
    // A selection can go stale when the state changed under it.
    if (sel && !movingCards(state, sel)) sel = null;
    tableEl.innerHTML = "";
    pileTops = [];

    /* Top row: stock, waste, a breather, the four foundations. */
    const top = document.createElement("div");
    top.className = "toprow";

    const stockSlot = document.createElement("div");
    stockSlot.className = "slot stockslot";
    stockSlot.dataset.stock = "1";
    if (state.stock.length > 0) {
      const back = cardEl(state.stock[state.stock.length - 1]);
      back.dataset.stock = "1";
      stockSlot.appendChild(back);
    } else if (state.waste.length > 0) {
      const flip = document.createElement("div");
      flip.className = "recycle";
      flip.dataset.stock = "1";
      flip.textContent = "↻";
      stockSlot.appendChild(flip);
    } else {
      stockSlot.classList.add("empty");
    }
    top.appendChild(stockSlot);

    const wasteSlot = document.createElement("div");
    wasteSlot.className = "slot wasteslot";
    const shown = drawMode === 3 ? state.waste.slice(-3) : state.waste.slice(-1);
    shown.forEach((card, i) => {
      const d = cardEl(card);
      const isTop = i === shown.length - 1;
      d.style.left = i * fanX + "px";
      d.style.zIndex = String(i + 1);
      if (isTop) {
        markSource(d, { zone: "waste" });
        if (sel && sel.zone === "waste") d.classList.add("sel");
      } else {
        d.classList.add("under");
      }
      wasteSlot.appendChild(d);
    });
    top.appendChild(wasteSlot);

    top.appendChild(document.createElement("div")); // the breather column

    for (let s = 0; s < 4; s++) {
      const slot = document.createElement("div");
      slot.className = "slot fslot";
      slot.dataset.fslot = String(s);
      const pile = state.foundations[s];
      if (pile.length === 0) {
        const ghost = document.createElement("span");
        ghost.className = "ghostsuit" + (isRed(s as CardT["suit"]) ? " red" : " black");
        ghost.textContent = SUIT_GLYPHS[s];
        slot.appendChild(ghost);
      } else {
        const d = cardEl(pile[pile.length - 1]);
        markSource(d, { zone: "foundation", pile: s });
        d.dataset.fslot = String(s);
        if (sel && sel.zone === "foundation" && sel.pile === s) d.classList.add("sel");
        slot.appendChild(d);
      }
      top.appendChild(slot);
    }
    tableEl.appendChild(top);

    /* Tableau: seven columns of fanned cards. */
    const row = document.createElement("div");
    row.className = "tabrow";
    // The tallest pile gets a share of the screen; very long piles
    // fan tighter so the game stays on the board.
    const budget = Math.max(ch * 3.4, window.innerHeight - ch - 330);
    for (let p = 0; p < 7; p++) {
      const pile = state.tableau[p];
      const col = document.createElement("div");
      col.className = "col" + (pile.length === 0 ? " emptyslot" : "");
      col.dataset.tcol = String(p);
      const downCount = pile.filter((c) => !c.faceUp).length;
      const upCount = pile.length - downCount;
      const downFan = ch * 0.16;
      let upFan = ch * 0.3;
      const natural = ch + downCount * downFan + Math.max(0, upCount - 1) * upFan;
      if (natural > budget && upCount > 1) {
        upFan = Math.max(ch * 0.13, (budget - ch - downCount * downFan) / (upCount - 1));
      }
      const tops: number[] = [];
      let y = 0;
      pile.forEach((card, i) => {
        tops.push(y);
        y += card.faceUp ? upFan : downFan;
      });
      pileTops.push(tops);
      col.style.height = (pile.length ? tops[tops.length - 1] + ch : ch) + "px";
      pile.forEach((card, i) => {
        const d = cardEl(card);
        d.style.top = tops[i] + "px";
        if (card.faceUp) {
          markSource(d, { zone: "tableau", pile: p, index: i });
          if (sel && sel.zone === "tableau" && sel.pile === p && i >= sel.index) {
            d.classList.add("sel");
          }
        }
        col.appendChild(d);
      });
      row.appendChild(col);
    }
    tableEl.appendChild(row);

    movesEl.textContent = String(state.moves);
    undoBtn.disabled = history.length === 0;
    draw1Btn.classList.toggle("on", drawMode === 1);
    draw3Btn.classList.toggle("on", drawMode === 3);
  }

  /* ---- Actions ---- */

  function afterChange() {
    if (!over && isWin(state)) {
      over = true;
      stopTimer();
      const key = "solitairebest:" + drawMode;
      const prev = localStorage.getItem(key);
      if (!prev || seconds < +prev) localStorage.setItem(key, String(seconds));
      el("winText").textContent = `${fmtTime(seconds)} · ${state.moves}`;
      winEl.style.display = "block";
      showBest();
    }
    render();
  }

  /** Snapshot, then mutate; only a successful change earns its
   *  snapshot a place on the undo stack. */
  function act(mutate: () => boolean) {
    const before = cloneState(state);
    if (mutate()) {
      pushHistory(history, before);
      sel = null;
      afterChange();
    }
  }

  function doStock() {
    if (state.stock.length > 0) act(() => drawCards(state, drawMode));
    else act(() => recycleStock(state));
  }

  function doUndo() {
    const prev = popHistory(history);
    if (!prev) return;
    state = prev;
    sel = null;
    if (over) {
      over = false;
      winEl.style.display = "none";
      startTimer();
    }
    render();
  }

  function startNewGame() {
    state = newGame();
    history = [];
    sel = null;
    over = false;
    seconds = 0;
    timeEl.textContent = "0:00";
    winEl.style.display = "none";
    showBest();
    render();
    startTimer();
  }

  function setDrawMode(mode: 1 | 3) {
    if (mode === drawMode) return;
    drawMode = mode;
    localStorage.setItem("solitaire:draw", String(mode));
    startNewGame();
  }

  /* ---- Pointer input: one system for drag and tap ---- */

  interface Press {
    pointerId: number;
    startX: number;
    startY: number;
    at: number;
    source: Source | null; // what a drag would carry / a tap would select
    stock: boolean;
    fslot: number | null; // foundation-row destination under the press
    tcol: number | null; // tableau destination under the press
    onCard: boolean;
  }

  let press: Press | null = null;
  let dragLayer: HTMLElement | null = null;
  let dragRect: DOMRect | null = null; // the first dragged card's rect at drag start
  let dragging = false;

  function sourceFromEl(node: HTMLElement | null): Source | null {
    if (!node || !node.dataset.zone) return null;
    if (node.dataset.zone === "waste") return { zone: "waste" };
    if (node.dataset.zone === "foundation") return { zone: "foundation", pile: +node.dataset.pile! };
    return { zone: "tableau", pile: +node.dataset.pile!, index: +node.dataset.index! };
  }

  function describePress(e: PointerEvent): Press {
    const target = e.target as HTMLElement;
    const cardNode = target.closest<HTMLElement>(".card");
    const stockNode = target.closest<HTMLElement>("[data-stock]");
    const fslotNode = target.closest<HTMLElement>("[data-fslot]");
    const colNode = target.closest<HTMLElement>("[data-tcol]");
    let source = sourceFromEl(cardNode);
    // The waste's fanned under-cards are visible but inert; a press
    // anywhere on the waste fan means its top card.
    if (!source && target.closest(".wasteslot") && state.waste.length > 0) {
      source = { zone: "waste" };
    }
    return {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      at: performance.now(),
      source,
      stock: !!stockNode,
      fslot: fslotNode ? +fslotNode.dataset.fslot! : null,
      tcol: colNode ? +colNode.dataset.tcol! : cardNode?.dataset.zone === "tableau" ? +cardNode.dataset.pile! : null,
      onCard: !!cardNode,
    };
  }

  function onPointerDown(e: PointerEvent) {
    if (over || e.button > 0) return;
    press = describePress(e);
    dragging = false;
    try {
      tableEl.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety; the handlers cope without it */
    }
    if (press.source) e.preventDefault();
  }

  function startDrag() {
    if (!press?.source) return;
    const moving = movingCards(state, press.source);
    if (!moving) return;
    const first = tableEl.querySelector<HTMLElement>(
      `.card[data-cid="${moving[0].id}"]`,
    );
    if (!first) return;
    dragRect = first.getBoundingClientRect();
    dragLayer = document.createElement("div");
    dragLayer.className = "draglayer";
    dragLayer.style.width = cw + "px";
    dragLayer.style.left = dragRect.left + "px";
    dragLayer.style.top = dragRect.top + "px";
    const from = press.source;
    // The layer needs an explicit height: its cards are absolutely
    // positioned, so without one it collapses to zero height and the
    // drop-target overlap math in dropTarget() can never match.
    let stackH = ch;
    if (from.zone === "tableau") {
      const tops = pileTops[from.pile];
      stackH = tops[from.index + moving.length - 1] - tops[from.index] + ch;
    }
    dragLayer.style.height = stackH + "px";
    moving.forEach((card, i) => {
      const d = cardEl(card);
      let top = 0;
      if (from.zone === "tableau") {
        const tops = pileTops[from.pile];
        top = tops[from.index + i] - tops[from.index];
      }
      d.style.top = top + "px";
      dragLayer!.appendChild(d);
    });
    root.appendChild(dragLayer);
    for (const card of moving) {
      const src = tableEl.querySelector<HTMLElement>(`.card[data-cid="${card.id}"]`);
      src?.classList.add("dragsrc");
    }
    dragging = true;
  }

  function onPointerMove(e: PointerEvent) {
    if (!press || e.pointerId !== press.pointerId) return;
    const dx = e.clientX - press.startX;
    const dy = e.clientY - press.startY;
    if (!dragging && press.source && Math.hypot(dx, dy) > 8) startDrag();
    if (dragging && dragLayer && dragRect) {
      dragLayer.style.left = dragRect.left + dx + "px";
      dragLayer.style.top = dragRect.top + dy + "px";
    }
  }

  function dropTarget(): Target | null {
    if (!dragRect || !press) return null;
    const layer = dragLayer!;
    const r = layer.getBoundingClientRect();
    let best: Target | null = null;
    let bestArea = 0;
    const consider = (rect: DOMRect, target: Target) => {
      const ox = Math.max(0, Math.min(r.right, rect.right) - Math.max(r.left, rect.left));
      const oy = Math.max(0, Math.min(r.bottom, rect.bottom) - Math.max(r.top, rect.top));
      const area = ox * oy;
      if (area > bestArea) {
        bestArea = area;
        best = target;
      }
    };
    tableEl.querySelectorAll<HTMLElement>("[data-fslot]").forEach((slot) => {
      if (slot.classList.contains("card")) return; // slots only, not the cards on them
      consider(slot.getBoundingClientRect(), { zone: "foundation", pile: +slot.dataset.fslot! });
    });
    // A drop anywhere on the foundation row means "home" — the
    // card's own suit pile, wherever exactly it landed.
    if (best) {
      const moving = movingCards(state, press.source!);
      if (moving && moving.length === 1) return { zone: "foundation", pile: moving[0].suit };
      best = null;
      bestArea = 0;
    }
    tableEl.querySelectorAll<HTMLElement>("[data-tcol]").forEach((col) => {
      consider(col.getBoundingClientRect(), { zone: "tableau", pile: +col.dataset.tcol! });
    });
    return best;
  }

  function endDrag(commit: boolean) {
    if (dragging && commit && press?.source) {
      const target = dropTarget();
      if (target) {
        const from = press.source;
        act(() => applyMove(state, from, target));
      }
    }
    dragLayer?.remove();
    dragLayer = null;
    dragRect = null;
    dragging = false;
    // A successful drop already re-rendered through act(); render
    // again anyway to clear the drag-source ghosting after a
    // refused drop or a cancel.
    render();
  }

  function onTap(p: Press) {
    if (p.stock) {
      doStock();
      render();
      return;
    }
    // A destination tap with a live selection tries the move first.
    if (sel) {
      let target: Target | null = null;
      if (p.fslot !== null) {
        const head = movingCards(state, sel)?.[0];
        if (head) target = { zone: "foundation", pile: head.suit };
      } else if (p.tcol !== null) {
        target = { zone: "tableau", pile: p.tcol };
      }
      const onSelected = !!(p.source && sel && sameSource(p.source, sel));
      if (target && !onSelected) {
        const from = sel;
        const before = cloneState(state);
        if (applyMove(state, from, target)) {
          pushHistory(history, before);
          sel = null;
          afterChange();
          return;
        }
        // Refused: fall through — tapping another card reselects it.
      } else if (target && onSelected) {
        // Tapping the selected card itself is selection business,
        // handled below, never a move onto its own pile.
      }
    }
    if (p.source) {
      if (sel && sameSource(p.source, sel)) {
        if (p.at - selAt <= 400) {
          // Double-tap: send it home, or to the first pile that takes it.
          const from = sel;
          const target = findAutoMove(state, from);
          if (target) {
            const before = cloneState(state);
            if (applyMove(state, from, target)) {
              pushHistory(history, before);
              sel = null;
              afterChange();
              return;
            }
          }
          selAt = 0; // a third tap now deselects
        } else {
          sel = null; // a slow second tap puts the card back down
        }
      } else {
        sel = p.source;
        selAt = p.at;
      }
    } else if (!p.onCard && p.fslot === null && p.tcol === null) {
      sel = null; // a tap on the felt clears the selection
    }
    render();
  }

  function onPointerUp(e: PointerEvent) {
    if (!press || e.pointerId !== press.pointerId) return;
    const p = press;
    if (dragging) {
      // endDrag reads `press` to compute the drop — clear it only
      // after the drop has been resolved.
      endDrag(true);
      press = null;
      return;
    }
    press = null;
    onTap(p);
  }

  function onPointerCancel(e: PointerEvent) {
    if (!press || e.pointerId !== press.pointerId) return;
    if (dragging) endDrag(false);
    press = null;
  }

  tableEl.addEventListener("pointerdown", onPointerDown);
  tableEl.addEventListener("pointermove", onPointerMove);
  tableEl.addEventListener("pointerup", onPointerUp);
  tableEl.addEventListener("pointercancel", onPointerCancel);

  el("newBtn").addEventListener("click", startNewGame);
  el("againBtn").addEventListener("click", startNewGame);
  undoBtn.addEventListener("click", doUndo);
  draw1Btn.addEventListener("click", () => setDrawMode(1));
  draw3Btn.addEventListener("click", () => setDrawMode(3));

  function onKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      doUndo();
    } else if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "u") doUndo();
    else if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "n") startNewGame();
  }
  document.addEventListener("keydown", onKeydown);

  function onContextMenu(e: Event) {
    e.preventDefault();
  }
  root.addEventListener("contextmenu", onContextMenu);

  let lastFitWidth = -1;
  const resize = new ResizeObserver(() => {
    // Only the width drives the layout; renders change the table's
    // height, which must not retrigger this.
    if (tableEl.clientWidth === lastFitWidth) return;
    lastFitWidth = tableEl.clientWidth;
    fit();
    render();
  });
  resize.observe(tableEl);

  fit();
  showBest();
  startNewGame();

  return () => {
    stopTimer();
    resize.disconnect();
    document.removeEventListener("keydown", onKeydown);
    root.removeEventListener("contextmenu", onContextMenu);
  };
}
