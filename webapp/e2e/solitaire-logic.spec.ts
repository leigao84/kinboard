import { test, expect } from "@playwright/test";
import {
  applyMove,
  canMove,
  drawCards,
  findAutoMove,
  isWin,
  movingCards,
  newGame,
  popHistory,
  pushHistory,
  recycleStock,
} from "../src/plugins/games/solitaire/logic";
import type { CardT, GameState, Suit } from "../src/plugins/games/solitaire/logic";

/**
 * Klondike's rules, played against the logic module directly —
 * no browser, no board. The component in SolitaireGame.tsx only
 * draws this state and feeds it gestures, so if a move is wrong
 * it is wrong here first. Suits: 0 ♠, 1 ♥, 2 ♦, 3 ♣.
 */

function card(suit: Suit, rank: number, faceUp = true): CardT {
  return { id: suit * 13 + (rank - 1), suit, rank, faceUp };
}

function emptyState(): GameState {
  return {
    stock: [],
    waste: [],
    foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], []],
    moves: 0,
  };
}

/** A compact fingerprint of a state: every card, its face, and the
 *  move count — enough for undo to prove it restored everything. */
function ser(state: GameState): string {
  const pile = (cards: CardT[]) => cards.map((c) => `${c.id}${c.faceUp ? "u" : "d"}`).join(",");
  return [
    pile(state.stock),
    pile(state.waste),
    ...state.foundations.map(pile),
    ...state.tableau.map(pile),
    String(state.moves),
  ].join("|");
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test.describe("solitaire logic", () => {
  test("the deal: piles of 1..7, only the tops face-up, 24 cards in the stock", () => {
    const s = newGame(mulberry32(42));
    expect(s.tableau.map((p) => p.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    s.tableau.forEach((pile, p) => {
      expect(pile.filter((c) => !c.faceUp).length).toBe(p);
      pile.forEach((c, i) => expect(c.faceUp).toBe(i === pile.length - 1));
    });
    expect(s.stock.length).toBe(24);
    expect(s.stock.every((c) => !c.faceUp)).toBe(true);
    expect(s.waste).toEqual([]);
    expect(s.foundations.flat()).toEqual([]);
    const ids = [...s.stock, ...s.tableau.flat()].map((c) => c.id);
    expect(new Set(ids).size).toBe(52);
    expect(s.moves).toBe(0);
  });

  test("tableau builds down in alternating colours", () => {
    const s = emptyState();
    s.tableau[0] = [card(0, 8)]; // 8♠
    s.tableau[1] = [card(1, 7)]; // 7♥
    s.tableau[2] = [card(2, 7)]; // 7♦
    s.tableau[3] = [card(3, 7)]; // 7♣
    s.tableau[4] = [card(1, 6)]; // 6♥
    const onto = { zone: "tableau", pile: 0 } as const;
    expect(canMove(s, { zone: "tableau", pile: 1, index: 0 }, onto)).toBe(true);
    expect(canMove(s, { zone: "tableau", pile: 2, index: 0 }, onto)).toBe(true);
    expect(canMove(s, { zone: "tableau", pile: 3, index: 0 }, onto)).toBe(false); // black on black
    expect(canMove(s, { zone: "tableau", pile: 4, index: 0 }, onto)).toBe(false); // wrong rank
  });

  test("only a King fills an empty tableau slot", () => {
    const s = emptyState();
    s.tableau[1] = [card(1, 12)]; // Q♥
    s.tableau[2] = [card(0, 5, false), card(2, 13)]; // K♦ over a face-down card
    s.waste = [card(3, 13)]; // K♣
    const empty = { zone: "tableau", pile: 4 } as const;
    expect(canMove(s, { zone: "waste" }, empty)).toBe(true);
    expect(canMove(s, { zone: "tableau", pile: 2, index: 1 }, empty)).toBe(true);
    expect(canMove(s, { zone: "tableau", pile: 1, index: 0 }, empty)).toBe(false);
    // A whole King-headed pile sliding to another empty slot is a
    // no-op, and refused so it never eats an undo step.
    const bare = emptyState();
    bare.tableau[0] = [card(0, 13)];
    expect(canMove(bare, { zone: "tableau", pile: 0, index: 0 }, { zone: "tableau", pile: 3 })).toBe(false);
  });

  test("face-up runs move together, and moving one flips the card it uncovers", () => {
    const s = emptyState();
    s.tableau[0] = [card(3, 11)]; // J♣
    s.tableau[1] = [card(0, 3, false), card(1, 10), card(0, 9)]; // 10♥ 9♠ over a face-down 3♠
    expect(applyMove(s, { zone: "tableau", pile: 1, index: 1 }, { zone: "tableau", pile: 0 })).toBe(true);
    expect(s.tableau[0].map((c) => c.id)).toEqual([card(3, 11).id, card(1, 10).id, card(0, 9).id]);
    expect(s.tableau[1]).toEqual([card(0, 3, true)]); // uncovered — and flipped
    // A "run" that breaks the alternation is not a run at all.
    const broken = emptyState();
    broken.tableau[0] = [card(3, 11)];
    broken.tableau[1] = [card(1, 9), card(2, 8)]; // 9♥ 8♦: same colour
    expect(movingCards(broken, { zone: "tableau", pile: 1, index: 0 })).toBeNull();
    expect(canMove(broken, { zone: "tableau", pile: 1, index: 0 }, { zone: "tableau", pile: 0 })).toBe(false);
  });

  test("foundations climb by suit from the Ace", () => {
    const s = emptyState();
    s.waste = [card(0, 1)]; // A♠
    expect(canMove(s, { zone: "waste" }, { zone: "foundation", pile: 0 })).toBe(true);
    expect(canMove(s, { zone: "waste" }, { zone: "foundation", pile: 1 })).toBe(false); // not its pile
    expect(applyMove(s, { zone: "waste" }, { zone: "foundation", pile: 0 })).toBe(true);
    s.waste = [card(0, 3)]; // 3♠ may not skip the 2
    expect(canMove(s, { zone: "waste" }, { zone: "foundation", pile: 0 })).toBe(false);
    s.waste = [card(0, 2)];
    expect(canMove(s, { zone: "waste" }, { zone: "foundation", pile: 0 })).toBe(true);
    s.tableau[0] = [card(1, 1)]; // A♥ starts its own pile, not the spades'
    expect(canMove(s, { zone: "tableau", pile: 0, index: 0 }, { zone: "foundation", pile: 0 })).toBe(false);
    expect(canMove(s, { zone: "tableau", pile: 0, index: 0 }, { zone: "foundation", pile: 1 })).toBe(true);
  });

  test("a refused move changes nothing", () => {
    const s = emptyState();
    s.tableau[0] = [card(0, 8)];
    s.tableau[1] = [card(3, 7)]; // black on black
    const before = ser(s);
    expect(applyMove(s, { zone: "tableau", pile: 1, index: 0 }, { zone: "tableau", pile: 0 })).toBe(false);
    expect(ser(s)).toBe(before);
  });

  test("draw-1 turns one card; draw-3 turns three and only the waste's top plays", () => {
    const s = emptyState();
    s.stock = [card(0, 5, false), card(2, 9, false), card(3, 2, false), card(1, 13, false)];
    expect(drawCards(s, 1)).toBe(true);
    expect(s.waste.map((c) => c.id)).toEqual([card(1, 13).id]); // the stock's top
    expect(s.waste[0].faceUp).toBe(true);
    expect(s.stock.length).toBe(3);

    const s3 = emptyState();
    s3.stock = [card(0, 5, false), card(2, 9, false), card(3, 2, false), card(1, 13, false), card(0, 1, false)];
    expect(drawCards(s3, 3)).toBe(true);
    expect(s3.waste.map((c) => c.rank)).toEqual([1, 13, 2]); // A♠, K♥, then 2♣ on top
    expect(movingCards(s3, { zone: "waste" })!.map((c) => c.id)).toEqual([card(3, 2).id]);
    // Play the top away and the next card down becomes the waste's top.
    s3.tableau[0] = [card(1, 3)]; // 3♥
    expect(applyMove(s3, { zone: "waste" }, { zone: "tableau", pile: 0 })).toBe(true);
    expect(movingCards(s3, { zone: "waste" })!.map((c) => c.id)).toEqual([card(1, 13).id]);

    const short = emptyState();
    short.stock = [card(0, 4, false), card(0, 6, false)];
    expect(drawCards(short, 3)).toBe(true); // a short stock deals what it has
    expect(short.waste.length).toBe(2);
    expect(drawCards(short, 1)).toBe(false); // and an empty one refuses
  });

  test("recycling restores the stock order exactly, in both draw modes", () => {
    for (const mode of [1, 3] as const) {
      const s = emptyState();
      const ids = [3, 17, 25, 40, 51, 8, 30];
      s.stock = ids.map((id) => ({
        id,
        suit: Math.floor(id / 13) as Suit,
        rank: (id % 13) + 1,
        faceUp: false,
      }));
      const original = s.stock.map((c) => c.id);
      while (s.stock.length) drawCards(s, mode);
      const firstWaste = s.waste.map((c) => c.id);
      expect(recycleStock(s)).toBe(true);
      expect(s.stock.map((c) => c.id)).toEqual(original);
      expect(s.stock.every((c) => !c.faceUp)).toBe(true);
      expect(s.waste).toEqual([]);
      while (s.stock.length) drawCards(s, mode);
      expect(s.waste.map((c) => c.id)).toEqual(firstWaste); // the same sequence again
      expect(recycleStock(s)).toBe(true); // unlimited passes…
      expect(recycleStock(s)).toBe(false); // …but never over a live stock
    }
  });

  test("undo walks back through a move, a flip, draws and a recycle", () => {
    const s = emptyState();
    s.tableau[0] = [card(0, 4, false), card(1, 12)]; // 4♠ face-down under Q♥
    s.tableau[1] = [card(3, 13)]; // K♣
    s.stock = [card(2, 6, false), card(0, 9, false)];
    const history: GameState[] = [];
    const seen: string[] = [ser(s)];
    let cur = s;
    const step = (fn: (st: GameState) => boolean) => {
      pushHistory(history, cur);
      expect(fn(cur)).toBe(true);
      seen.push(ser(cur));
    };
    step((st) => applyMove(st, { zone: "tableau", pile: 0, index: 1 }, { zone: "tableau", pile: 1 }));
    expect(cur.tableau[0]).toEqual([card(0, 4, true)]); // the move flipped the 4♠
    step((st) => drawCards(st, 1));
    step((st) => drawCards(st, 1));
    step((st) => recycleStock(st));
    for (let i = seen.length - 2; i >= 0; i--) {
      const prev = popHistory(history);
      expect(prev).not.toBeNull();
      cur = prev!;
      expect(ser(cur)).toBe(seen[i]);
    }
    expect(popHistory(history)).toBeNull();
    expect(cur.tableau[0][0].faceUp).toBe(false); // the flip itself is undone
  });

  test("auto-move prefers the foundation, then the tableau; foundation cards stay put", () => {
    const s = emptyState();
    s.tableau[0] = [card(0, 1)]; // A♠
    expect(findAutoMove(s, { zone: "tableau", pile: 0, index: 0 })).toEqual({ zone: "foundation", pile: 0 });
    const s2 = emptyState();
    s2.tableau[0] = [card(1, 7)]; // 7♥
    s2.tableau[1] = [card(0, 8)]; // 8♠ takes it
    expect(findAutoMove(s2, { zone: "tableau", pile: 0, index: 0 })).toEqual({ zone: "tableau", pile: 1 });
    const s3 = emptyState();
    s3.foundations[0] = [card(0, 1), card(0, 2)];
    s3.tableau[0] = [card(1, 3)]; // 3♥ could take the 2♠ — still no auto-move
    expect(findAutoMove(s3, { zone: "foundation", pile: 0 })).toBeNull();
  });

  test("the game is won when the foundations hold all 52 cards", () => {
    const s = emptyState();
    for (let suit = 0 as Suit; suit < 4; suit = (suit + 1) as Suit) {
      const upto = suit === 3 ? 12 : 13;
      for (let r = 1; r <= upto; r++) s.foundations[suit].push(card(suit, r));
    }
    expect(isWin(s)).toBe(false);
    s.waste = [card(3, 13)]; // the last King
    expect(applyMove(s, { zone: "waste" }, { zone: "foundation", pile: 3 })).toBe(true);
    expect(isWin(s)).toBe(true);
  });
});
