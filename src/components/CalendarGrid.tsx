import { Fragment, useMemo } from "react";

export type CalendarWorkout = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  type?: string | null;
  intensity?: string | null;
  completed?: boolean | null;
  distanceKm?: number | null;
  durationMin?: number | null;
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

// Monday-first week.
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
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

function formatDuration(totalMin: number) {
  if (totalMin <= 0) return null;
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
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
    // getDay(): 0=Sun..6=Sat. Convert to a Monday-first offset: 0=Mon..6=Sun.
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
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

  const weekTotals = useMemo(() => {
    const totals: { km: number; min: number }[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      let km = 0;
      let min = 0;
      for (let j = i; j < i + 7; j++) {
        for (const w of byDate[cells[j].iso] ?? []) {
          km += w.distanceKm ?? 0;
          min += w.durationMin ?? 0;
        }
      }
      totals.push({ km, min });
    }
    return totals;
  }, [cells, byDate]);

  const monthTotal = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    let km = 0;
    let min = 0;
    for (const w of workouts) {
      if (!w.date.startsWith(prefix)) continue;
      km += w.distanceKm ?? 0;
      min += w.durationMin ?? 0;
    }
    return { km, min };
  }, [workouts, year, month]);

  const todayIso = toIso(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate()
  );

  const monthDuration = formatDuration(monthTotal.min);

  return (
    <div>
      <div className="calendar-header">
        <button className="btn" onClick={onPrevMonth}>← Prev</button>
        <div style={{ textAlign: "center" }}>
          <h2>{MONTH_NAMES[month]} {year}</h2>
          {(monthTotal.km > 0 || monthDuration) && (
            <p className="month-total-line">
              {monthTotal.km > 0 && `${monthTotal.km.toFixed(1)} km`}
              {monthTotal.km > 0 && monthDuration && " · "}
              {monthDuration && monthDuration}
              {" planned this month"}
            </p>
          )}
        </div>
        <button className="btn" onClick={onNextMonth}>Next →</button>
      </div>
      <div className="calendar-grid">
        {DOW.map((d) => (
          <div className="calendar-dow" key={d}>{d}</div>
        ))}
        <div className="calendar-dow total-col">Week</div>

        {Array.from({ length: cells.length / 7 }).map((_, weekIdx) => (
          <Fragment key={weekIdx}>
            {cells.slice(weekIdx * 7, weekIdx * 7 + 7).map((cell) => (
              <div
                key={cell.iso}
                className={`calendar-day ${cell.outside ? "outside" : ""} ${
                  cell.iso === todayIso ? "today" : ""
                }`}
                onClick={() => onDayClick?.(cell.iso)}
                style={{ cursor: onDayClick ? "pointer" : "default" }}
              >
                <span className="daynum">{cell.day}</span>
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
            <div className="week-total">
              {weekTotals[weekIdx].km > 0 && (
                <strong>{weekTotals[weekIdx].km.toFixed(1)} km</strong>
              )}
              {formatDuration(weekTotals[weekIdx].min) && (
                <span>{formatDuration(weekTotals[weekIdx].min)}</span>
              )}
              {weekTotals[weekIdx].km === 0 && weekTotals[weekIdx].min === 0 && (
                <span>—</span>
              )}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
