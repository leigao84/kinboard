import { NextResponse } from "next/server";
import bank from "@/lib/trivia-questions.json";

// The bank itself never changes at runtime, but every call samples anew.
export const dynamic = "force-dynamic";

interface TriviaBank {
  cats: string[];
  qs: [number, string, string][];
}

const { cats, qs } = bank as unknown as TriviaBank;

/**
 * A random handful of trivia questions for the screensaver's "Did you
 * know?" card. The bank is the Open Trivia DB's multiple-choice set
 * (CC BY-SA 4.0), baked into the app as lib/trivia-questions.json —
 * [category index, question, correct answer] per row — so this works
 * with no internet and never touches an outside service.
 */
export async function GET(request: Request) {
  const raw = parseInt(new URL(request.url).searchParams.get("count") ?? "10", 10);
  const count = Number.isFinite(raw) ? Math.min(25, Math.max(1, raw)) : 10;
  const picked = new Set<number>();
  while (picked.size < Math.min(count, qs.length)) {
    picked.add(Math.floor(Math.random() * qs.length));
  }
  const questions = [...picked].map((i) => {
    const [ci, q, a] = qs[i];
    return { q, a, c: cats[ci] ?? "" };
  });
  return NextResponse.json({ questions });
}
