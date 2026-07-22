import { dayKey, getWeekDays, WEEKDAY_LABELS } from "./streak.js";

// "This Week" activity grid, shared by Homepage (compact, with the streak
// folded into the header) and the Progress page (its own separate streak
// card sits next to this one, so it's used there without the streak prop).
export default function WeekGrid({ completedDayKeys, streak, title = "This Week" }) {
  const weekDays = getWeekDays();
  const todayKey = dayKey(new Date());

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-[var(--foreground)]">{title}</h2>
        {streak > 0 && (
          <span
            className="rounded-full border px-3 py-1 text-sm font-semibold"
            style={{
              borderColor: "var(--accent)",
              color: "var(--accent)",
              backgroundColor: "color-mix(in srgb, var(--accent) 12%, var(--card))",
            }}
          >
            {streak} {streak === 1 ? "day" : "days"} streak
          </span>
        )}
      </div>
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
  );
}
