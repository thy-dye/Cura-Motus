import { useEffect, useState } from "react";
import NavBar from "./Navbar.jsx";
import { exerciseLabel } from "./exercises.js";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayKey(dateLike) {
  return new Date(dateLike).toDateString();
}

function startOfWeek(date) {
  const d = new Date(date);
  const mondayOffset = (d.getDay() + 6) % 7; // Sunday=0 -> 6, Monday=1 -> 0, ...
  d.setDate(d.getDate() - mondayOffset);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDays() {
  const monday = startOfWeek(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function calculateStreak(completedDayKeys) {
  const today = new Date();
  const cursor = new Date(today);

  // If nothing's logged yet today, the streak isn't broken until today
  // actually ends, so start counting from yesterday instead.
  if (!completedDayKeys.has(dayKey(today))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (completedDayKeys.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

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

export default function ProgressPage({ user, onNavigate, onLogout }) {
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
  const weekDays = getWeekDays();
  const breakdown = buildBreakdown(completions);
  const todayKey = dayKey(new Date());

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <NavBar activePath="progress" onNavigate={onNavigate} onLogout={onLogout} />

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
              <div className="rounded-xl bg-[var(--primary)] p-5 text-[var(--primary-foreground)]">
                <p className="text-sm opacity-90 mb-1">Current Streak</p>
                <p
                  className="text-3xl font-bold"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {streak} {streak === 1 ? "day" : "days"}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 mb-8">
              <h2 className="font-semibold text-[var(--foreground)] mb-4">
                This Week
              </h2>
              <div className="grid grid-cols-7 gap-2">
                {weekDays.map((day, i) => {
                  const key = dayKey(day);
                  const active = completedDayKeys.has(key);
                  const isToday = key === todayKey;
                  return (
                    <div key={i} className="flex flex-col items-center gap-2">
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {WEEKDAY_LABELS[i]}
                      </span>
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                          active
                            ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                            : "bg-[var(--secondary)] text-[var(--muted-foreground)]"
                        } ${isToday ? "ring-2 ring-[var(--ring)] ring-offset-2 ring-offset-[var(--card)]" : ""}`}
                      >
                        {day.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

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
