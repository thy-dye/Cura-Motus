import { useEffect, useState } from "react";
import NavBar from "./Navbar.jsx";
import { exerciseLabel, isLockedExercise } from "./exercises.js";

export default function HomePage({ user, userName = "User", onNavigate, onLogout, theme, onToggleTheme }) {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const activitiesRes = await fetch(`/backend/activities/get_user?user_id=${user.id}`);
        if (activitiesRes.status === 404) {
          if (!cancelled) setExercises([]);
          return;
        }
        const activitiesData = await activitiesRes.json().catch(() => null);
        if (!activitiesRes.ok) {
          if (!cancelled) setError("Couldn't load your exercises.");
          return;
        }
        const plan = activitiesData?.[0]?.Exercises?.plan || [];

        // Completions are supplementary (just for checkmarks). A failure
        // here shouldn't block showing the exercise list itself.
        let completedToday = new Set();
        try {
          const completionsRes = await fetch(
            `/backend/completion/get_user_exercises?user_id=${user.id}`
          );
          if (completionsRes.ok) {
            const completions = await completionsRes.json().catch(() => []);
            const today = new Date().toDateString();
            completedToday = new Set(
              (completions || [])
                .filter((c) => new Date(c.Completion).toDateString() === today)
                .map((c) => c.ExerciseName)
            );
          }
        } catch {
          // ignore, exercises just show as not-done
        }

        if (!cancelled) {
          setExercises(
            plan.map((item, index) => ({
              id: index,
              name: item.name || exerciseLabel(item.exercise_id),
              sets: item.sets,
              reps: item.reps,
              done: completedToday.has(
                isLockedExercise(item.exercise_id) ? item.exercise_id : item.name
              ),
            }))
          );
        }
      } catch {
        if (!cancelled) setError("Couldn't reach the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const completedCount = exercises.filter((e) => e.done).length;

  const nextExercise = exercises.find((e) => !e.done);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <NavBar
        activePath="home"
        onNavigate={onNavigate}
        onLogout={onLogout}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      <main className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-6">
          Welcome, {userName}!
        </h1>

        <div className="grid grid-cols-2 gap-4 mb-10">
          <button
            type="button"
            onClick={() => onNavigate && onNavigate("session")}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] py-8 text-center font-semibold text-[var(--foreground)] transition-all hover:border-[var(--primary)] hover:bg-[var(--primary)]/10 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
          >
            Start Session
          </button>
          <button
            type="button"
            onClick={() => onNavigate && onNavigate("plan")}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] py-8 text-center font-semibold text-[var(--foreground)] transition-all hover:border-[var(--primary)] hover:bg-[var(--primary)]/10 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
          >
            Edit my Plan
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Loading your exercises…
          </p>
        ) : error ? (
          <p className="text-sm text-[var(--error)]">{error}</p>
        ) : exercises.length === 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
            <p className="text-sm text-[var(--muted-foreground)] mb-4">
              You don't have a plan yet.
            </p>
            <button
              type="button"
              onClick={() => onNavigate && onNavigate("plan")}
              className="rounded-lg bg-[var(--primary)] px-6 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors"
            >
              Create a Plan
            </button>
          </div>
        ) : (
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
                    <div
                      role="img"
                      aria-label={
                        exercise.done
                          ? `${exercise.name} completed today`
                          : `${exercise.name} not completed yet`
                      }
                      className={`flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${
                        exercise.done
                          ? "pop-in border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
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
                    </div>
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
        )}
      </main>
    </div>
  );
}
