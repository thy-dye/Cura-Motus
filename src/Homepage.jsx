import { useState } from "react";
import NavBar from "./Navbar.jsx";

// TODO: replace with real data from Flask (GET /backend/activities/get_user or similar)
const MOCK_EXERCISES = [
  { id: 1, name: "Calf Raises", sets: 3, reps: 15, done: true },
  { id: 2, name: "Straight Leg Raises", sets: 3, reps: 10, done: true },
  { id: 3, name: "Terminal Knee Extension", sets: 3, reps: 10, done: false },
];

export default function HomePage({ userName = "User", onNavigate }) {
  const [exercises, setExercises] = useState(MOCK_EXERCISES);

  const completedCount = exercises.filter((e) => e.done).length;

  const toggleDone = (id) => {
    setExercises((prev) =>
      prev.map((e) => (e.id === id ? { ...e, done: !e.done } : e))
    );
  };

  const nextExercise = exercises.find((e) => !e.done);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <NavBar activePath="home" onNavigate={onNavigate} />

      <main className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-6">
          Welcome, {userName}!
        </h1>

        <div className="grid grid-cols-2 gap-4 mb-10">
          <button
            type="button"
            onClick={() => onNavigate && onNavigate("session")}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] py-8 text-center font-semibold text-[var(--foreground)] transition-colors hover:border-[var(--primary)] hover:bg-[var(--secondary)]"
          >
            Start Session
          </button>
          <button
            type="button"
            onClick={() => onNavigate && onNavigate("plan")}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] py-8 text-center font-semibold text-[var(--foreground)] transition-colors hover:border-[var(--primary)] hover:bg-[var(--secondary)]"
          >
            Edit my Plan
          </button>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
            <span className="font-semibold text-[var(--foreground)]">
              Today's Exercises
            </span>
            <span
              className="text-sm text-[var(--muted-foreground)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {completedCount} / {exercises.length} done
            </span>
          </div>

          <ul>
            {exercises.map((exercise) => (
              <li
                key={exercise.id}
                className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleDone(exercise.id)}
                    aria-label={
                      exercise.done
                        ? `Mark ${exercise.name} as not done`
                        : `Mark ${exercise.name} as done`
                    }
                    className={`flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${
                      exercise.done
                        ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                        : "border-[var(--border)] bg-[var(--card)]"
                    }`}
                  >
                    {exercise.done && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                      >
                        <path
                          d="M2 6L5 9L10 3"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                  <span
                    className={
                      exercise.done
                        ? "line-through text-[var(--muted-foreground)]"
                        : "font-medium text-[var(--foreground)]"
                    }
                  >
                    {exercise.name}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <span
                    className="text-sm text-[var(--muted-foreground)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {exercise.sets} × {exercise.reps}
                  </span>
                  {!exercise.done && nextExercise?.id === exercise.id && (
                    <button
                      type="button"
                      onClick={() => onNavigate && onNavigate("session")}
                      className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)] transition-colors hover:bg-[var(--primary-hover)]"
                    >
                      Start
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}