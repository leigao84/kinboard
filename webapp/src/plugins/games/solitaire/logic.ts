/**
 * Klondike solitaire: the rules, with no DOM in sight.
 *
 * The state is plain data — four foundation piles (one per suit),
 * seven tableau piles, a stock and a waste — and every change a
 * player can make is a function here: move cards, draw, recycle,
 * undo. The component in SolitaireGame.tsx only draws this state
 * and feeds it gestures, so the specs can play whole games against
 * the rules themselves (e2e/solitaire-logic.spec.ts).
 *
 * Piles are arrays with the TOP of the pile at the END, the way the
 * cards come off in your hand.
 */

export type Suit = 0 | 1 | 2 | 3; // ♠ ♥ ♦ ♣ — hearts and diamonds are red

export interface CardT {
  id: number; // suit * 13 + (rank - 1): unique in the deck
  suit: Suit;
  rank: number; // 1 (Ace) .. 13 (King)
  faceUp: boolean;
}

export interface GameState {
  stock: CardT[];
  waste: CardT[];
  foundations: CardT[][]; // one pile per suit, indexed by suit
  tableau: CardT[][]; // seven piles
  moves: number;
}

/** Where cards are picked up from. A tableau source names the card
 *  the moving run starts at; waste and foundation sources always
 *  mean their top card — the only one that can ever move. */
export type Source =
  | { zone: "waste" }
  | { zone: "foundation"; pile: number }
  | { zone: "tableau"; pile: number; index: number };

export type Target =
  | { zone: "foundation"; pile: number }
  | { zone: "tableau"; pile: number };

export const SUIT_GLYPHS = ["♠", "♥", "♦", "♣"] as const;
export const RANK_LABELS = [
  "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K",
] as const;

export function isRed(suit: Suit): boolean {
  return suit === 1 || suit === 2;
}

export function makeDeck(): CardT[] {
  const deck: CardT[] = [];
  for (let suit = 0 as Suit; suit < 4; suit = (suit + 1) as Suit) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ id: suit * 13 + (rank - 1), suit, rank, faceUp: false });
    }
  }
  return deck;
}

export function shuffle<T>(cards: T[], rng: () => number = Math.random): T[] {
  const out = cards.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A fresh deal: tableau pile i gets i face-down cards and one
 *  face-up card on top; the remaining 24 cards form the stock. */
export function newGame(rng: () => number = Math.random): GameState {
  const deck = shuffle(makeDeck(), rng);
  const tableau: CardT[][] = [];
  let next = 0;
  for (let p = 0; p < 7; p++) {
    const pile: CardT[] = [];
    for (let i = 0; i <= p; i++) {
      const card = deck[next++];
      card.faceUp = i === p;
      pile.push(card);
    }
    tableau.push(pile);
  }
  return {
    stock: deck.slice(next),
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    moves: 0,
  };
}

export function cloneState(state: GameState): GameState {
  const pile = (cards: CardT[]) => cards.map((c) => ({ ...c }));
  return {
    stock: pile(state.stock),
    waste: pile(state.waste),
    foundations: state.foundations.map(pile),
    tableau: state.tableau.map(pile),
    moves: state.moves,
  };
}

/** The cards a source would move, or null when it cannot move at
 *  all (empty pile, a face-down card, a run that does not descend
 *  in alternating colours). */
export function movingCards(state: GameState, from: Source): CardT[] | null {
  if (from.zone === "waste") {
    const top = state.waste[state.waste.length - 1];
    return top ? [top] : null;
  }
  if (from.zone === "foundation") {
    const pile = state.foundations[from.pile];
    if (!pile) return null;
    const top = pile[pile.length - 1];
    return top ? [top] : null;
  }
  const pile = state.tableau[from.pile];
  if (!pile || from.index < 0 || from.index >= pile.length) return null;
  const run = pile.slice(from.index);
  if (run.some((c) => !c.faceUp)) return null;
  for (let i = 1; i < run.length; i++) {
    if (run[i].rank !== run[i - 1].rank - 1) return null;
    if (isRed(run[i].suit) === isRed(run[i - 1].suit)) return null;
  }
  return run;
}

export function canMove(state: GameState, from: Source, to: Target): boolean {
  const moving = movingCards(state, from);
  if (!moving) return false;
  if (to.zone === "foundation") {
    if (moving.length !== 1 || from.zone === "foundation") return false;
    // A foundation pile holds only its own suit.
    if (to.pile !== moving[0].suit) return false;
    const pile = state.foundations[to.pile];
    const top = pile[pile.length - 1];
    return moving[0].rank === (top ? top.rank + 1 : 1);
  }
  if (from.zone === "tableau" && from.pile === to.pile) return false;
  const target = state.tableau[to.pile];
  const head = moving[0];
  if (target.length === 0) {
    if (head.rank !== 13) return false;
    // Sliding a whole King-headed pile into another empty slot
    // changes nothing; refuse it so it never eats an undo step.
    if (from.zone === "tableau" && from.index === 0) return false;
    return true;
  }
  const top = target[target.length - 1];
  if (!top.faceUp) return false;
  return head.rank === top.rank - 1 && isRed(head.suit) !== isRed(top.suit);
}

/** Move cards, flipping the tableau card the move uncovers.
 *  Validates fully before touching the state, so a refused move
 *  leaves everything exactly as it was. Returns success. */
export function applyMove(state: GameState, from: Source, to: Target): boolean {
  if (!canMove(state, from, to)) return false;
  const moving = movingCards(state, from)!;
  if (from.zone === "waste") state.waste.splice(state.waste.length - moving.length, moving.length);
  else if (from.zone === "foundation") {
    state.foundations[from.pile].splice(state.foundations[from.pile].length - moving.length, moving.length);
  } else state.tableau[from.pile].splice(from.index, moving.length);
  if (to.zone === "foundation") state.foundations[to.pile].push(...moving);
  else state.tableau[to.pile].push(...moving);
  if (from.zone === "tableau") {
    const pile = state.tableau[from.pile];
    const top = pile[pile.length - 1];
    if (top && !top.faceUp) top.faceUp = true;
  }
  state.moves++;
  return true;
}

/** Turn stock cards onto the waste, face-up. In draw-3 the three
 *  land as a fan and only the last one — the waste's top — plays. */
export function drawCards(state: GameState, count: 1 | 3): boolean {
  if (state.stock.length === 0) return false;
  const n = Math.min(count, state.stock.length);
  for (let i = 0; i < n; i++) {
    const card = state.stock.pop()!;
    card.faceUp = true;
    state.waste.push(card);
  }
  state.moves++;
  return true;
}

/** Turn the waste back over into a fresh stock. The order is
 *  restored exactly, so the same sequence of cards comes around
 *  again — in draw-3 the same fans, too. Unlimited passes. */
export function recycleStock(state: GameState): boolean {
  if (state.stock.length > 0 || state.waste.length === 0) return false;
  state.stock = state.waste
    .slice()
    .reverse()
    .map((c) => ({ ...c, faceUp: false }));
  state.waste = [];
  state.moves++;
  return true;
}

export function isWin(state: GameState): boolean {
  return state.foundations.reduce((n, p) => n + p.length, 0) === 52;
}

/** Where a double-tapped card would go: its foundation first,
 *  then the first tableau pile that takes it. Foundation cards
 *  themselves never auto-move — pulling one back down is always
 *  a deliberate drag or tap. */
export function findAutoMove(state: GameState, from: Source): Target | null {
  if (from.zone === "foundation") return null;
  const moving = movingCards(state, from);
  if (!moving) return null;
  if (moving.length === 1) {
    const home: Target = { zone: "foundation", pile: moving[0].suit };
    if (canMove(state, from, home)) return home;
  }
  for (let p = 0; p < 7; p++) {
    const onto: Target = { zone: "tableau", pile: p };
    if (canMove(state, from, onto)) return onto;
  }
  return null;
}

/* ---- Undo history: snapshots of the state before each change ---- */

export function pushHistory(history: GameState[], state: GameState, cap = 1000): void {
  history.push(cloneState(state));
  if (history.length > cap) history.shift();
}

export function popHistory(history: GameState[]): GameState | null {
  return history.pop() ?? null;
}
