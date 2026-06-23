import { useEffect, useMemo, useState } from "react";
import type { Schema } from "../../amplify/data/resource";

type Workout = Schema["Workout"]["type"];

type Props = {
  athleteEmail: string;
  athleteName: string;
  defaultDate: string;
  existing?: Workout | null;
  completedActivitiesOnDate?: Workout[];
  onSave: (data: Partial<Workout> & { date: string; title: string }) => void;
  onDelete?: () => void;
  onClose: () => void;
};

const TYPES = ["run", "bike", "swim", "strength", "cross_train", "rest", "race"];
const INTENSITIES = ["easy", "moderate", "hard", "race_pace"];

type FieldConfig = {
  distance: boolean;
  duration: boolean;
  pace: boolean;
  intensity: boolean;
};

const FIELD_CONFIG: Record<string, FieldConfig> = {
  run: { distance: true, duration: true, pace: true, intensity: true },
  bike: { distance: true, duration: true, pace: true, intensity: true },
  swim: { distance: true, duration: true, pace: true, intensity: true },
  race: { distance: true, duration: true, pace: true, intensity: true },
  strength: { distance: false, duration: true, pace: false, intensity: true },
  cross_train: { distance: false, duration: true, pace: false, intensity: true },
  rest: { distance: false, duration: false, pace: false, intensity: false },
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
          Athlete note: “{workout.athleteNotes}”
        </p>
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
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [date, setDate] = useState(existing?.date ?? defaultDate);
  const [type, setType] = useState<string>(existing?.type ?? "run");
  const [intensity, setIntensity] = useState<string>(existing?.intensity ?? "easy");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [distanceKm, setDistanceKm] = useState(existing?.distanceKm?.toString() ?? "");
  const [durationMin, setDurationMin] = useState(existing?.durationMin?.toString() ?? "");
  const [targetPace, setTargetPace] = useState(existing?.targetPace ?? "");
  const [coachNotes, setCoachNotes] = useState(existing?.coachNotes ?? "");

  const cfg = FIELD_CONFIG[type] ?? FIELD_CONFIG.run;
  const source = (existing?.source as string | null | undefined) ?? (existing?.stravaActivityId ? "strava" : "coach");
  const hasActualStats = !!(
    existing?.actualDistanceKm ||
    existing?.actualDurationMin ||
    existing?.actualElapsedDurationMin ||
    existing?.actualPace ||
    existing?.avgHeartRate
  );
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

  const actualSummary = useMemo(() => {
    if (!existing || !hasActualStats) return null;
    const parts: string[] = [];
    if (existing.actualDistanceKm) parts.push(`${existing.actualDistanceKm.toFixed(2)} km`);
    if (existing.actualDurationMin) parts.push(`Moving ${fmtDuration(existing.actualDurationMin)}`);
    if (existing.actualElapsedDurationMin) parts.push(`Elapsed ${fmtDuration(existing.actualElapsedDurationMin)}`);
    if (existing.actualPace) parts.push(existing.actualPace);
    if (existing.avgHeartRate) parts.push(`${existing.avgHeartRate} bpm avg HR`);
    return parts.filter(Boolean).join(" · ");
  }, [existing, hasActualStats]);

  function handleTypeChange(newType: string) {
    setType(newType);
    if (newType === "rest" && !title.trim()) {
      setTitle("Rest day");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    onSave({
      entryId: existing?.entryId,
      athleteEmail,
      athleteName,
      date,
      source: source ?? "coach",
      type: type as Workout["type"],
      intensity: cfg.intensity ? (intensity as Workout["intensity"]) : undefined,
      title: title.trim(),
      description: description || undefined,
      distanceKm: cfg.distance && distanceKm ? parseFloat(distanceKm) : undefined,
      durationMin: cfg.duration && durationMin ? parseFloat(durationMin) : undefined,
      targetPace: cfg.pace && targetPace ? targetPace : undefined,
      coachNotes: coachNotes || undefined,
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginBottom: 4 }}>{existing ? "Edit workout" : "New workout"}</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 16 }}>For {athleteName}</p>

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
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 0, marginBottom: 16 }}>
              Completed activities recorded on {existing?.date ?? defaultDate}. Use the Planned tab to adjust the original session if needed.
            </p>
            {completedActivitiesOnDate.map((workout) => (
              <CompletedActivityCard key={workout.entryId} workout={workout} />
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
            {existing && (existing.completed || existing.athleteNotes || hasActualStats) && (
              <div
                style={{
                  background: "var(--accent-soft)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  marginBottom: 16,
                  fontSize: 14,
                }}
              >
                <strong style={{ color: "var(--accent-dark)" }}>
                  {existing.completed ? "✓ Marked completed" : "Not marked completed yet"}
                </strong>
                {existing.athleteNotes && (
                  <p style={{ marginTop: 6, marginBottom: 0, color: "var(--text)" }}>
                    Athlete note: “{existing.athleteNotes}”
                  </p>
                )}
                {hasActualStats && (
                  <p style={{ marginTop: 6, marginBottom: 0, color: "var(--text)" }}>
                    Latest synced stats: {actualSummary}
                  </p>
                )}
                {source === "strava" && (
                  <p style={{ marginTop: 6, marginBottom: 0, color: "var(--text-muted)" }}>
                    This entry was created automatically from Strava and is still editable by the coach.
                  </p>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="row">
                <div className="field">
                  <label>Date</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Type</label>
                  <select value={type ?? "run"} onChange={(e) => handleTypeChange(e.target.value)}>
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="field">
                <label>Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={type === "rest" ? "e.g. Rest day" : "e.g. 8mi easy + strides"}
                  required
                />
              </div>

              {type === "rest" ? (
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>
                  No distance, duration, or pace needed for a rest day. Add a note below only if there's something specific.
                </p>
              ) : (
                <div className="field">
                  <label>Description for athlete</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Warm up, main set, cool down…"
                  />
                </div>
              )}

              {(cfg.distance || cfg.duration) && (
                <div className="row">
                  {cfg.distance && (
                    <div className="field">
                      <label>Distance (km)</label>
                      <input type="number" step="0.1" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} />
                    </div>
                  )}
                  {cfg.duration && (
                    <div className="field">
                      <label>Duration (min)</label>
                      <input type="number" step="1" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
                    </div>
                  )}
                </div>
              )}

              {(cfg.pace || cfg.intensity) && (
                <div className="row">
                  {cfg.pace && (
                    <div className="field">
                      <label>Target pace</label>
                      <input
                        value={targetPace}
                        onChange={(e) => setTargetPace(e.target.value)}
                        placeholder="e.g. 4:45/km"
                      />
                    </div>
                  )}
                  {cfg.intensity && (
                    <div className="field">
                      <label>Intensity</label>
                      <select value={intensity ?? "easy"} onChange={(e) => setIntensity(e.target.value)}>
                        {INTENSITIES.map((i) => (
                          <option key={i} value={i}>
                            {i.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {type === "rest" && (
                <div className="field">
                  <label>Note (optional)</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Full rest, or light stretching/mobility"
                  />
                </div>
              )}

              <div className="field">
                <label>Private coach notes</label>
                <textarea
                  value={coachNotes}
                  onChange={(e) => setCoachNotes(e.target.value)}
                  placeholder="Not shown prominently to athlete — for your own reference"
                />
              </div>

              <div className="modal-actions">
                <div>
                  {existing && onDelete && (
                    <button type="button" className="btn-text" onClick={onDelete}>
                      Delete
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
          </>
        )}
      </div>
    </div>
  );
}
