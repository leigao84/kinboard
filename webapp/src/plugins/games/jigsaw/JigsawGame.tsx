"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { usePhotoSource } from "@/hooks";

/**
 * Photo Jigsaw, ported from the family's standalone games site
 * into the Games plugin. Real tab-and-blank pieces, drag-and-snap,
 * a guide image on the board, hold-to-peek — the original game,
 * unchanged below; only element lookups are scoped to this
 * component, and the page chrome is Kinboard's.
 *
 * The picker opens on the public-domain samples bundled with the
 * plugin (public/games/jigsaw/samples), so the game is playable
 * the moment it loads, on any board. The board's own photos —
 * the same source the screensaver and the Photos page read
 * (usePhotoSource) — are opt-in: once that source has settled,
 * a "New photos" button deals a random handful of them into
 * their own group in the picker. A board with no photo source
 * simply never grows the button. Upload-your-own still reads
 * the file on the device and nowhere else.
 */
export function JigsawGame() {
  const rootRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<JigsawHandle | null>(null);
  const { photos, isLoading } = usePhotoSource();
  const t = useTranslations("games.jigsaw");

  useEffect(() => () => handleRef.current?.teardown(), []);

  useEffect(() => {
    if (!rootRef.current || handleRef.current) return;
    handleRef.current = initJigsaw(rootRef.current, {
      samplesLabel: t("samplePhotos"),
      yoursLabel: t("yourPhotos"),
      newPhotosLabel: t("newPhotos"),
    });
  }, [t]);

  // Hand the settled source list to the game; until this runs (and
  // forever, on boards with no source) the samples are the game.
  useEffect(() => {
    if (isLoading || photos.length === 0) return;
    handleRef.current?.setAlbumPhotos(
      photos.map((p) => ({
        id: `src-${p.id}`,
        src: p.url,
        w: p.width ?? 0,
        h: p.height ?? 0,
        label: p.metadata?.description ?? "",
      })),
    );
  }, [photos, isLoading]);

  return (
    <div ref={rootRef} className="kb-game kb-game-jigsaw">
      <div className="pickerLabel" id="pickerLabel"></div>
      <div className="picker" id="picker"></div>
      <div id="sampleSlot"></div>
      <div id="albumGroup" style={{ display: "none" }}>
        <div className="pickerLabel" id="albumLabel"></div>
        <div className="picker" id="albumPicker"></div>
      </div>
      <input type="file" id="fileInput" accept="image/*" style={{ display: "none" }} />

      <div className="bar">
        <select id="diff" aria-label="Difficulty" defaultValue="easy">
          <option value="easy">Easy · 12 pieces</option>
          <option value="normal">Normal · 24 pieces</option>
          <option value="hard">Hard · 48 pieces</option>
        </select>
        <button id="newBtn">🔀 New puzzle</button>
        <button id="scatterBtn" className="ghost">🌀 Re-toss the pile</button>
        <button id="peekBtn" className="ghost">👀 Hold to peek</button>
        <label className="tgl"><input type="checkbox" id="guideTgl" defaultChecked /> Guide</label>
      </div>

      <div className="stats">
        <span>Placed <b id="placed">0/12</b></span>
        <span>Drops <b id="moves">0</b></span>
        <span>Best <b id="best">—</b></span>
      </div>

      <div id="stage">
        <div id="boardFrame"><img id="ghost" alt="" /></div>
      </div>

      <div id="win">
        <div className="big">🎉 You did it!</div>
        <div id="winText"></div>
        <div style={{ marginTop: 10 }}><button id="againBtn">Play again</button></div>
      </div>

      <div className="belowstage">
        <figure className="ref">
          <img id="refImg" alt="Original photo" />
          <figcaption>Original · <span id="refLabel"></span></figcaption>
        </figure>
        <div className="how"><b>How to play:</b> the pieces are floating in a pile under the board. Drag a piece
        onto the board — when it&apos;s close to its home spot it snaps in with a click. The faint picture on the
        board is your guide (turn it off for a real challenge), 👀 peek shows the photo clearly while you
        hold it, and the original is always right here beside the board. The game opens on a few bundled
        sample photos; if this board has a photo library, the 🎲 New photos button deals in a fresh handful from it — the same
        photos the screensaver shows. You can also pick any photo from this device (it never leaves
        the device).</div>
      </div>
    </div>
  );
}

/**
 * The bundled default pictures — every one public domain (see
 * public/games/jigsaw/samples/NOTICE.md for each one's source and
 * license). These are the game until a board's own photos are
 * dealt in with the sample button.
 */
const SAMPLE_PHOTOS: Photo[] = [
    { id: "sample-1", src: "/games/jigsaw/samples/sample-1.jpg", w: 1600, h: 1600, label: "Earth, from Apollo 17" },
    { id: "sample-2", src: "/games/jigsaw/samples/sample-2.jpg", w: 1600, h: 1088, label: "Sierra Nevada, California" },
    { id: "sample-3", src: "/games/jigsaw/samples/sample-3.jpg", w: 1600, h: 1227, label: "The Grand Canyon" },
    { id: "sample-4", src: "/games/jigsaw/samples/sample-4.jpg", w: 1280, h: 1600, label: "Portland Head Light" },
    { id: "sample-5", src: "/games/jigsaw/samples/sample-5.jpg", w: 960, h: 1280, label: "A sea turtle" },
];

/** How many album photos one press of the sample button deals in. */
const ALBUM_DRAW = 8;

type Photo = { id: string; src: string; w: number; h: number; label: string };

type JigsawHandle = {
  /** Offer the board's photos for sampling; empty lists are ignored. */
  setAlbumPhotos: (list: Photo[]) => void;
  teardown: () => void;
};
type Edges = { R: number[][]; B: number[][] };
type Piece = {
  id: number; r: number; c: number; el: HTMLDivElement;
  snapped: boolean; fx: number; fy: number; rot: number;
};
type Layout = {
  stageW: number; stageH: number; boardW: number; boardH: number;
  boardX: number; boardY: number; cellW: number; cellH: number;
  trayTop: number; trayH: number;
};

function initJigsaw(
  root: HTMLElement,
  opts: { samplesLabel: string; yoursLabel: string; newPhotosLabel: string },
): JigsawHandle {
  const el = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>("#" + id)!;

  const TARGETS: Record<string, number> = { easy: 12, normal: 24, hard: 48 };
  const M = 27; // viewBox margin around a 100-unit cell, for the knobs

  /* Grid shape for a photo: near-square pieces, about `target` of them. */
  function gridFor(w: number, h: number, target: number) {
    const cols = Math.max(2, Math.round(Math.sqrt(target * w / h)));
    const rows = Math.max(2, Math.round(target / cols));
    return { cols, rows };
  }

  /* Random tab directions for every interior edge. R[r][c] is the right
     edge of piece (r,c): +1 tab sticking out, -1 blank cut in. B likewise
     for bottom edges. Neighbors always get the complementary shape. */
  function genEdges(cols: number, rows: number): Edges {
    const R: number[][] = [], B: number[][] = [];
    for (let r = 0; r < rows; r++) { R.push([]); for (let c = 0; c < cols - 1; c++) R[r].push(Math.random() < 0.5 ? 1 : -1); }
    for (let r = 0; r < rows - 1; r++) { B.push([]); for (let c = 0; c < cols; c++) B[r].push(Math.random() < 0.5 ? 1 : -1); }
    return { R, B };
  }

  /* One edge of a piece outline, from (x1,y1) to (x2,y2) — axis-aligned,
     100 units long — with outward normal (nx,ny) and tab direction d
     (+1 tab out, -1 blank in, 0 flat). The knob profile is symmetric
     around the edge midpoint, so the neighbor's matching edge, traced
     the other way with -d, lands on exactly the same curve. */
  function traceEdge(x1: number, y1: number, x2: number, y2: number, nx: number, ny: number, d: number): string {
    const f = (n: number) => Math.round(n * 10) / 10;
    if (!d) return `L${f(x2)} ${f(y2)}`;
    const ux = (x2 - x1) / 100, uy = (y2 - y1) / 100;
    const q = (t: number, s: number) => `${f(x1 + ux * t * 100 + nx * s * d * 100)} ${f(y1 + uy * t * 100 + ny * s * d * 100)}`;
    return [
      `L${q(0.40, 0)}`,
      `Q${q(0.46, 0.06)} ${q(0.44, 0.14)}`,
      `Q${q(0.43, 0.26)} ${q(0.50, 0.27)}`,
      `Q${q(0.57, 0.26)} ${q(0.56, 0.14)}`,
      `Q${q(0.54, 0.06)} ${q(0.60, 0)}`,
      `L${f(x2)} ${f(y2)}`,
    ].join(" ");
  }

  /* The full outline of piece (r,c), in cell coordinates (0..100). */
  function piecePath(r: number, c: number, cols: number, rows: number, E: Edges): string {
    const top = r > 0 ? -E.B[r - 1][c] : 0;
    const right = c < cols - 1 ? E.R[r][c] : 0;
    const bottom = r < rows - 1 ? E.B[r][c] : 0;
    const left = c > 0 ? -E.R[r][c - 1] : 0;
    return [
      "M0 0",
      traceEdge(0, 0, 100, 0, 0, -1, top),
      traceEdge(100, 0, 100, 100, 1, 0, right),
      traceEdge(100, 100, 0, 100, 0, 1, bottom),
      traceEdge(0, 100, 0, 0, -1, 0, left),
      "Z",
    ].join(" ");
  }

  /* ---- Game state ---- */
  const stage = el("stage");
  const frame = el("boardFrame");
  const ghost = el<HTMLImageElement>("ghost");
  const placedEl = el("placed");
  const movesEl = el("moves");
  const bestEl = el("best");
  const winEl = el("win");
  const guideTgl = el<HTMLInputElement>("guideTgl");
  const diffEl = el<HTMLSelectElement>("diff");

  let photo: Photo = SAMPLE_PHOTOS[0];
  let cols = 0, rows = 0, edges: Edges = { R: [], B: [] }, pieces: Piece[] = [], moves = 0, won = false, zTop = 20;
  let L: Layout | null = null; // layout metrics
  const timeouts: ReturnType<typeof setTimeout>[] = [];
  const later = (fn: () => void, ms: number) => { timeouts.push(setTimeout(fn, ms)); };

  function bestKey() { return "jigsaw2best:" + photo.id + ":" + diffEl.value; }
  function placedCount() { return pieces.filter(p => p.snapped).length; }

  function layout() {
    const stageW = stage.clientWidth;
    const boardW = Math.min(stageW, photo.w >= photo.h ? 560 : 430);
    const boardH = boardW * photo.h / photo.w;
    const cellW = boardW / cols, cellH = boardH / rows;
    const boardX = (stageW - boardW) / 2, boardY = 0;
    const trayTop = boardY + boardH + 16;
    const trayH = Math.max(230, cellH * 3.4);
    const stageH = trayTop + trayH;
    stage.style.height = stageH + "px";
    frame.style.left = boardX + "px";
    frame.style.top = boardY + "px";
    frame.style.width = boardW + "px";
    frame.style.height = boardH + "px";
    ghost.style.opacity = guideTgl.checked ? "0.22" : "0";
    L = { stageW, stageH, boardW, boardH, boardX, boardY, cellW, cellH, trayTop, trayH };
  }

  function homeXY(p: Piece) {
    const l = L!;
    return { x: l.boardX + p.c * l.cellW, y: l.boardY + p.r * l.cellH };
  }

  /* Position a piece element from its state: snapped pieces sit exactly
     home; loose pieces use cell coords stored as stage fractions so a
     resize keeps them in the same relative spot. */
  function place(p: Piece) {
    const l = L!;
    const elm = p.el;
    elm.style.width = (l.cellW * (100 + 2 * M) / 100) + "px";
    elm.style.height = (l.cellH * (100 + 2 * M) / 100) + "px";
    let cx: number, cy: number;
    if (p.snapped) { const h = homeXY(p); cx = h.x; cy = h.y; }
    else { cx = p.fx * l.stageW; cy = p.fy * l.stageH; }
    elm.style.left = (cx - l.cellW * M / 100) + "px";
    elm.style.top = (cy - l.cellH * M / 100) + "px";
    elm.style.transform = `rotate(${p.snapped ? 0 : p.rot}deg)`;
  }

  function renderStats() {
    placedEl.textContent = placedCount() + "/" + pieces.length;
    movesEl.textContent = String(moves);
    const best = localStorage.getItem(bestKey());
    bestEl.textContent = best ? best + " drops" : "—";
  }

  function scatter() {
    const l = L!;
    for (const p of pieces) {
      if (p.snapped) continue;
      const cx = Math.random() * Math.max(1, l.stageW - l.cellW);
      const cy = l.trayTop + Math.random() * Math.max(1, l.stageH - l.trayTop - l.cellH * 0.85);
      p.fx = cx / l.stageW;
      p.fy = cy / l.stageH;
      p.rot = Math.round((Math.random() * 14 - 7) * 10) / 10;
      place(p);
    }
  }

  function buildPieces() {
    stage.querySelectorAll(".piece").forEach(elm => elm.remove());
    pieces = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = r * cols + c;
        const d = piecePath(r, c, cols, rows, edges);
        const elm = document.createElement("div");
        elm.className = "piece";
        elm.innerHTML =
          `<svg viewBox="${-M} ${-M} ${100 + 2 * M} ${100 + 2 * M}" preserveAspectRatio="none">` +
          `<defs><clipPath id="cp${id}"><path d="${d}"/></clipPath></defs>` +
          `<g clip-path="url(#cp${id})"><image href="${photo.src}" x="${-c * 100}" y="${-r * 100}" ` +
          `width="${cols * 100}" height="${rows * 100}" preserveAspectRatio="none"/></g>` +
          `<path d="${d}" fill="none" stroke="rgba(60,40,20,.28)" stroke-width="1.6"/></svg>`;
        const p: Piece = { id, r, c, el: elm, snapped: false, fx: 0, fy: 0, rot: 0 };
        elm.addEventListener("pointerdown", e => startDrag(e, p));
        stage.appendChild(elm);
        pieces.push(p);
      }
    }
  }

  /* ---- Dragging ---- */
  let drag: { p: Piece; dx: number; dy: number } | null = null;
  function stagePos(e: PointerEvent) {
    const rect = stage.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function startDrag(e: PointerEvent, p: Piece) {
    if (p.snapped || won) return;
    e.preventDefault();
    const pos = stagePos(e);
    const cx = p.fx * L!.stageW, cy = p.fy * L!.stageH;
    drag = { p, dx: pos.x - cx, dy: pos.y - cy };
    p.el.setPointerCapture(e.pointerId);
    p.el.classList.add("dragging");
    p.el.style.zIndex = String(++zTop);
    p.rot = 0;
    p.el.style.transform = "rotate(0deg)";
    p.el.addEventListener("pointermove", onDrag);
    p.el.addEventListener("pointerup", endDrag, { once: true });
    p.el.addEventListener("pointercancel", endDrag, { once: true });
  }
  function onDrag(e: PointerEvent) {
    if (!drag) return;
    const l = L!;
    const pos = stagePos(e);
    const p = drag.p;
    const cx = Math.min(Math.max(pos.x - drag.dx, -l.cellW * 0.4), l.stageW - l.cellW * 0.6);
    const cy = Math.min(Math.max(pos.y - drag.dy, -l.cellH * 0.4), l.stageH - l.cellH * 0.6);
    p.fx = cx / l.stageW;
    p.fy = cy / l.stageH;
    place(p);
  }
  function endDrag() {
    if (!drag) return;
    const l = L!;
    const p = drag.p;
    drag = null;
    p.el.classList.remove("dragging");
    p.el.removeEventListener("pointermove", onDrag);
    moves++;
    const h = homeXY(p);
    const cx = p.fx * l.stageW, cy = p.fy * l.stageH;
    if (Math.abs(cx - h.x) < l.cellW * 0.45 && Math.abs(cy - h.y) < l.cellH * 0.45) {
      p.snapped = true;
      p.el.classList.add("snapped");
      p.el.style.zIndex = "1";
      blip(700);
      place(p);
      renderStats();
      if (placedCount() === pieces.length) win();
      return;
    }
    blip(300);
    p.rot = Math.round((Math.random() * 10 - 5) * 10) / 10;
    place(p);
    renderStats();
  }

  function win() {
    won = true;
    const key = bestKey();
    const prev = localStorage.getItem(key);
    if (!prev || moves < +prev) localStorage.setItem(key, String(moves));
    el("winText").textContent =
      `You put the photo back together in ${moves} drops!`;
    winEl.style.display = "block";
    winEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    [523, 659, 784, 1047].forEach((f, k) => later(() => blip(f), k * 130));
    renderStats();
  }

  let actx: AudioContext | null = null;
  function blip(freq: number) {
    try {
      actx = actx || new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = freq; o.type = "sine";
      g.gain.setValueAtTime(0.08, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.15);
      o.connect(g).connect(actx.destination);
      o.start(); o.stop(actx.currentTime + 0.16);
    } catch { /* sound is a bonus, never a blocker */ }
  }

  function newGame() {
    const g = gridFor(photo.w, photo.h, TARGETS[diffEl.value]);
    cols = g.cols; rows = g.rows;
    edges = genEdges(cols, rows);
    moves = 0; won = false; zTop = 20;
    winEl.style.display = "none";
    ghost.src = photo.src;
    const refImg = el<HTMLImageElement>("refImg");
    refImg.src = photo.src;
    el("refLabel").textContent = photo.label;
    layout();
    buildPieces();
    scatter();
    pieces.forEach(place);
    renderStats();
  }

  /* Photo picker: the bundled samples form the default strip; the
     board's own photos get a second strip of their own below. */
  const picker = el("picker");
  el("pickerLabel").textContent = opts.samplesLabel;
  const albumGroup = el("albumGroup");
  const albumPicker = el("albumPicker");
  el("albumLabel").textContent = opts.yoursLabel;
  const sampleSlot = el("sampleSlot");

  function activate(p: Photo, btn: HTMLElement) {
    photo = p;
    root.querySelectorAll(".pick").forEach(elm => elm.classList.remove("on"));
    btn.classList.add("on");
    newGame();
  }

  /* A photo's pixel size may not be known yet — most sources do not
     report one — so measure it the way the screensaver does, by
     loading it; the picker thumbnail has usually warmed the cache
     already. The sequence guard keeps a slow probe from overriding
     a newer tap. */
  let selectSeq = 0;
  function selectPhoto(p: Photo, btn: HTMLElement) {
    const seq = ++selectSeq;
    if (p.w > 0 && p.h > 0) { activate(p, btn); return; }
    const probe = new Image();
    probe.onload = () => {
      if (seq === selectSeq) {
        activate({ ...p, w: probe.naturalWidth || 4, h: probe.naturalHeight || 3 }, btn);
      }
    };
    probe.onerror = () => { if (seq === selectSeq) activate({ ...p, w: 4, h: 3 }, btn); };
    probe.src = p.src;
  }

  function addPick(p: Photo, strip: HTMLElement) {
    const btn = document.createElement("button");
    btn.className = "pick";
    btn.title = p.label;
    const img = document.createElement("img");
    img.src = p.src; img.alt = p.label;
    btn.appendChild(img);
    btn.addEventListener("click", () => selectPhoto(p, btn));
    strip.appendChild(btn);
    return btn;
  }
  const firstBtn = SAMPLE_PHOTOS.map((p) => addPick(p, picker))[0];

  /* The board's photo source, sampled. setAlbumPhotos hands over the
     full settled list; until then — and forever, on boards with no
     source — there is no button and the samples are the game. A draw
     only rebuilds the album strip: a puzzle in progress is never
     touched, and starting one still happens by picking a photo. */
  let albumAll: Photo[] = [];
  let albumShown: Photo[] = [];
  let sampleBtn: HTMLButtonElement | null = null;

  function drawAlbumSample() {
    const pool = [...albumAll];
    let draw: Photo[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      // Fisher–Yates over the full list, then take the draw — so a
      // re-roll reaches every photo in the source, not just the top.
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      draw = pool.slice(0, ALBUM_DRAW);
      const sameAsShown =
        draw.length === albumShown.length &&
        draw.every((p) => albumShown.some((q) => q.id === p.id));
      if (!sameAsShown || albumAll.length <= ALBUM_DRAW) break;
    }
    albumShown = draw;
    albumPicker.querySelectorAll(".pick").forEach((elm) => elm.remove());
    draw.forEach((p) => addPick(p, albumPicker));
    albumGroup.style.display = "flex";
    // A source no bigger than one draw has nothing left to re-roll.
    if (sampleBtn && albumAll.length <= ALBUM_DRAW) sampleBtn.disabled = true;
  }

  function setAlbumPhotos(list: Photo[]) {
    if (list.length === 0) return;
    albumAll = list;
    if (sampleBtn) return;
    sampleBtn = document.createElement("button");
    sampleBtn.className = "sampleBtn";
    sampleBtn.textContent = `🎲 ${opts.newPhotosLabel}`;
    sampleBtn.addEventListener("click", drawAlbumSample);
    sampleSlot.appendChild(sampleBtn);
  }
  const upBtn = document.createElement("button");
  upBtn.className = "pick up";
  upBtn.textContent = "📷";
  upBtn.title = "Use your own photo";
  upBtn.addEventListener("click", () => el<HTMLInputElement>("fileInput").click());
  picker.appendChild(upBtn);

  el<HTMLInputElement>("fileInput").addEventListener("change", e => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      activate({ id: "upload", src: url, w: img.naturalWidth, h: img.naturalHeight, label: "Your photo" }, upBtn);
    };
    img.src = url;
    input.value = "";
  });

  el("newBtn").addEventListener("click", newGame);
  el("againBtn").addEventListener("click", newGame);
  diffEl.addEventListener("change", newGame);
  el("scatterBtn").addEventListener("click", () => { scatter(); });
  guideTgl.addEventListener("change", () => { ghost.style.opacity = guideTgl.checked ? "0.22" : "0"; });

  /* Peek: hold to see the photo clearly on the board */
  const peekBtn = el("peekBtn");
  peekBtn.addEventListener("pointerdown", e => { e.preventDefault(); ghost.style.opacity = "0.95"; });
  ["pointerup", "pointerleave"].forEach(ev => peekBtn.addEventListener(ev, () => {
    ghost.style.opacity = guideTgl.checked ? "0.22" : "0";
  }));

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (pieces.length) { layout(); pieces.forEach(place); } }, 150);
  }
  window.addEventListener("resize", onResize);

  if (firstBtn) selectPhoto(SAMPLE_PHOTOS[0], firstBtn);

  return {
    setAlbumPhotos,
    teardown: () => {
      timeouts.forEach(clearTimeout);
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
    },
  };
}
