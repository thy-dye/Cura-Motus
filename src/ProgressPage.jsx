import { useEffect, useState } from "react";
import NavBar from "./Navbar.jsx";
import WeekGrid from "./WeekGrid.jsx";
import { exerciseLabel } from "./exercises.js";
import { dayKey, calculateStreak } from "./streak.js";

function buildBreakdown(completions) {
  const byExercise = new Map();
  for (const c of completions) {
    const date = new Date(c.Completion);
    const existing = byExercise.get(c.ExerciseName);
    if (!existing) {
      byExercise.set(c.ExerciseName, { exerciseId: c.ExerciseName, count: 1, lastCompleted: date });
    } else {
      existing.count += 1;
      if (date > existing.lastCompleted) existing.lastCompleted = date;
    }
  }
  return Array.from(byExercise.values()).sort((a, b) => b.lastCompleted - a.lastCompleted);
}

function formatRelativeDate(date) {
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86400000));
  const key = dayKey(date);
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ProgressPage({ user, onNavigate, onLogout, theme, onToggleTheme }) {
  const [completions, setCompletions] = useState([]);
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
        const res = await fetch(`/backend/completion/get_user_exercises?user_id=${user.id}`);
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          if (!cancelled) setError("Couldn't load your progress.");
          return;
        }
        if (!cancelled) setCompletions(data || []);
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

  const completedDayKeys = new Set(completions.map((c) => dayKey(c.Completion)));
  const streak = calculateStreak(completedDayKeys);
  const breakdown = buildBreakdown(completions);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <NavBar
        activePath="progress"
        onNavigate={onNavigate}
        onLogout={onLogout}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      <main className="mx-auto max-w-3xl px-8 py-10">
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-6">
          Your Progress
        </h1>

        {loading ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Loading your progress…
          </p>
        ) : error ? (
          <p className="text-sm text-[var(--error)]">{error}</p>
        ) : completions.length === 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
            <p className="text-sm text-[var(--muted-foreground)] mb-4">
              You haven't completed any exercises yet. Finish a session to start
              tracking your progress.
            </p>
            <button
              type="button"
              onClick={() => onNavigate && onNavigate("home")}
              className="rounded-lg bg-[var(--primary)] px-6 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors"
            >
              Back to Home
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
                <p className="text-sm text-[var(--muted-foreground)] mb-1">
                  Total Completed
                </p>
                <p
                  className="text-3xl font-bold text-[var(--foreground)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {completions.length}
                </p>
              </div>
              <div
                className="rounded-xl border p-5"
                style={{
                  borderColor: "var(--accent)",
                  backgroundColor: "color-mix(in srgb, var(--accent) 12%, var(--card))",
                }}
              >
                <p className="text-sm mb-1" style={{ color: "var(--accent)" }}>
                  Current Streak
                </p>
                <p
                  className="text-3xl font-bold"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}
                >
                  {streak} {streak === 1 ? "day" : "days"}
                </p>
              </div>
            </div>

            <WeekGrid completedDayKeys={completedDayKeys} />

            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[var(--border)]">
                <span className="font-semibold text-[var(--foreground)]">
                  Exercise Breakdown
                </span>
              </div>
              <ul>
                {breakdown.map((item) => (
                  <li
                    key={item.exerciseId}
                    className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] last:border-b-0"
                  >
                    <span className="font-medium text-[var(--foreground)]">
                      {exerciseLabel(item.exerciseId)}
                    </span>
                    <div className="flex items-center gap-4 text-sm text-[var(--muted-foreground)]">
                      <span style={{ fontFamily: "var(--font-mono)" }}>
                        {item.count} {item.count === 1 ? "time" : "times"}
                      </span>
                      <span>Last: {formatRelativeDate(item.lastCompleted)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
