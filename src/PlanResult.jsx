import { useEffect, useState } from "react";
import { exerciseLabel } from "./exercises.js";

const PLAN_TIPS = [
  "Warming up for 5-10 minutes before exercising can significantly reduce injury risk.",
  "Consistency beats intensity. A little movement every day adds up over time.",
  "Good form matters more than how much weight you lift or how fast you move.",
  "Rest days aren't wasted. That's when your muscles actually rebuild stronger.",
  "Staying hydrated helps your joints and muscles perform their best.",
  "Steady breathing through each rep helps you keep control and stay balanced.",
  "Stretching after a workout can help improve flexibility over time.",
];

export default function PlanResult({ submitting, result, onFinish }) {
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    if (!submitting) {
      setTipIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % PLAN_TIPS.length);
    }, 7000);
    return () => clearInterval(interval);
  }, [submitting]);

  if (result) {
    const hasExercises = result.plan && result.plan.length > 0;

    if (!hasExercises) {
      return (
        <div className="flex flex-col items-center text-center py-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--secondary)] text-[var(--foreground)] mb-5">
            <svg width="20" height="20" viewBox="0 0 12 12" fill="none">
              <path
                d="M6 3.5V7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx="6" cy="9" r="0.75" fill="currentColor" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[var(--foreground)] mb-3">
            We couldn't generate exercises for this
          </h1>
          {result.disclaimer && (
            <p className="text-sm text-[var(--foreground)] mb-8 max-w-md">
              {result.disclaimer}
            </p>
          )}
          <button
            type="button"
            onClick={onFinish}
            className="rounded-lg bg-[var(--primary)] px-6 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors"
          >
            Back to Home
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center text-center py-10">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] mb-5">
          <svg width="24" height="24" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 6L5 9L10 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-[var(--foreground)] mb-2">
          Your plan is ready!
        </h1>
        {result.disclaimer && (
          <p className="text-sm text-[var(--muted-foreground)] mb-8 max-w-sm">
            {result.disclaimer}
          </p>
        )}

        <div className="w-full flex flex-col gap-3 mb-8 text-left">
          {result.plan.map((item, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-[var(--foreground)]">
                  {item.name || exerciseLabel(item.exercise_id)}
                </span>
                <span
                  className="text-sm text-[var(--muted-foreground)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {item.sets} × {item.reps}
                </span>
              </div>
              {item.note && (
                <p className="text-sm text-[var(--secondary-foreground)]">
                  {item.note}
                </p>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onFinish}
          className="rounded-lg bg-[var(--primary)] px-6 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors"
        >
          Go to Home
        </button>
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-24">
        <div className="h-12 w-12 rounded-full border-4 border-[var(--secondary)] border-t-[var(--primary)] animate-spin mb-6" />
        <h1 className="text-xl font-bold text-[var(--foreground)] mb-3">
          Building your plan…
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] max-w-sm">
          {PLAN_TIPS[tipIndex]}
        </p>
      </div>
    );
  }

  return null;
}
