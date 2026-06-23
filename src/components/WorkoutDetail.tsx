import { useMemo, useState } from "react";
import type { Schema } from "../../amplify/data/resource";

type Workout = Schema["Workout"]["type"];

type Props = {
  workout: Workout;
  onSave: (data: { completed: boolean; athleteNotes?: string }) => void;
  onClose: () => void;
};

function fmtDuration(min: number | null | undefined) {
  if (!min || min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function StatRow({ label, planned, actual }: { label: string; planned?: string | number | null; actual?: string | number | null }) {
  if ((planned === null || planned === undefined || planned === "") && (actual === null || actual === undefined || actual === "")) {
    return null;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "140px minmax(0, 1fr) minmax(0, 1fr)",
        gap: 12,
        padding: "8px 0",
        borderTop: "1px solid var(--border)",
        fontSize: 14,
      }}
    >
      <strong>{label}</strong>
      <span>{planned ?? "—"}</span>
      <span>{actual ?? "—"}</span>
    </div>
  );
}

export default function WorkoutDetail({ workout, onSave, onClose }: Props) {
  const [completed, setCompleted] = useState(!!workout.completed);
  const [athleteNotes, setAthleteNotes] = useState(workout.athleteNotes ?? "");

  const hasActual = !!(
    workout.actualDistanceKm ||
    workout.actualDurationMin ||
    workout.actualPace ||
    workout.avgHeartRate
  );
  const hasPlanned = !!(workout.distanceKm || workout.durationMin || workout.targetPace);
  const source = (workout.source as string | null | undefined) ?? (workout.stravaActivityId ? "strava" : "coach");
  const completionManagedByStrava = !!workout.stravaActivityId;

  const sourceLabel = useMemo(() => {
    if (source === "strava" && !hasPlanned) return "Strava activity";
    if (source === "strava" && hasPlanned) return "Planned workout completed via Strava";
    if (workout.stravaActivityId) return "Planned workout completed via Strava";
    return "Planned workout";
  }, [source, hasPlanned, workout.stravaActivityId]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 12 }}>
          <div>
            <span
              style={{
                display: "inline-block",
                padding: "4px 8px",
                borderRadius: 999,
                background: source === "strava" ? "#fcf0e6" : "var(--accent-soft)",
                color: source === "strava" ? "#b24b00" : "var(--accent-dark)",
                fontSize: 12,
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              {sourceLabel}
            </span>
            <h2 style={{ marginBottom: 4 }}>{workout.title}</h2>
            <p style={{ color: "var(--text-muted)", margin: 0 }}>
              {workout.date}
              {workout.type && ` · ${workout.type.replace("_", " ")}`}
              {workout.intensity && ` · ${workout.intensity.replace("_", " ")}`}
            </p>
          </div>
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {workout.description && <p style={{ marginBottom: 14 }}>{workout.description}</p>}

        {(hasPlanned || hasActual) && (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "12px 14px",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "140px minmax(0, 1fr) minmax(0, 1fr)",
                gap: 12,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: "var(--text-muted)",
                marginBottom: 4,
              }}
            >
              <span />
              <span>Planned</span>
              <span>{hasActual ? "Actual (Strava)" : "Actual"}</span>
            </div>
            <StatRow
              label="Distance"
              planned={workout.distanceKm ? `${workout.distanceKm.toFixed(1)} km` : null}
              actual={workout.actualDistanceKm ? `${workout.actualDistanceKm.toFixed(2)} km` : null}
            />
            <StatRow
              label="Duration"
              planned={fmtDuration(workout.durationMin)}
              actual={fmtDuration(workout.actualDurationMin)}
            />
            <StatRow label="Pace" planned={workout.targetPace} actual={workout.actualPace} />
            <StatRow
              label="Avg HR"
              actual={workout.avgHeartRate ? `${workout.avgHeartRate} bpm` : null}
            />
          </div>
        )}

        {hasActual && (
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: -8, marginBottom: 16 }}>
            Actual stats were synced automatically from Strava.
          </p>
        )}

        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={completed}
              disabled={completionManagedByStrava}
              onChange={(e) => setCompleted(e.target.checked)}
            />
            {completionManagedByStrava ? "Completed (synced from Strava)" : "Mark as completed"}
          </label>
        </div>

        <div className="field">
          <label>Your notes (how it felt, conditions, etc.)</label>
          <textarea value={athleteNotes} onChange={(e) => setAthleteNotes(e.target.value)} />
        </div>

        <div className="modal-actions">
          <div />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onSave({ completed: completionManagedByStrava ? true : completed, athleteNotes })}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
