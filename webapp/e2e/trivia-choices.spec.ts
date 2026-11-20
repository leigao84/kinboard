import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * The screensaver trivia is a quiz, not a fact card: the question shows
 * with every one of its answers, and the wrong answers are crossed out
 * one by one until only the correct one is left. Source guards for the
 * bank, the API route and the component, plus the bank's data integrity
 * (a question whose "wrong" answers contain the right one would break
 * the format silently).
 */

const bank = JSON.parse(readFileSync("src/lib/trivia-questions.json", "utf8")) as {
  cats: string[];
  qs: unknown[][];
};
const route = readFileSync("src/app/api/trivia/route.ts", "utf8");
const component = readFileSync("src/components/screensaver-trivia.tsx", "utf8");

test("every bank question carries three wrong answers beside the correct one", () => {
  expect(bank.qs.length).toBeGreaterThan(4000);
  for (const row of bank.qs) {
    expect(row).toHaveLength(6);
    const [, q, a, w1, w2, w3] = row as [number, string, string, string, string, string];
    expect(q.length).toBeGreaterThan(0);
    expect(a.length).toBeGreaterThan(0);
    const wrong = [w1, w2, w3];
    for (const w of wrong) expect(w.length).toBeGreaterThan(0);
    expect(new Set(wrong).size).toBe(3);
    expect(wrong).not.toContain(a);
  }
});

test("the trivia API returns the full choice set", () => {
  expect(route).toMatch(/wrong: \[w1, w2, w3\]/);
  expect(route).toMatch(/\[number, string, string, string, string, string\]/);
});

test("the component renders every choice from the start", () => {
  expect(component).toMatch(/data-testid="trivia-choices"/);
  expect(component).toMatch(/round\.choices\.map/);
  expect(component).toMatch(/\{ text: current\.a, correct: true \}/);
});

test("the striking order only ever contains wrong choices", () => {
  // The strike order is built by flat-mapping over the choices and
  // keeping only the non-correct indices, so the correct answer can
  // never be crossed out.
  expect(component).toMatch(/choice\.correct \? \[\] : \[i\]/);
  expect(component).toMatch(/strikeOrder\.slice\(0, eliminated\)/);
  expect(component).toMatch(/line-through/);
});

test("the winner is only marked once every wrong choice is struck", () => {
  expect(component).toMatch(/choice\.correct && done/);
  expect(component).toMatch(/eliminated >= round\.strikeOrder\.length/);
});

test("the old fade-in-the-answer format is gone", () => {
  expect(component).not.toMatch(/REVEAL_MS/);
  expect(component).not.toMatch(/aria-hidden=\{!revealed\}/);
  expect(component).toMatch(/eliminationTimes/);
});

test("the card is framed as a quiz, not a did-you-know fact", () => {
  const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as {
    components: { screensaver: { triviaLabel: string } };
  };
  expect(en.components.screensaver.triviaLabel).toBe("Trivia");
  for (const locale of ["de", "fr", "zh"]) {
    const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as {
      components: { screensaver: { triviaLabel: string } };
    };
    expect(messages.components.screensaver.triviaLabel.length).toBeGreaterThan(0);
    expect(messages.components.screensaver.triviaLabel).not.toMatch(
      /Wusstest du schon|saviez-vous|你知道吗/,
    );
  }
});
