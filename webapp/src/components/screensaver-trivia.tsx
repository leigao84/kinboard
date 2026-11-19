"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Lightbulb } from "lucide-react";

interface TriviaQuestion {
  q: string;
  a: string;
  c: string;
}

/** How long one question stays up, and when its answer fades in. */
const QUESTION_MS = 24_000;
const REVEAL_MS = 12_000;
const BATCH = 12;

/**
 * A rotating "Did you know?" trivia question on the screensaver: the
 * question sits in the stack with the events and birthdays, its answer
 * fades in halfway through so the room gets a moment to guess, and the
 * next question follows. Questions come from /api/trivia, which samples
 * the Open Trivia DB bank baked into the app, so the screensaver needs
 * no internet for them. Settings -> Screensaver -> Trivia.
 *
 * Mounted only while the option is on, so a family without it fetches
 * nothing for the screensaver.
 */
export function ScreensaverTrivia({ large }: { large: boolean }) {
  const t = useTranslations("components.screensaver");
  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
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
        setRevealed(false);
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

  useEffect(() => {
    if (!current) return;
    setRevealed(false);
    const revealTimer = setTimeout(() => setRevealed(true), REVEAL_MS);
    const nextTimer = setTimeout(() => {
      if (index + 1 < questions.length) {
        setIndex(index + 1);
      } else {
        void loadBatch();
      }
    }, QUESTION_MS);
    return () => {
      clearTimeout(revealTimer);
      clearTimeout(nextTimer);
    };
  }, [current, index, questions.length, loadBatch]);

  if (!current) return null;

  const category = current.c.replace(/^(Entertainment|Science): /, "");

  return (
    <div className="flex flex-col gap-2 landscape:lg:gap-3" data-testid="screensaver-trivia">
      <div className="flex items-center gap-2 text-white/60">
        <Lightbulb className="size-4" />
        <span className={`${large ? "text-lg" : "text-xs landscape:lg:text-sm"} font-medium uppercase tracking-wider`}>{t("triviaLabel")}</span>
        <span className={`${large ? "text-base" : "text-xs"} text-white/40`}>{category}</span>
      </div>
      <div className="bg-black/40 rounded-lg px-3 py-2 landscape:lg:px-4 landscape:lg:py-3 gpu-blur">
        <p className={`text-white ${large ? "text-xl" : "text-sm"}`}>{current.q}</p>
        <p
          aria-hidden={!revealed}
          className={`mt-1 font-medium text-amber-200 transition-opacity duration-1000 ${large ? "text-lg" : "text-sm"} ${revealed ? "opacity-100" : "opacity-0"}`}
        >
          {current.a}
        </p>
      </div>
    </div>
  );
}
