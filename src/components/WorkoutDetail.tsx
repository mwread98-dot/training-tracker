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

function PlannedRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function statText(label: string, value: string | null | undefined) {
  return value ? `${label}: ${value}` : null;
}

function CompletedActivityCard({ workout }: { workout: Workout }) {
  const source = (workout.source as string | null | undefined) ?? (workout.stravaActivityId ? "strava" : "coach");

  // Strava metadata is intentionally separate from the coach-planned title and
  // description. If a planned workout was matched with a Strava activity, this
  // lets the Completed tab show the athlete's Strava caption without changing
  // the Planned tab.
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

export default function WorkoutDetail({
  workout,
  completedActivitiesOnDate = [],
  onSave,
  onClose,
}: Props) {
  const [completed, setCompleted] = useState(!!workout.completed);
  const [athleteNotes, setAthleteNotes] = useState(workout.athleteNotes ?? "");

  const hasPlanned = !!(
    workout.description ||
    workout.distanceKm ||
    workout.durationMin ||
    workout.targetPace ||
    workout.coachNotes ||
    (workout.source !== "strava" && workout.title)
  );

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
    if (source === "strava" && !hasPlanned) return "Nothing was planned";
    return "Planned workout";
  }, [source, hasPlanned]);

  function handleSave() {
    onSave({
      completed: completionManagedByStrava ? true : completed,
      athleteNotes: athleteNotes || undefined,
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 6 }}>{workout.title}</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 0, marginBottom: 16 }}>
          {workout.date}
          {workout.type && ` · ${workout.type.replace("_", " ")}`}
          {workout.intensity && ` · ${workout.intensity.replace("_", " ")}`}
        </p>

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

        {activeTab === "completed" && hasCompletedActivities ? (
          <div>
            {completedActivitiesOnDate.map((activity) => (
              <CompletedActivityCard key={activity.entryId} workout={activity} />
            ))}

            <div className="field" style={{ marginTop: 16 }}>
              <label>Your notes (how it felt, conditions, etc.)</label>
              <textarea
                value={athleteNotes}
                onChange={(e) => setAthleteNotes(e.target.value)}
                placeholder="How did it feel? Any weather, terrain, fatigue, or niggles to mention?"
              />
            </div>

            <div className="modal-actions">
              <div />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn" onClick={onClose}>
                  Close
                </button>
                <button type="button" className="btn btn-primary" onClick={handleSave}>
                  Save notes
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <h4 style={{ marginTop: 0 }}>{sourceLabel}</h4>

            {hasPlanned ? (
              <div style={{ marginBottom: 18 }}>
                {workout.description && (
                  <div style={{ marginBottom: 14 }}>
                    <p style={{ marginTop: 0, whiteSpace: "pre-wrap" }}>{workout.description}</p>
                  </div>
                )}

                <PlannedRow label="Distance" value={workout.distanceKm ? `${workout.distanceKm} km` : null} />
                <PlannedRow label="Duration" value={fmtDuration(workout.durationMin)} />
                <PlannedRow label="Target pace" value={workout.targetPace} />
                <PlannedRow label="Coach notes" value={workout.coachNotes} />
              </div>
            ) : (
              <p style={{ color: "var(--text-muted)" }}>
                Nothing was planned for this day. Any synced activity details will appear under the Completed tab.
              </p>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={completionManagedByStrava ? true : completed}
                onChange={(e) => setCompleted(e.target.checked)}
                disabled={completionManagedByStrava}
              />
              {completionManagedByStrava ? "Completed (synced from Strava)" : "Mark as completed"}
            </label>

            {!hasCompletedActivities && (
              <div className="field">
                <label>Your notes (how it felt, conditions, etc.)</label>
                <textarea value={athleteNotes} onChange={(e) => setAthleteNotes(e.target.value)} />
              </div>
            )}

            <div className="modal-actions">
              <div />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn" onClick={onClose}>
                  Close
                </button>
                <button type="button" className="btn btn-primary" onClick={handleSave}>
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
