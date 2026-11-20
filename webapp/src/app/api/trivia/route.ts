import { NextResponse } from "next/server";
import bank from "@/lib/trivia-questions.json";

// The bank itself never changes at runtime, but every call samples anew.
export const dynamic = "force-dynamic";

interface TriviaBank {
  cats: string[];
  qs: [number, string, string, string, string, string][];
}

const { cats, qs } = bank as unknown as TriviaBank;

/**
 * A random handful of trivia questions for the screensaver's quiz card.
 * The bank is the Open Trivia DB's multiple-choice set (CC BY-SA 4.0),
 * baked into the app as lib/trivia-questions.json —
 * [category index, question, correct answer, wrong answer x3] per row —
 * so this works with no internet and never touches an outside service.
 * The full choice set travels with each question: the card shows every
 * answer and crosses the wrong ones out one by one.
 */
export async function GET(request: Request) {
  const raw = parseInt(new URL(request.url).searchParams.get("count") ?? "10", 10);
  const count = Number.isFinite(raw) ? Math.min(25, Math.max(1, raw)) : 10;
  const picked = new Set<number>();
  while (picked.size < Math.min(count, qs.length)) {
    picked.add(Math.floor(Math.random() * qs.length));
  }
  const questions = [...picked].map((i) => {
    const [ci, q, a, w1, w2, w3] = qs[i];
    return { q, a, c: cats[ci] ?? "", wrong: [w1, w2, w3] };
  });
  return NextResponse.json({ questions });
}
