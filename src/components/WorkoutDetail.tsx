import { useState } from "react";
import type { Schema } from "../../amplify/data/resource";

type Workout = Schema["Workout"]["type"];

type Props = {
  workout: Workout;
  onSave: (data: { completed: boolean; athleteNotes?: string }) => void;
  onClose: () => void;
};

function StatRow({
  label,
  planned,
  actual,
}: {
  label: string;
  planned?: string | number | null;
  actual?: string | number | null;
}) {
  if (!planned && !actual) return null;
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span className="stat-planned">{planned ?? "—"}</span>
      <span className="stat-actual">{actual ?? "—"}</span>
    </div>
  );
}

function fmtDuration(min: number | null | undefined) {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function WorkoutDetail({ workout, onSave, onClose }: Props) {
  const [completed, setCompleted] = useState(!!workout.completed);
  const [athleteNotes, setAthleteNotes] = useState(workout.athleteNotes ?? "");

  const hasActual =
    workout.actualDistanceKm ||
    workout.actualDurationMin ||
    workout.actualPace ||
    workout.avgHeartRate;

  const hasPlanned =
    workout.distanceKm ||
    workout.durationMin ||
    workout.targetPace;

  const showStatsTable = hasPlanned || hasActual;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <span className="pill" style={{ marginBottom: 10 }}>
          {(workout.type ?? "session").replace("_", " ")}
        </span>
        <h2 style={{ marginBottom: 4 }}>{workout.title}</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 16 }}>
          {workout.date}
          {workout.intensity && ` · ${workout.intensity.replace("_", " ")}`}
        </p>

        {workout.description && (
          <p style={{ marginBottom: 16 }}>{workout.description}</p>
        )}

        {/* ── Planned vs actual stats table ── */}
        {showStatsTable && (
          <div className="stats-table">
            <div className="stat-row stat-row--header">
              <span className="stat-label" />
              <span className="stat-col-head">Planned</span>
              <span className="stat-col-head">
                {hasActual ? "Actual (Strava)" : "Actual"}
              </span>
            </div>

            <StatRow
              label="Distance"
              planned={workout.distanceKm ? `${workout.distanceKm} km` : null}
              actual={
                workout.actualDistanceKm
                  ? `${workout.actualDistanceKm.toFixed(1)} km`
                  : null
              }
            />
            <StatRow
              label="Duration"
              planned={fmtDuration(workout.durationMin)}
              actual={fmtDuration(workout.actualDurationMin)}
            />
            <StatRow
              label="Pace"
              planned={workout.targetPace}
              actual={workout.actualPace}
            />
            {workout.avgHeartRate && (
              <StatRow
                label="Avg HR"
                planned={null}
                actual={`${workout.avgHeartRate} bpm`}
              />
            )}
          </div>
        )}

        {hasActual && (
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
            Actual stats synced automatically from Strava.
          </p>
        )}

        {/* ── Completion + notes ── */}
        <div className="field" style={{ marginTop: 8 }}>
          <label>
            <input
              type="checkbox"
              checked={completed}
              onChange={(e) => setCompleted(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            Mark as completed
          </label>
        </div>

        <div className="field">
          <label>Your notes (how it felt, conditions, etc.)</label>
          <textarea
            value={athleteNotes}
            onChange={(e) => setAthleteNotes(e.target.value)}
          />
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
              onClick={() => onSave({ completed, athleteNotes })}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
