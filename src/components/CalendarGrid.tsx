import { Fragment, useMemo, useState } from "react";

export type CalendarWorkout = {
  id: string;
  date: string;
  title: string;
  type?: string | null;
  intensity?: string | null;
  completed?: boolean | null;
  distanceKm?: number | null;
  durationMin?: number | null;
  actualDistanceKm?: number | null;
  actualDurationMin?: number | null;
  source?: string | null;
  hasActualStats?: boolean | null;
};

type Props = {
  year: number;
  month: number;
  workouts: CalendarWorkout[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onDayClick?: (dateIso: string) => void;
  onWorkoutClick?: (workout: CalendarWorkout) => void;
};

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type WeekTotals = {
  plannedKm: number;
  plannedMin: number;
  expectedKm: number;
  expectedMin: number;
  isPastWeek: boolean;
};

type ChartMetric = "km" | "time";

type ChartPoint = {
  weekStartIso: string;
  label: string;
  plannedKm: number;
  plannedMin: number;
  expectedKm: number;
  expectedMin: number;
  isCurrentWeek: boolean;
};

function toIso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseIso(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfWeek(date: Date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - offset);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addWeeks(date: Date, weeks: number) {
  return addDays(date, weeks * 7);
}

function formatDateLabel(date: Date) {
  return `${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`;
}

function isWorkoutCompleted(workout: CalendarWorkout) {
  return !!(
    workout.source === "strava" ||
    workout.completed ||
    workout.hasActualStats ||
    workout.actualDistanceKm ||
    workout.actualDurationMin
  );
}

function plannedDistance(workout: CalendarWorkout) {
  return workout.distanceKm ?? 0;
}

function plannedDuration(workout: CalendarWorkout) {
  return workout.durationMin ?? 0;
}

function completedDistance(workout: CalendarWorkout) {
  if (!isWorkoutCompleted(workout)) return 0;
  return workout.actualDistanceKm ?? workout.distanceKm ?? 0;
}

function completedDuration(workout: CalendarWorkout) {
  if (!isWorkoutCompleted(workout)) return 0;
  return workout.actualDurationMin ?? workout.durationMin ?? 0;
}

function chipClass(w: CalendarWorkout) {
  if (w.source === "strava") return "workout-chip completed";
  if (w.completed && w.hasActualStats) return "workout-chip completed";
  if (w.completed) return "workout-chip completed";
  if (w.type === "rest") return "workout-chip rest";
  if (w.intensity === "hard" || w.intensity === "race_pace") return "workout-chip hard";
  return "workout-chip";
}

function chipLabel(w: CalendarWorkout) {
  if (w.source === "strava") return `🏃 ${w.title}`;
  if (w.hasActualStats) return `✓ ${w.title}`;
  return w.title;
}

function formatDuration(totalMin: number) {
  if (totalMin <= 0) return null;
  const totalSeconds = Math.round(totalMin * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function metricValue(point: ChartPoint, metric: ChartMetric, key: "planned" | "expected") {
  if (metric === "km") {
    return key === "planned" ? point.plannedKm : point.expectedKm;
  }
  return key === "planned" ? point.plannedMin : point.expectedMin;
}

function MetricToggle({ value, onChange }: { value: ChartMetric; onChange: (value: ChartMetric) => void }) {
  return (
    <div
      style={{
        display: "inline-flex",
        background: "var(--surface-muted)",
        borderRadius: 999,
        padding: 4,
        gap: 4,
      }}
    >
      <button
        type="button"
        className={value === "km" ? "btn btn-primary" : "btn"}
        onClick={() => onChange("km")}
      >
        Km
      </button>
      <button
        type="button"
        className={value === "time" ? "btn btn-primary" : "btn"}
        onClick={() => onChange("time")}
      >
        Time
      </button>
    </div>
  );
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
  const [chartMetric, setChartMetric] = useState<ChartMetric>("km");

  const byDate = useMemo(() => {
    const map: Record<string, CalendarWorkout[]> = {};
    for (const w of workouts) {
      if (!map[w.date]) map[w.date] = [];
      map[w.date].push(w);
    }
    for (const date of Object.keys(map)) {
      map[date].sort((a, b) => a.title.localeCompare(b.title));
    }
    return map;
  }, [workouts]);

  const cells = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
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

  const today = new Date();
  const todayIso = toIso(today.getFullYear(), today.getMonth(), today.getDate());
  const currentWeekStart = startOfWeek(today);
  const currentWeekStartIso = toIso(
    currentWeekStart.getFullYear(),
    currentWeekStart.getMonth(),
    currentWeekStart.getDate()
  );

  function getDayTotals(dateIso: string) {
    const items = byDate[dateIso] ?? [];
    const anyCompletedOnThisDate = items.some(isWorkoutCompleted);
    let plannedKm = 0;
    let plannedMin = 0;
    let expectedKm = 0;
    let expectedMin = 0;

    for (const workout of items) {
      plannedKm += plannedDistance(workout);
      plannedMin += plannedDuration(workout);
    }

    if (dateIso < todayIso) {
      for (const workout of items) {
        expectedKm += completedDistance(workout);
        expectedMin += completedDuration(workout);
      }
    } else if (dateIso > todayIso) {
      for (const workout of items) {
        if (isWorkoutCompleted(workout)) {
          expectedKm += completedDistance(workout);
          expectedMin += completedDuration(workout);
        } else {
          expectedKm += plannedDistance(workout);
          expectedMin += plannedDuration(workout);
        }
      }
    } else if (anyCompletedOnThisDate) {
      for (const workout of items) {
        expectedKm += completedDistance(workout);
        expectedMin += completedDuration(workout);
      }
    } else {
      for (const workout of items) {
        expectedKm += plannedDistance(workout);
        expectedMin += plannedDuration(workout);
      }
    }

    return { plannedKm, plannedMin, expectedKm, expectedMin };
  }

  const weekTotals = useMemo(() => {
    const totals: WeekTotals[] = [];

    for (let i = 0; i < cells.length; i += 7) {
      let plannedKm = 0;
      let plannedMin = 0;
      let expectedKm = 0;
      let expectedMin = 0;
      const weekEndIso = cells[i + 6].iso;

      for (let j = i; j < i + 7; j++) {
        const dayTotals = getDayTotals(cells[j].iso);
        plannedKm += dayTotals.plannedKm;
        plannedMin += dayTotals.plannedMin;
        expectedKm += dayTotals.expectedKm;
        expectedMin += dayTotals.expectedMin;
      }

      totals.push({
        plannedKm,
        plannedMin,
        expectedKm,
        expectedMin,
        isPastWeek: weekEndIso < todayIso,
      });
    }

    return totals;
  }, [cells, byDate, todayIso]);

  const monthTotal = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    let km = 0;
    let min = 0;
    for (const w of workouts) {
      if (!w.date.startsWith(prefix)) continue;
      km += isWorkoutCompleted(w) ? completedDistance(w) : plannedDistance(w);
      min += isWorkoutCompleted(w) ? completedDuration(w) : plannedDuration(w);
    }
    return { km, min };
  }, [workouts, year, month]);

  const chartPoints = useMemo(() => {
    const points: ChartPoint[] = [];

    for (let offset = -12; offset <= 6; offset++) {
      const weekStart = addWeeks(currentWeekStart, offset);
      let plannedKm = 0;
      let plannedMin = 0;
      let expectedKm = 0;
      let expectedMin = 0;

      for (let day = 0; day < 7; day++) {
        const date = addDays(weekStart, day);
        const iso = toIso(date.getFullYear(), date.getMonth(), date.getDate());
        const totals = getDayTotals(iso);
        plannedKm += totals.plannedKm;
        plannedMin += totals.plannedMin;
        expectedKm += totals.expectedKm;
        expectedMin += totals.expectedMin;
      }

      points.push({
        weekStartIso: toIso(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()),
        label: formatDateLabel(weekStart),
        plannedKm,
        plannedMin,
        expectedKm,
        expectedMin,
        isCurrentWeek: offset === 0,
      });
    }

    return points;
  }, [byDate, currentWeekStart, todayIso]);

  const monthDuration = formatDuration(monthTotal.min);
  const chartMaxValue = Math.max(
    1,
    ...chartPoints.flatMap((point) => [
      metricValue(point, chartMetric, "planned"),
      metricValue(point, chartMetric, "expected"),
    ])
  );

  return (
    <div>
      <div className="calendar-header">
        <button className="btn" onClick={onPrevMonth}>
          ← Prev
        </button>
        <div style={{ textAlign: "center" }}>
          <h2>
            {MONTH_NAMES[month]} {year}
          </h2>
          {(monthTotal.km > 0 || monthDuration) && (
            <p className="month-total-line">
              {monthTotal.km > 0 && `${monthTotal.km.toFixed(1)} km`}
              {monthTotal.km > 0 && monthDuration && " · "}
              {monthDuration && monthDuration}
              {" total for this month view"}
            </p>
          )}
        </div>
        <button className="btn" onClick={onNextMonth}>
          Next →
        </button>
      </div>

      <div className="calendar-grid">
        {DOW.map((d) => (
          <div className="calendar-dow" key={d}>
            {d}
          </div>
        ))}
        <div className="calendar-dow total-col">Week</div>

        {Array.from({ length: cells.length / 7 }).map((_, weekIdx) => {
          const totals = weekTotals[weekIdx];
          const plannedDuration = formatDuration(totals.plannedMin);
          const expectedDuration = formatDuration(totals.expectedMin);

          return (
            <Fragment key={weekIdx}>
              {cells.slice(weekIdx * 7, weekIdx * 7 + 7).map((cell) => (
                <div
                  key={cell.iso}
                  className={`calendar-day ${cell.outside ? "outside" : ""} ${cell.iso === todayIso ? "today" : ""}`}
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
                      {chipLabel(w)}
                    </button>
                  ))}
                </div>
              ))}

              <div className="week-total" style={{ alignItems: "flex-start", gap: 8 }}>
                <div>
                  <strong style={{ display: "block", marginBottom: 2 }}>Planned</strong>
                  <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    {totals.plannedKm > 0 ? `${totals.plannedKm.toFixed(1)} km` : "—"}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{plannedDuration ?? "—"}</div>
                </div>

                <div>
                  <strong style={{ display: "block", marginBottom: 2 }}>
                    {totals.isPastWeek ? "Completed" : "Expected / completed"}
                  </strong>
                  <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    {totals.expectedKm > 0 ? `${totals.expectedKm.toFixed(1)} km` : "—"}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{expectedDuration ?? "—"}</div>
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>

      <div style={{ marginTop: 12, fontSize: 13, color: "var(--text-muted)" }}>
        Planned totals use the weekly prescription. Expected / completed totals use completed activity data for past days and planned load for the remaining days of the week, including today when nothing has been completed yet.
      </div>

      <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3 style={{ marginBottom: 4 }}>Weekly planned vs expected/completed</h3>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
              Showing the past 12 weeks and next 6 weeks.
            </p>
          </div>
          <MetricToggle value={chartMetric} onChange={setChartMetric} />
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 10, fontSize: 13, color: "var(--text-muted)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: "#94a3b8", display: "inline-block" }} />
            Planned
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: "#2563eb", display: "inline-block" }} />
            Expected / completed
          </span>
        </div>

        <div style={{ overflowX: "auto", paddingBottom: 8 }}>
          <div style={{ minWidth: 900 }}>
            <div
              style={{
                height: 280,
                display: "flex",
                alignItems: "flex-end",
                gap: 10,
                padding: "8px 0 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {chartPoints.map((point) => {
                const planned = metricValue(point, chartMetric, "planned");
                const expected = metricValue(point, chartMetric, "expected");
                const plannedHeight = Math.max(2, (planned / chartMaxValue) * 220);
                const expectedHeight = Math.max(2, (expected / chartMaxValue) * 220);
                const plannedLabel = chartMetric === "km" ? `${planned.toFixed(1)} km` : formatDuration(planned) ?? "—";
                const expectedLabel = chartMetric === "km" ? `${expected.toFixed(1)} km` : formatDuration(expected) ?? "—";

                return (
                  <div
                    key={point.weekStartIso}
                    style={{
                      width: 42,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 236 }}>
                      <div
                        title={`Planned: ${plannedLabel}`}
                        style={{
                          width: 14,
                          height: planned > 0 ? plannedHeight : 2,
                          borderRadius: 8,
                          background: "#94a3b8",
                        }}
                      />
                      <div
                        title={`Expected / completed: ${expectedLabel}`}
                        style={{
                          width: 14,
                          height: expected > 0 ? expectedHeight : 2,
                          borderRadius: 8,
                          background: point.isCurrentWeek ? "#1d4ed8" : "#2563eb",
                        }}
                      />
                    </div>
                    <div style={{ textAlign: "center", fontSize: 11, color: point.isCurrentWeek ? "var(--accent-dark)" : "var(--text-muted)" }}>
                      <div style={{ fontWeight: point.isCurrentWeek ? 700 : 500 }}>{point.label}</div>
                      {point.isCurrentWeek && <div>Current</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
