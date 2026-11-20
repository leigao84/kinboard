"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Lightbulb } from "lucide-react";

interface TriviaQuestion {
  q: string;
  a: string;
  c: string;
  wrong: string[];
}

interface Choice {
  text: string;
  correct: boolean;
}

/** How long one question stays up. */
const QUESTION_MS = 24_000;
const BATCH = 12;

/**
 * When each wrong choice gets crossed out, spread across the question's
 * run: the first goes early, the last leaves the correct answer a few
 * seconds alone on stage before the rotation moves on. A lone wrong
 * choice (true/false questions) goes mid-run.
 */
function eliminationTimes(wrongCount: number): number[] {
  if (wrongCount <= 0) return [];
  if (wrongCount === 1) return [14_000];
  return Array.from({ length: wrongCount }, (_, i) => 8_000 + (i * 11_000) / (wrongCount - 1));
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A rotating trivia quiz on the screensaver: the question sits under the
 * news list (or in its place, when the news is off) with every one of its
 * answers shown, and the wrong answers are crossed out one by one until
 * only the correct one is left. Questions come from /api/trivia, which
 * samples the Open Trivia DB bank baked into the app, so the screensaver
 * needs no internet for them. Settings -> Screensaver -> Trivia.
 *
 * Mounted only while the option is on, so a family without it fetches
 * nothing for the screensaver.
 */
export function ScreensaverTrivia({ large }: { large: boolean }) {
  const t = useTranslations("components.screensaver");
  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [eliminated, setEliminated] = useState(0);
  const fetching = useRef(false);

  const loadBatch = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const res = await fetch(`/api/trivia?count=${BATCH}`);
      if (!res.ok) return;
      const data = (await res.json()) as { questions?: TriviaQuestion[] };
      if (data.questions && data.questions.length > 0) {
        setQuestions(data.questions);
        setIndex(0);
        setEliminated(0);
      }
    } catch {
      // No questions, no card: the screensaver carries on without one.
    } finally {
      fetching.current = false;
    }
  }, []);

  useEffect(() => {
    void loadBatch();
  }, [loadBatch]);

  const current = questions[index];

  /**
   * One stable layout per question: the choices shuffled once, and the
   * wrong ones in a shuffled striking order. The correct choice is never
   * in the striking order, so it can never be crossed out.
   */
  const round = useMemo(() => {
    if (!current) return null;
    const choices = shuffled<Choice>([
      { text: current.a, correct: true },
      ...current.wrong.map((text) => ({ text, correct: false })),
    ]);
    const strikeOrder = shuffled(choices.flatMap((choice, i) => (choice.correct ? [] : [i])));
    return { choices, strikeOrder };
  }, [current]);

  useEffect(() => {
    if (!current || !round) return;
    setEliminated(0);
    const timers = eliminationTimes(round.strikeOrder.length).map((at, k) =>
      setTimeout(() => setEliminated(k + 1), at),
    );
    const nextTimer = setTimeout(() => {
      if (index + 1 < questions.length) {
        setIndex(index + 1);
      } else {
        void loadBatch();
      }
    }, QUESTION_MS);
    return () => {
      for (const timer of timers) clearTimeout(timer);
      clearTimeout(nextTimer);
    };
  }, [current, round, index, questions.length, loadBatch]);

  if (!current || !round) return null;

  const struck = new Set(round.strikeOrder.slice(0, eliminated));
  const done = eliminated >= round.strikeOrder.length;
  const category = current.c.replace(/^(Entertainment|Science): /, "");

  return (
    <div className="flex flex-col gap-2 landscape:lg:gap-3" data-testid="screensaver-trivia">
      <div className="flex items-center gap-2 text-white/60">
        <Lightbulb className="size-4" />
        <span className={`${large ? "text-lg" : "text-xs landscape:lg:text-sm"} font-medium uppercase tracking-wider`}>{t("triviaLabel")}</span>
        <span className={`${large ? "text-base" : "text-xs"} text-white/40`}>{category}</span>
      </div>
      <div className="screensaver-panel rounded-lg px-3 py-2 landscape:lg:px-4 landscape:lg:py-3 gpu-blur">
        <p className={`panel-fg ${large ? "text-xl" : "text-sm"}`}>{current.q}</p>
        <ul className="mt-2 flex flex-col gap-1" data-testid="trivia-choices">
          {round.choices.map((choice, i) => {
            const isStruck = struck.has(i);
            const isWinner = choice.correct && done;
            return (
              <li
                key={i}
                data-correct={choice.correct || undefined}
                data-struck={isStruck || undefined}
                className={`flex items-start gap-1.5 transition-all duration-700 ${large ? "text-lg" : "text-sm"} ${
                  isStruck
                    ? "panel-fg-40 line-through opacity-50"
                    : isWinner
                      ? "font-semibold panel-amber"
                      : "panel-fg-90"
                }`}
              >
                <Check
                  aria-hidden
                  className={`mt-0.5 size-4 shrink-0 transition-opacity duration-700 ${isWinner ? "opacity-100" : "opacity-0"}`}
                />
                <span>{choice.text}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
