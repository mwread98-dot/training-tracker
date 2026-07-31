import { Fragment, useEffect, useMemo, useState } from "react";

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
  targetPace?: string | null;
  actualPace?: string | null;
  source?: string | null;
  hasActualStats?: boolean | null;
};

export type DayAvailability = "available" | "unavailable" | "tentative";

export type DayAvailabilityInfo = {
  status: DayAvailability;
  note?: string | null;
};

type Props = {
  year: number;
  month: number;
  workouts: CalendarWorkout[];
  availability?: Record<string, DayAvailabilityInfo>;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  dayActionLabel?: string;
  onDayClick?: (dateIso: string) => void;
  onWorkoutClick?: (workout: CalendarWorkout) => void;
};

const AVAILABILITY_META: Record<DayAvailability, { label: string; color: string }> = {
  available: { label: "Available", color: "#12a150" },
  tentative: { label: "Tentative", color: "#e0a100" },
  unavailable: { label: "Unavailable", color: "#d92d20" },
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
  label: "Completed" | "Projected" | "Planned";
  km: number;
  min: number;
};

type ChartMetric = "km" | "time";

type ChartPoint = {
  weekStartIso: string;
  label: string;
  plannedKm: number;
  plannedMin: number;
  actualKm: number;
  actualMin: number;
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

function isRunWorkout(workout: CalendarWorkout) {
  const type = workout.type?.toLowerCase() ?? "";
  const title = workout.title.toLowerCase();
  return type.includes("run") || title.includes("run");
}

function plannedDistance(workout: CalendarWorkout) {
  if (!isRunWorkout(workout)) return 0;
  return workout.distanceKm ?? 0;
}

function plannedDuration(workout: CalendarWorkout) {
  if (!isRunWorkout(workout)) return 0;
  return workout.durationMin ?? 0;
}

function completedDistance(workout: CalendarWorkout) {
  if (!isRunWorkout(workout) || !isWorkoutCompleted(workout)) return 0;
  return workout.actualDistanceKm ?? workout.distanceKm ?? 0;
}

function completedDuration(workout: CalendarWorkout) {
  if (!isRunWorkout(workout) || !isWorkoutCompleted(workout)) return 0;
  return workout.actualDurationMin ?? workout.durationMin ?? 0;
}

// Gracefully normalizes legacy intensities to the newly supported set
function getIntensityClass(intensity?: string | null) {
  const normalized = (intensity ?? "easy").toLowerCase();
  if (normalized === "hard" || normalized === "speed_work") return "speed_work";
  if (normalized === "race_pace" || normalized === "marathon_pace") return "marathon_pace";
  if (normalized === "moderate" || normalized === "threshold") return "threshold";
  if (normalized === "vo2_max") return "vo2_max";
  return "easy";
}

function chipClass(w: CalendarWorkout) {
  const classes = ["workout-chip"];
  
  if (isWorkoutCompleted(w)) {
    classes.push("completed");
  }

  const intensity = getIntensityClass(w.intensity);
  classes.push(`intensity-${intensity}`);

  return classes.join(" ");
}

function mobileIndicatorClass(w: CalendarWorkout) {
  const classes = ["mobile-workout-indicator", `intensity-${getIntensityClass(w.intensity)}`];
  if (isWorkoutCompleted(w)) classes.push("completed");
  return classes.join(" ");
}

function runDistanceLabel(workout: CalendarWorkout) {
  if (!isRunWorkout(workout)) return null;

  const distance = isWorkoutCompleted(workout)
    ? workout.actualDistanceKm ?? workout.distanceKm
    : workout.distanceKm;

  if (!distance || distance <= 0) return null;
  return `${distance.toFixed(1)} km`;
}

function runDurationLabel(workout: CalendarWorkout) {
  if (!isRunWorkout(workout)) return null;

  const duration = isWorkoutCompleted(workout)
    ? workout.actualDurationMin ?? workout.durationMin
    : workout.durationMin;

  if (!duration || duration <= 0) return null;
  return formatDuration(duration);
}

function runPaceLabel(workout: CalendarWorkout) {
  if (!isRunWorkout(workout)) return null;

  const pace = isWorkoutCompleted(workout) ? workout.actualPace ?? workout.targetPace : workout.targetPace;
  return pace || null;
}

function chipMetaLabel(w: CalendarWorkout) {
  const parts = [runDistanceLabel(w), runDurationLabel(w), runPaceLabel(w)].filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

function workoutTitleLabel(w: CalendarWorkout) {
 return `${w.title}`;
}

function workoutTitleFontSize(title: string) {
  if (title.length > 34) return 10;
  if (title.length > 26) return 11;
  if (title.length > 18) return 12;
  return 13;
}

function chipLabel(w: CalendarWorkout) {
  const title = workoutTitleLabel(w);
  const meta = chipMetaLabel(w);
  return `${title}${meta ? ` · ${meta}` : ""}`;
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

function formatMobileDistance(km: number) {
  if (km <= 0) return null;
  return `${Number.isInteger(km) ? km.toFixed(0) : km.toFixed(1)}k`;
}

function formatMobileDuration(totalMin: number) {
  if (totalMin <= 0) return null;
  const totalSeconds = Math.round(totalMin * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h${minutes > 0 ? String(minutes).padStart(2, "0") : ""}`;
  if (seconds > 0) return `${minutes}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}m`;
}

function metricValue(point: ChartPoint, metric: ChartMetric, key: "planned" | "actual" | "expected") {
  if (metric === "km") {
    if (key === "planned") return point.plannedKm;
    if (key === "actual") return point.actualKm;
    return point.expectedKm;
  }
  if (key === "planned") return point.plannedMin;
  if (key === "actual") return point.actualMin;
  return point.expectedMin;
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
  availability,
  onPrevMonth,
  onNextMonth,
  dayActionLabel = "Add workout",
  onDayClick,
  onWorkoutClick,
}: Props) {
  const [chartMetric, setChartMetric] = useState<ChartMetric>("km");
  const [selectedMobileDate, setSelectedMobileDate] = useState<string | null>(null);

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

  useEffect(() => {
    setSelectedMobileDate((current) => {
      if (current && cells.some((cell) => !cell.outside && cell.iso === current)) return current;
      return null;
    });
  }, [cells]);

  useEffect(() => {
    if (!selectedMobileDate) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedMobileDate(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selectedMobileDate]);

  const selectedMobileCell = cells.find((cell) => cell.iso === selectedMobileDate) ?? null;
  const selectedMobileWorkouts = selectedMobileDate ? byDate[selectedMobileDate] ?? [] : [];
  const selectedMobileAvailability = selectedMobileDate ? availability?.[selectedMobileDate] : undefined;
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
      let km = 0;
      let min = 0;
      const weekStartIso = cells[i].iso;
      let label: "Completed" | "Projected" | "Planned";

      if (weekStartIso < currentWeekStartIso) {
        label = "Completed";
        for (let j = i; j < i + 7; j++) {
          const dayWorkouts = byDate[cells[j].iso] ?? [];
          for (const w of dayWorkouts) {
            km += completedDistance(w);
            min += completedDuration(w);
          }
        }
      } else if (weekStartIso > currentWeekStartIso) {
        label = "Planned";
        for (let j = i; j < i + 7; j++) {
          const dayWorkouts = byDate[cells[j].iso] ?? [];
          for (const w of dayWorkouts) {
            km += plannedDistance(w);
            min += plannedDuration(w);
          }
        }
      } else {
        label = "Projected";
        for (let j = i; j < i + 7; j++) {
          const dayIso = cells[j].iso;
          const dayWorkouts = byDate[dayIso] ?? [];
          for (const w of dayWorkouts) {
            if (dayIso < todayIso || isWorkoutCompleted(w)) {
              km += completedDistance(w);
              min += completedDuration(w);
            } else {
              km += plannedDistance(w);
              min += plannedDuration(w);
            }
          }
        }
      }

      totals.push({ label, km, min });
    }

    return totals;
  }, [cells, byDate, currentWeekStartIso, todayIso]);

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
      let actualKm = 0;
      let actualMin = 0;
      let expectedKm = 0;
      let expectedMin = 0;
      for (let day = 0; day < 7; day++) {
        const date = addDays(weekStart, day);
        const iso = toIso(date.getFullYear(), date.getMonth(), date.getDate());
        const items = byDate[iso] ?? [];
        const totals = getDayTotals(iso);
        plannedKm += totals.plannedKm;
        plannedMin += totals.plannedMin;
        expectedKm += totals.expectedKm;
        expectedMin += totals.expectedMin;
        for (const workout of items) {
          actualKm += completedDistance(workout);
          actualMin += completedDuration(workout);
        }
      }
      points.push({
        weekStartIso: toIso(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()),
        label: formatDateLabel(weekStart),
        plannedKm,
        plannedMin,
        actualKm,
        actualMin,
        expectedKm,
        expectedMin,
        isCurrentWeek: offset === 0,
      });
    }
    return points;
  }, [byDate, currentWeekStart, todayIso]);

  const monthDuration = formatDuration(monthTotal.min);
  
  const chartVisiblePoints = chartPoints.map((point) => {
    const isFutureWeek = point.weekStartIso > currentWeekStartIso;
    const isCurrentWeek = point.weekStartIso === currentWeekStartIso;

    let key: "planned" | "actual" | "expected";
    if (isFutureWeek) {
      key = "planned";
    } else if (isCurrentWeek) {
      key = "expected";
    } else {
      key = "actual";
    }

    const value = metricValue(point, chartMetric, key);
    return { ...point, isFutureWeek, value };
  });

  const chartMaxValue = Math.max(
    1,
    ...chartVisiblePoints.map((point) => point.value)
  ) * 1.1;

  const chartSvgHeight = 220;
  const chartTop = 18;
  const chartBottom = 46;
  const chartLeft = 10;
  const chartRight = 70;
  const chartGap = 44;
  const chartPlotHeight = chartSvgHeight - chartTop - chartBottom;
  const chartSvgWidth = Math.max(360, chartLeft + chartRight + Math.max(0, chartVisiblePoints.length - 1) * chartGap);
  const chartBaselineY = chartTop + chartPlotHeight;
  const chartX = (index: number) => chartLeft + index * chartGap;
  const chartY = (value: number) => chartTop + chartPlotHeight - (value / chartMaxValue) * chartPlotHeight;
  const formatChartValue = (value: number) =>
    chartMetric === "km" ? `${value.toFixed(1)} km` : formatDuration(value) ?? "—";
  const linePath = (points: { index: number; value: number }[]) =>
    points
      .map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${chartX(point.index)} ${chartY(point.value)}`)
      .join(" ");
  const areaPath = (points: { index: number; value: number }[]) => {
    if (points.length === 0) return "";
    return `${linePath(points)} L ${chartX(points[points.length - 1].index)} ${chartBaselineY} L ${chartX(points[0].index)} ${chartBaselineY} Z`;
  };
  const actualSeries = chartVisiblePoints
    .map((point, index) => ({ index, value: point.value, isFutureWeek: point.isFutureWeek }))
    .filter((point) => !point.isFutureWeek);
  const futureOnlySeries = chartVisiblePoints
    .map((point, index) => ({ index, value: point.value, isFutureWeek: point.isFutureWeek }))
    .filter((point) => point.isFutureWeek);
  const plannedSeries = actualSeries.length > 0 && futureOnlySeries.length > 0
    ? [actualSeries[actualSeries.length - 1], ...futureOnlySeries]
    : futureOnlySeries;
  const currentPointIndex = chartVisiblePoints.findIndex((point) => point.isCurrentWeek);
  const currentPoint = currentPointIndex >= 0 ? chartVisiblePoints[currentPointIndex] : null;

  return (
    <div>
      <div className="calendar-header">
        <button type="button" className="btn" onClick={onPrevMonth} aria-label="Previous month">
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
            </p>
          )}
        </div>
        <button type="button" className="btn" onClick={onNextMonth} aria-label="Next month">
          Next →
        </button>
      </div>

      {availability && (
        <div className="availability-legend">
          {(Object.keys(AVAILABILITY_META) as DayAvailability[]).map((key) => (
            <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: AVAILABILITY_META[key].color,
                  display: "inline-block",
                }}
              />
              {AVAILABILITY_META[key].label}
            </span>
          ))}
        </div>
      )}

      <div className="calendar-grid" aria-label={`${MONTH_NAMES[month]} ${year} calendar`}>
        {DOW.map((d) => (
          <div className="calendar-dow" key={d}>
            {d}
          </div>
        ))}
        <div className="calendar-dow total-col">Week</div>

        {Array.from({ length: cells.length / 7 }).map((_, weekIdx) => {
          const totals = weekTotals[weekIdx];
          const formattedDuration = formatDuration(totals.min);

          return (
            <Fragment key={weekIdx}>
              {cells.slice(weekIdx * 7, weekIdx * 7 + 7).map((cell) => (
                <div
                  key={cell.iso}
                  className={`calendar-day ${cell.outside ? "outside" : ""} ${cell.iso === todayIso ? "today" : ""}`}
                  onClick={() => onDayClick?.(cell.iso)}
                  onKeyDown={(event) => {
                    if (onDayClick && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      onDayClick(cell.iso);
                    }
                  }}
                  role={onDayClick ? "button" : undefined}
                  tabIndex={onDayClick ? 0 : undefined}
                  aria-label={onDayClick ? `Open ${cell.day} ${MONTH_NAMES[month]} ${year}` : undefined}
                  style={{ cursor: onDayClick ? "pointer" : "default", position: "relative" }}
                >
                  <span className="daynum">{cell.day}</span>
                  {availability?.[cell.iso] && (
                    <span
                      className="availability-dot"
                      title={
                        availability[cell.iso].note
                          ? `${AVAILABILITY_META[availability[cell.iso].status].label}: ${availability[cell.iso].note}`
                          : AVAILABILITY_META[availability[cell.iso].status].label
                      }
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: AVAILABILITY_META[availability[cell.iso].status].color,
                      }}
                    />
                  )}
                  {(byDate[cell.iso] ?? []).map((w) => (
                    <button
                      key={w.id}
                      className={chipClass(w)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onWorkoutClick?.(w);
                      }}
                      title={chipLabel(w)}
                    >
                      <span
                        className="workout-chip-title"
                        style={{ fontSize: workoutTitleFontSize(workoutTitleLabel(w)) }}
                      >
                        {workoutTitleLabel(w)}
                      </span>
                      {chipMetaLabel(w) && (
                        <span className="workout-chip-distance">{chipMetaLabel(w)}</span>
                      )}
                    </button>
                  ))}
                </div>
              ))}

              <div className="week-total" style={{ alignItems: "flex-start", gap: 8, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div>
                  <strong style={{ display: "block", marginBottom: 2 }}>{totals.label}</strong>
                  <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    {totals.km > 0 ? `${totals.km.toFixed(1)} km` : "—"}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{formattedDuration ?? "—"}</div>
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>

      <div className="mobile-calendar" aria-label={`${MONTH_NAMES[month]} ${year} calendar`}>
        <div className="mobile-calendar-dow" aria-hidden="true">
          {DOW.map((day) => <span key={day}>{day}</span>)}
        </div>

        {Array.from({ length: cells.length / 7 }).map((_, weekIndex) => {
          const totals = weekTotals[weekIndex];
          const formattedDuration = formatDuration(totals.min);
          return (
            <section className="mobile-calendar-week" key={weekIndex} aria-label={`Week ${weekIndex + 1}`}>
              <div className="mobile-calendar-week-days">
                {cells.slice(weekIndex * 7, weekIndex * 7 + 7).map((cell) => {
                  const items = byDate[cell.iso] ?? [];
                  const availabilityInfo = availability?.[cell.iso];
                  const date = parseIso(cell.iso);
                  const selected = selectedMobileDate === cell.iso;
                  const dayTotals = getDayTotals(cell.iso);
                  const mobileDistance = formatMobileDistance(dayTotals.expectedKm);
                  const mobileDuration = formatMobileDuration(dayTotals.expectedMin);
                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      className={`mobile-calendar-cell ${cell.outside ? "outside" : ""} ${cell.iso === todayIso ? "today" : ""} ${selected ? "selected" : ""}`}
                      onClick={() => setSelectedMobileDate(cell.iso)}
                      aria-pressed={selected}
                      aria-label={`${formatDateLabel(date)}${items.length ? `, ${items.length} ${items.length === 1 ? "session" : "sessions"}` : ", no sessions"}${availabilityInfo ? `, ${AVAILABILITY_META[availabilityInfo.status].label}` : ""}`}
                    >
                      <span className="mobile-calendar-date">{cell.day}</span>
                      {availabilityInfo && (
                        <span
                          className="mobile-calendar-availability-dot"
                          aria-hidden="true"
                          style={{ background: AVAILABILITY_META[availabilityInfo.status].color }}
                        />
                      )}
                      {(mobileDistance || mobileDuration) && (
                        <span className="mobile-calendar-metrics" aria-hidden="true">
                          {mobileDistance && <strong>{mobileDistance}</strong>}
                          {mobileDuration && <span>{mobileDuration}</span>}
                        </span>
                      )}
                      <span className="mobile-workout-indicators" aria-hidden="true">
                        {items.slice(0, 3).map((workout) => (
                          <span key={workout.id} className={mobileIndicatorClass(workout)} />
                        ))}
                        {items.length > 3 && <span className="mobile-workout-more">+{items.length - 3}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mobile-week-total">
                <strong>{totals.label}</strong>
                <span>{totals.km > 0 ? `${totals.km.toFixed(1)} km` : "No running distance"}</span>
                {formattedDuration && <span>{formattedDuration}</span>}
              </div>
            </section>
          );
        })}

        {selectedMobileCell && (
          <div className="mobile-day-agenda-backdrop" onClick={() => setSelectedMobileDate(null)}>
            <section
              className="mobile-day-agenda"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-day-agenda-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mobile-day-agenda-header">
                <div>
                  <h3 id="mobile-day-agenda-title">
                    {DOW[(parseIso(selectedMobileCell.iso).getDay() + 6) % 7]} {formatDateLabel(parseIso(selectedMobileCell.iso))}
                  </h3>
                  {selectedMobileAvailability && (
                    <p>
                      <span
                        aria-hidden="true"
                        style={{ background: AVAILABILITY_META[selectedMobileAvailability.status].color }}
                      />
                      {AVAILABILITY_META[selectedMobileAvailability.status].label}
                      {selectedMobileAvailability.note && ` — ${selectedMobileAvailability.note}`}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="mobile-day-agenda-close"
                  onClick={() => setSelectedMobileDate(null)}
                  aria-label="Close day details"
                >
                  &times;
                </button>
              </div>

              {selectedMobileWorkouts.length > 0 ? (
                <div className="mobile-agenda-workouts">
                  {selectedMobileWorkouts.map((workout) => (
                    <button
                      key={workout.id}
                      type="button"
                      className={chipClass(workout)}
                      onClick={() => {
                        setSelectedMobileDate(null);
                        onWorkoutClick?.(workout);
                      }}
                      aria-label={`View ${chipLabel(workout)}`}
                    >
                      <span className="workout-chip-title">{workoutTitleLabel(workout)}</span>
                      {chipMetaLabel(workout) && <span className="workout-chip-distance">{chipMetaLabel(workout)}</span>}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mobile-agenda-empty">No sessions planned for this day.</p>
              )}

              {onDayClick && (
                <button
                  type="button"
                  className="btn btn-primary mobile-day-action"
                  onClick={() => {
                    setSelectedMobileDate(null);
                    onDayClick(selectedMobileCell.iso);
                  }}
                >
                  {dayActionLabel}
                </button>
              )}
            </section>
          </div>
        )}
      </div>

      <div className="progress-section">
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
            <h3 style={{ marginBottom: 4 }}>Progress</h3>
          </div>
          <MetricToggle value={chartMetric} onChange={setChartMetric} />
        </div>

        <div className="progress-chart" aria-label="Weekly progress chart">
          <svg
            viewBox={`0 0 ${chartSvgWidth} ${chartSvgHeight}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Weekly progress chart showing ${chartMetric === "km" ? "distance" : "time"}: actual for past and current weeks, planned for future weeks`}
            style={{ display: "block", width: "100%", height: "100%" }}
          >
            {[0, 0.5, 1].map((tick) => {
              const tickValue = chartMaxValue * tick;
              const y = chartBaselineY - chartPlotHeight * tick;
              return (
                <g key={tick}>
                  <line
                    x1={chartLeft}
                    x2={chartSvgWidth - chartRight}
                    y1={y}
                    y2={y}
                    stroke="var(--border)"
                    strokeWidth={1}
                  />
                  <text
                    x={chartSvgWidth - chartRight + 20}
                    y={y + 5}
                    fontSize={13}
                    fill="var(--text-muted)"
                  >
                    {formatChartValue(tickValue)}
                  </text>
                </g>
              );
            })}

            {areaPath(actualSeries) && (
              <path d={areaPath(actualSeries)} fill="rgba(252, 76, 2, 0.2)" />
            )}
            {areaPath(plannedSeries) && (
              <path d={areaPath(plannedSeries)} fill="rgba(252, 76, 2, 0.08)" />
            )}
            {linePath(actualSeries) && (
              <path
                d={linePath(actualSeries)}
                fill="none"
                stroke="#3002fc"
                strokeWidth={4}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {linePath(plannedSeries) && (
              <path
                d={linePath(plannedSeries)}
                fill="none"
                stroke="#3002fc"
                strokeWidth={4}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray="8 8"
                opacity={0.9}
              />
            )}

            {currentPoint && (
              <g>
                <line
                  x1={chartX(currentPointIndex)}
                  x2={chartX(currentPointIndex)}
                  y1={chartTop}
                  y2={chartBaselineY}
                  stroke="#3002fc"
                  strokeWidth={3}
                  opacity={0.9}
                />
                <circle
                  cx={chartX(currentPointIndex)}
                  cy={chartY(currentPoint.value)}
                  r={16}
                  fill="rgba(252, 76, 2, 0.18)"
                />
              </g>
            )}

            {chartVisiblePoints.map((point, index) => {
              const valueLabel = formatChartValue(point.value);
              
              const modeLabel = point.isCurrentWeek 
                ? "Projected" 
                : point.isFutureWeek 
                  ? "Planned" 
                  : "Actual";

              const x = chartX(index);
              const y = chartY(point.value);
              const showLabel = index === 0 || point.isCurrentWeek || index === chartVisiblePoints.length - 1 || parseIso(point.weekStartIso).getDate() <= 7;
              return (
                <g key={point.weekStartIso}>
                  <circle
                    cx={x}
                    cy={y}
                    r={point.isCurrentWeek ? 7 : 5}
                    fill={point.isFutureWeek ? "var(--surface)" : "#fff"}
                    stroke="#3002fc"
                    strokeWidth={4}
                  >
                    <title>{`${modeLabel}: ${valueLabel} · week starting ${point.label}`}</title>
                  </circle>
                  {showLabel && (
                    <text
                      x={x}
                      y={chartSvgHeight - 16}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight={point.isCurrentWeek ? 700 : 500}
                      fill={point.isCurrentWeek ? "#3002fc" : "var(--text-muted)"}
                    >
                      {point.isCurrentWeek ? "Current" : MONTH_SHORT[parseIso(point.weekStartIso).getMonth()].toUpperCase()}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
