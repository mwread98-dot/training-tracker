import { useMemo } from "react";

export type CalendarWorkout = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  type?: string | null;
  intensity?: string | null;
  completed?: boolean | null;
};

type Props = {
  year: number;
  month: number; // 0-indexed
  workouts: CalendarWorkout[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onDayClick?: (dateIso: string) => void;
  onWorkoutClick?: (workout: CalendarWorkout) => void;
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toIso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function chipClass(w: CalendarWorkout) {
  if (w.completed) return "workout-chip completed";
  if (w.type === "rest") return "workout-chip rest";
  if (w.intensity === "hard" || w.intensity === "race_pace") return "workout-chip hard";
  return "workout-chip";
}

export default function CalendarGrid({
  year,
  month,
  workouts,
  onPrevMonth,
  onNextMonth,
  onDayClick,
  onWorkoutClick,
}: Props) {
  const byDate = useMemo(() => {
    const map: Record<string, CalendarWorkout[]> = {};
    for (const w of workouts) {
      if (!map[w.date]) map[w.date] = [];
      map[w.date].push(w);
    }
    return map;
  }, [workouts]);

  const cells = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const result: { day: number; iso: string; outside: boolean }[] = [];

    for (let i = startOffset - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const m = month === 0 ? 11 : month - 1;
      const y = month === 0 ? year - 1 : year;
      result.push({ day: d, iso: toIso(y, m, d), outside: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      result.push({ day: d, iso: toIso(year, month, d), outside: false });
    }
    while (result.length % 7 !== 0 || result.length < 35) {
      const last = result[result.length - 1];
      const [y, m, d] = last.iso.split("-").map(Number);
      const next = new Date(y, m - 1, d + 1);
      result.push({
        day: next.getDate(),
        iso: toIso(next.getFullYear(), next.getMonth(), next.getDate()),
        outside: true,
      });
    }
    return result;
  }, [year, month]);

  const todayIso = toIso(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate()
  );

  return (
    <div>
      <div className="calendar-header">
        <button className="btn" onClick={onPrevMonth}>← Prev</button>
        <h2>{MONTH_NAMES[month]} {year}</h2>
        <button className="btn" onClick={onNextMonth}>Next →</button>
      </div>
      <div className="calendar-grid">
        {DOW.map((d) => (
          <div className="calendar-dow" key={d}>{d}</div>
        ))}
        {cells.map((cell) => (
          <div
            key={cell.iso}
            className={`calendar-day ${cell.outside ? "outside" : ""} ${
              cell.iso === todayIso ? "today" : ""
            }`}
            onClick={() => !cell.outside && onDayClick?.(cell.iso)}
            style={{ cursor: onDayClick && !cell.outside ? "pointer" : "default" }}
          >
            {!cell.outside && <span className="daynum">{cell.day}</span>}
            {(byDate[cell.iso] ?? []).map((w) => (
              <button
                key={w.id}
                className={chipClass(w)}
                onClick={(e) => {
                  e.stopPropagation();
                  onWorkoutClick?.(w);
                }}
                title={w.title}
              >
                {w.title}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
