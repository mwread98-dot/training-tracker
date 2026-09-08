import { useEffect, useState } from "react";
import type { Schema } from "../../amplify/data/resource";
import type { DayAvailability } from "./CalendarGrid";
import TimeField from "./TimeField";
import {
  digitsFromFormatted,
  digitsToMinutes,
  minutesToDigits,
  minutesToTimeString,
  normalizeDigits,
} from "../timeInput";

type Workout = Schema["Workout"]["type"];

type Props = {
  athleteEmail: string;
  athleteName: string;
  defaultDate: string;
  existing?: Workout | null;
  completedActivitiesOnDate?: Workout[];
  athleteAvailability?: { status: DayAvailability; note?: string | null } | null;
  copiedWorkout?: Workout | null;
  saveError?: string | null;
  onCopyWorkout?: () => void;
  onSave: (data: Partial<Workout> & { date: string; title: string }) => void;
  onDelete?: () => void;
  onClose: () => void;
};

const AVAILABILITY_LABEL: Record<DayAvailability, string> = {
  available: "Available",
  tentative: "Tentative",
  unavailable: "Unavailable",
};

const AVAILABILITY_COLOR: Record<DayAvailability, string> = {
  available: "#12a150",
  tentative: "#e0a100",
  unavailable: "#d92d20",
};

const TYPES = ["run", "cross_train", "strength"];
const INTENSITIES = ["easy", "marathon_pace", "threshold", "vo2_max", "speed_work"];

type FieldConfig = {
  distance: boolean;
  duration: boolean;
  pace: boolean;
  intensity: boolean;
};

const FIELD_CONFIG: Record<string, FieldConfig> = {
  run: { distance: true, duration: true, pace: true, intensity: true },
  strength: { distance: false, duration: true, pace: false, intensity: true },
  cross_train: { distance: false, duration: true, pace: false, intensity: true },
};

function fmtDuration(totalMin: number | null | undefined) {
  if (!totalMin || totalMin <= 0) return null;
  const totalSeconds = Math.round(totalMin * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

type CalcField = "distance" | "duration";

// A saved workout already has distance, duration and pace agreeing with each other, so
// pick the value the coach most likely wants held fixed while they retune the pace: the
// distance if the session has one, otherwise the duration.
function initialDriver(distance: string, durationDigits: string): CalcField | null {
  if (parseFloat(distance) > 0) return "distance";
  if (digitsToMinutes(durationDigits)) return "duration";
  return null;
}

function formatDistance(km: number) {
  return String(Math.round(km * 100) / 100);
}


function statText(label: string, value: string | null | undefined) {
  return value ? `${label}: ${value}` : null;
}

function formatIntensityLabel(intensity: string) {
  if (intensity === "vo2_max") return "VO2 Max";
  return intensity
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function CompletedActivityCard({ workout }: { workout: Workout }) {
  const source = (workout.source as string | null | undefined) ?? (workout.stravaActivityId ? "strava" : "coach");
  const stravaTitle = workout.stravaTitle?.trim() || workout.title;
  const stravaDescription = workout.stravaDescription?.trim();
  const stats = [
    statText("Distance", workout.actualDistanceKm ? `${workout.actualDistanceKm.toFixed(2)} km` : null),
    statText("Moving", fmtDuration(workout.actualDurationMin)),
    statText("Elapsed", fmtDuration(workout.actualElapsedDurationMin)),
    statText("Pace", workout.actualPace ?? null),
    statText("Avg HR", workout.avgHeartRate ? `${workout.avgHeartRate} bpm` : null),
  ].filter(Boolean);

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "12px 14px",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <div>
          <strong style={{ display: "block", marginBottom: 2 }}>{stravaTitle}</strong>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {(workout.type ?? "session").replace("_", " ")}
            {workout.intensity && ` · ${formatIntensityLabel(workout.intensity)}`}
          </span>
        </div>
        <span
          style={{
            alignSelf: "flex-start",
            background: source === "strava" ? "#fcf0e6" : "var(--accent-soft)",
            color: source === "strava" ? "#b24b00" : "var(--accent-dark)",
            borderRadius: 999,
            padding: "4px 8px",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {source === "strava" ? "Strava" : "Completed"}
        </span>
      </div>

      {stravaDescription && (
        <p style={{ marginTop: 0, marginBottom: 10, whiteSpace: "pre-wrap", fontSize: 14 }}>
          {stravaDescription}
        </p>
      )}

      {stats.length > 0 && (
        <div style={{ display: "grid", gap: 4, fontSize: 14 }}>
          {stats.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WorkoutForm({
  athleteEmail,
  athleteName,
  defaultDate,
  existing,
  completedActivitiesOnDate = [],
  athleteAvailability,
  copiedWorkout,
  saveError,
  onCopyWorkout,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const source = (existing?.source as string | null | undefined) ?? (existing?.stravaActivityId ? "strava" : "coach");
  const isStravaAutoCreated = source === "strava";

  // Gracefully fallback legacy types or intensities so the UI doesn't crash
  const initialType = existing?.type && TYPES.includes(existing.type) ? existing.type : "run";
  const initialIntensity = existing?.intensity && INTENSITIES.includes(existing.intensity) ? existing.intensity : "easy";

  const [date, setDate] = useState(existing?.date ?? defaultDate);
  const [type, setType] = useState<string>(initialType);
  const [intensity, setIntensity] = useState<string>(initialIntensity);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(isStravaAutoCreated ? "" : existing?.description ?? "");
  const initialDistance = isStravaAutoCreated ? "" : existing?.distanceKm?.toString() ?? "";
  const initialDurationDigits = isStravaAutoCreated ? "" : minutesToDigits(existing?.durationMin, "duration");

  const [distanceKm, setDistanceKm] = useState(initialDistance);
  const [durationDigits, setDurationDigits] = useState(initialDurationDigits);
  const [paceDigits, setPaceDigits] = useState(digitsFromFormatted(existing?.targetPace, "pace"));
  const [coachNotes, setCoachNotes] = useState(existing?.coachNotes ?? "");

  // Pace is the field the coach always fills in, so it anchors the other two: whichever of
  // distance/duration was typed into last drives the session and the other one is derived
  // from it. Typing into the derived field hands the driving role over to it.
  const [driver, setDriver] = useState<CalcField | null>(initialDriver(initialDistance, initialDurationDigits));
  const [calculatedField, setCalculatedField] = useState<CalcField | null>(null);

  const durationMinValue = digitsToMinutes(durationDigits);
  const paceMinValue = digitsToMinutes(paceDigits);
  const distanceValue = (() => {
    const v = parseFloat(distanceKm);
    return Number.isFinite(v) ? v : null;
  })();

  // Rebuilds whichever of distance/duration the coach is not driving. It takes the values
  // explicitly because the state setters that produced them have not flushed yet.
  function recalculate(next: {
    driver: CalcField | null;
    distance: number | null;
    duration: number | null;
    pace: number | null;
  }) {
    if (!next.pace || !next.driver) {
      setCalculatedField(null);
      return;
    }

    if (next.driver === "distance") {
      if (!next.distance) {
        // The value doing the driving is gone, so anything derived from it is stale.
        if (calculatedField === "duration") setDurationDigits("");
        setCalculatedField(null);
        return;
      }
      setDurationDigits(minutesToDigits(next.distance * next.pace, "duration"));
      setCalculatedField("duration");
      return;
    }

    if (!next.duration) {
      if (calculatedField === "distance") setDistanceKm("");
      setCalculatedField(null);
      return;
    }
    setDistanceKm(formatDistance(next.duration / next.pace));
    setCalculatedField("distance");
  }

  function handleDistanceChange(raw: string) {
    setDistanceKm(raw);
    setDriver("distance");
    const parsed = parseFloat(raw);
    recalculate({
      driver: "distance",
      distance: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
      duration: durationMinValue,
      pace: paceMinValue,
    });
  }

  function handleDurationChange(digits: string) {
    setDurationDigits(digits);
    setDriver("duration");
    recalculate({
      driver: "duration",
      distance: distanceValue,
      duration: digitsToMinutes(digits),
      pace: paceMinValue,
    });
  }

  function handlePaceChange(digits: string) {
    setPaceDigits(digits);
    recalculate({
      driver,
      distance: distanceValue,
      duration: durationMinValue,
      pace: digitsToMinutes(digits),
    });
  }

  // Only re-runs the calculation when blurring actually changed the value (an entry like
  // "4:99" carrying up to "5:39"), so tabbing through a field never steals the driving role.
  function handleTimeBlur(kind: "duration" | "pace", digits: string) {
    const normalized = normalizeDigits(digits, kind);
    if (normalized === digits) return;
    if (kind === "duration") handleDurationChange(normalized);
    else handlePaceChange(normalized);
  }

  const cfg = FIELD_CONFIG[type] ?? FIELD_CONFIG.run;
  const hasCompletedActivities = completedActivitiesOnDate.length > 0;

  const [activeTab, setActiveTab] = useState<"planned" | "completed">(
    hasCompletedActivities && (existing?.completed || !!existing?.stravaActivityId) ? "completed" : "planned"
  );

  useEffect(() => {
    if (hasCompletedActivities && (existing?.completed || !!existing?.stravaActivityId)) {
      setActiveTab("completed");
    } else {
      setActiveTab("planned");
    }
  }, [existing?.completed, existing?.stravaActivityId, hasCompletedActivities, existing?.entryId]);

  function handleTypeChange(newType: string) {
    setType(newType);
  }

  function handlePaste() {
    if (!copiedWorkout) return;
    if (copiedWorkout.type && TYPES.includes(copiedWorkout.type)) setType(copiedWorkout.type);
    if (copiedWorkout.intensity && INTENSITIES.includes(copiedWorkout.intensity)) {
      setIntensity(copiedWorkout.intensity);
    }
    setTitle(copiedWorkout.title ?? "");
    setDescription(copiedWorkout.description ?? "");
    const pastedDistance = copiedWorkout.distanceKm != null ? String(copiedWorkout.distanceKm) : "";
    const pastedDurationDigits = minutesToDigits(copiedWorkout.durationMin, "duration");
    setDistanceKm(pastedDistance);
    setDurationDigits(pastedDurationDigits);
    setPaceDigits(digitsFromFormatted(copiedWorkout.targetPace, "pace"));
    setCoachNotes(copiedWorkout.coachNotes ?? "");
    setDriver(initialDriver(pastedDistance, pastedDurationDigits));
    setCalculatedField(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    // An `undefined` field is dropped from the GraphQL variables, which leaves
    // the stored value untouched — clearing a field on an edit would silently
    // keep its old value. Send an explicit null so the field is really cleared.
    onSave({
      entryId: existing?.entryId,
      athleteEmail,
      athleteName,
      date,
      source: source ?? "coach",
      type: type as Workout["type"],
      intensity: cfg.intensity ? (intensity as Workout["intensity"]) : null,
      title: title.trim(),
      description: description.trim() || null,
      distanceKm: cfg.distance && distanceValue && distanceValue > 0 ? distanceValue : null,
      durationMin: cfg.duration && durationMinValue ? Math.round(durationMinValue * 100) / 100 : null,
      targetPace: cfg.pace && paceMinValue ? minutesToTimeString(paceMinValue, "pace") : null,
      coachNotes: coachNotes.trim() || null,
    });
  }

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="workout-form-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="workout-form-title" style={{ marginBottom: 4 }}>{existing ? "Edit workout" : "New workout"}</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 16 }}>For {athleteName}</p>

        {athleteAvailability && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              background: "var(--surface-muted)",
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                marginTop: 4,
                flexShrink: 0,
                background: AVAILABILITY_COLOR[athleteAvailability.status],
                display: "inline-block",
              }}
            />
            <span>
              <strong>{AVAILABILITY_LABEL[athleteAvailability.status]}</strong>
              {athleteAvailability.note && ` — ${athleteAvailability.note}`}
            </span>
          </div>
        )}

        {(hasCompletedActivities || existing) && (
          <div
            style={{
              display: "inline-flex",
              background: "var(--surface-muted)",
              borderRadius: 999,
              padding: 4,
              marginBottom: 16,
              gap: 4,
            }}
          >
            <button
              type="button"
              className={activeTab === "planned" ? "btn btn-primary" : "btn"}
              onClick={() => setActiveTab("planned")}
            >
              Planned
            </button>
            <button
              type="button"
              className={activeTab === "completed" ? "btn btn-primary" : "btn"}
              onClick={() => setActiveTab("completed")}
              disabled={!hasCompletedActivities}
            >
              Completed
            </button>
          </div>
        )}

        {activeTab === "completed" && hasCompletedActivities ? (
          <div>
            {completedActivitiesOnDate.map((workout) => (
              <CompletedActivityCard key={workout.entryId} workout={workout} />
            ))}

            {existing?.athleteNotes && (
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  marginTop: 12,
                  paddingTop: 12,
                }}
              >
                <strong style={{ display: "block", marginBottom: 6 }}>Athlete notes</strong>
                <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--text-muted)", fontSize: 14 }}>
                  {existing.athleteNotes}
                </p>
              </div>
            )}

            <div className="modal-actions">
              <div />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {!existing && copiedWorkout && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  background: "var(--accent-soft)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  marginBottom: 16,
                  fontSize: 13,
                }}
              >
                <span>
                  Clipboard: <strong>{copiedWorkout.title}</strong>
                </span>
                <button type="button" className="btn btn-primary" onClick={handlePaste}>
                  Paste copied workout
                </button>
              </div>
            )}

            <div className="row">
              <div className="field">
                <label htmlFor="workout-date">Date</label>
                <input id="workout-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="workout-type">Type</label>
                <select id="workout-type" value={type ?? "run"} onChange={(e) => handleTypeChange(e.target.value)}>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="workout-title">Title</label>
              <input
                id="workout-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 8mi Easy + Strides or 3x1mi Threshold"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="workout-description">Description for athlete</label>
              <textarea
                id="workout-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Warm up, main set, cool down…"
              />
            </div>

            {(cfg.distance || cfg.duration) && (
              <div className="row">
                {cfg.distance && (
                  <div className="field">
                    <label htmlFor="workout-distance">
                      Distance (km)
                      {calculatedField === "distance" && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · calculated</span>}
                    </label>
                    <input
                      id="workout-distance"
                      type="text"
                      inputMode="decimal"
                      value={distanceKm}
                      onChange={(e) => handleDistanceChange(e.target.value)}
                    />
                  </div>
                )}
                {cfg.duration && (
                  <div className="field">
                    <label htmlFor="workout-duration">
                      Duration
                      {calculatedField === "duration" && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · calculated</span>}
                    </label>
                    <TimeField
                      id="workout-duration"
                      kind="duration"
                      placeholder="h:mm:ss"
                      digits={durationDigits}
                      onDigitsChange={handleDurationChange}
                      onBlur={() => handleTimeBlur("duration", durationDigits)}
                      describedBy="workout-duration-hint"
                    />
                    <span id="workout-duration-hint" className="field-hint">
                      Digits only — 4500 becomes 45:00, 10500 becomes 1:05:00.
                    </span>
                  </div>
                )}
              </div>
            )}

            {(cfg.pace || cfg.intensity) && (
              <div className="row">
                {cfg.pace && (
                  <div className="field">
                    <label htmlFor="workout-pace">Target pace (min/km)</label>
                    <TimeField
                      id="workout-pace"
                      kind="pace"
                      placeholder="m:ss"
                      digits={paceDigits}
                      onDigitsChange={handlePaceChange}
                      onBlur={() => handleTimeBlur("pace", paceDigits)}
                      describedBy="workout-pace-hint"
                    />
                    <span id="workout-pace-hint" className="field-hint">
                      Digits only — 430 becomes 4:30.
                    </span>
                  </div>
                )}
                {cfg.intensity && (
                  <div className="field">
                    <label htmlFor="workout-intensity">Intensity</label>
                    <select id="workout-intensity" value={intensity ?? "easy"} onChange={(e) => setIntensity(e.target.value)}>
                      {INTENSITIES.map((i) => (
                        <option key={i} value={i}>
                          {formatIntensityLabel(i)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div className="field">
              <label htmlFor="coach-notes">Private coach notes</label>
              <textarea
                id="coach-notes"
                value={coachNotes}
                onChange={(e) => setCoachNotes(e.target.value)}
                placeholder="Not shown prominently to athlete — for your own reference"
              />
            </div>

            {saveError && (
              <p
                role="alert"
                style={{
                  background: "#fef3f2",
                  border: "1px solid #fda29b",
                  color: "#b42318",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                {saveError}
              </p>
            )}

            <div className="modal-actions">
              <div style={{ display: "flex", gap: 12 }}>
                {existing && onDelete && (
                  <button type="button" className="btn-text" onClick={onDelete}>
                    Delete
                  </button>
                )}
                {existing && onCopyWorkout && (
                  <button type="button" className="btn-text" onClick={onCopyWorkout}>
                    Copy
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
