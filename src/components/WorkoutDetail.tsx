import { useEffect, useMemo, useState } from "react";
import type { Schema } from "../../amplify/data/resource";

type Workout = Schema["Workout"]["type"];

type Props = {
  workout: Workout;
  completedActivitiesOnDate?: Workout[];
  onSave: (data: { completed: boolean; athleteNotes?: string }) => void;
  onClose: () => void;
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

function StatRow({
  label,
  planned,
  actual,
}: {
  label: string;
  planned?: string | number | null;
  actual?: string | number | null;
}) {
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

function statText(label: string, value: string | null | undefined) {
  return value ? `${label}: ${value}` : null;
}

function CompletedActivityCard({ workout }: { workout: Workout }) {
  const source = (workout.source as string | null | undefined) ?? (workout.stravaActivityId ? "strava" : "coach");
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
          <strong style={{ display: "block", marginBottom: 2 }}>{workout.title}</strong>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {(workout.type ?? "session").replace("_", " ")}
            {workout.intensity && ` · ${workout.intensity.replace("_", " ")}`}
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

      {stats.length > 0 && (
        <div style={{ display: "grid", gap: 4, fontSize: 14, marginBottom: workout.athleteNotes ? 8 : 0 }}>
          {stats.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      )}

      {workout.athleteNotes && (
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14 }}>
          Your note: “{workout.athleteNotes}”
        </p>
      )}
    </div>
  );
}

export default function WorkoutDetail({
  workout,
  completedActivitiesOnDate = [],
  onSave,
  onClose,
}: Props) {
  const [completed, setCompleted] = useState(!!workout.completed);
  const [athleteNotes, setAthleteNotes] = useState(workout.athleteNotes ?? "");

  const hasActual = !!(
    workout.actualDistanceKm ||
    workout.actualDurationMin ||
    workout.actualElapsedDurationMin ||
    workout.actualPace ||
    workout.avgHeartRate
  );
  const hasPlanned = !!(workout.distanceKm || workout.durationMin || workout.targetPace);
  const source = (workout.source as string | null | undefined) ?? (workout.stravaActivityId ? "strava" : "coach");
  const completionManagedByStrava = !!workout.stravaActivityId;
  const hasCompletedActivities = completedActivitiesOnDate.length > 0;
  const [activeTab, setActiveTab] = useState<"planned" | "completed">(
    hasCompletedActivities && (workout.completed || !!workout.stravaActivityId) ? "completed" : "planned"
  );

  useEffect(() => {
    if (hasCompletedActivities && (workout.completed || !!workout.stravaActivityId)) {
      setActiveTab("completed");
    } else {
      setActiveTab("planned");
    }
  }, [workout.entryId, workout.completed, workout.stravaActivityId, hasCompletedActivities]);

  const sourceLabel = useMemo(() => {
    if (source === "strava" && !hasPlanned) return "Strava activity";
    if (source === "strava" && hasPlanned) return "Planned workout completed via Strava";
    if (workout.stravaActivityId) return "Planned workout completed via Strava";
    return "Planned workout";
  }, [source, hasPlanned, workout.stravaActivityId]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginBottom: 4 }}>{workout.title}</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 16 }}>
          {workout.date}
          {workout.type && ` · ${workout.type.replace("_", " ")}`}
          {workout.intensity && ` · ${workout.intensity.replace("_", " ")}`}
        </p>

        {(hasCompletedActivities || workout) && (
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
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 0, marginBottom: 16 }}>
              Completed activities recorded on {workout.date}. Switch back to Planned to review the original session and add your notes.
            </p>
            {completedActivitiesOnDate.map((activity) => (
              <CompletedActivityCard key={activity.entryId} workout={activity} />
            ))}
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
          <>
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
                  label="Moving time"
                  planned={fmtDuration(workout.durationMin)}
                  actual={fmtDuration(workout.actualDurationMin)}
                />
                <StatRow label="Elapsed time" actual={fmtDuration(workout.actualElapsedDurationMin)} />
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
          </>
        )}
      </div>
    </div>
  );
}
