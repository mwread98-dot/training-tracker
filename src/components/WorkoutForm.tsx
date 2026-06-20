import { useState } from "react";
import type { Schema } from "../../amplify/data/resource";

type Workout = Schema["Workout"]["type"];

type Props = {
  athleteEmail: string;
  athleteName: string;
  defaultDate: string;
  existing?: Workout | null;
  onSave: (data: Partial<Workout> & { date: string; title: string }) => void;
  onDelete?: () => void;
  onClose: () => void;
};

const TYPES = ["run", "bike", "swim", "strength", "cross_train", "rest", "race"];
const INTENSITIES = ["easy", "moderate", "hard", "race_pace"];

// Which fields actually make sense for each session type. A rest day needs
// none of them; strength/cross-training don't need distance or pace.
type FieldConfig = { distance: boolean; duration: boolean; pace: boolean; intensity: boolean };
const FIELD_CONFIG: Record<string, FieldConfig> = {
  run: { distance: true, duration: true, pace: true, intensity: true },
  bike: { distance: true, duration: true, pace: true, intensity: true },
  swim: { distance: true, duration: true, pace: true, intensity: true },
  race: { distance: true, duration: true, pace: true, intensity: true },
  strength: { distance: false, duration: true, pace: false, intensity: true },
  cross_train: { distance: false, duration: true, pace: false, intensity: true },
  rest: { distance: false, duration: false, pace: false, intensity: false },
};

export default function WorkoutForm({
  athleteEmail,
  athleteName,
  defaultDate,
  existing,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [date, setDate] = useState(existing?.date ?? defaultDate);
  const [type, setType] = useState<string>(existing?.type ?? "run");
  const [intensity, setIntensity] = useState<string>(existing?.intensity ?? "easy");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [distanceKm, setDistanceKm] = useState(
    existing?.distanceKm?.toString() ?? ""
  );
  const [durationMin, setDurationMin] = useState(
    existing?.durationMin?.toString() ?? ""
  );
  const [targetPace, setTargetPace] = useState(existing?.targetPace ?? "");
  const [coachNotes, setCoachNotes] = useState(existing?.coachNotes ?? "");

  const cfg = FIELD_CONFIG[type] ?? FIELD_CONFIG.run;

  function handleTypeChange(newType: string) {
    setType(newType);
    // Give rest days a sensible default title so the coach doesn't have to
    // type anything for the most common "nothing planned" case.
    if (newType === "rest" && !title.trim()) {
      setTitle("Rest day");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      athleteEmail,
      athleteName,
      date,
      type: type as Workout["type"],
      // Only carry over fields that are relevant to this session type, even
      // if a value is still sitting in state from before the type changed.
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
        <h2 style={{ marginBottom: 4 }}>
          {existing ? "Edit workout" : "New workout"}
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 16 }}>
          For {athleteName}
        </p>

        {existing && (existing.completed || existing.athleteNotes) && (
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
              {existing.completed ? "✓ Marked completed by athlete" : "Not marked completed yet"}
            </strong>
            {existing.athleteNotes && (
              <p style={{ marginTop: 6, marginBottom: 0, color: "var(--text)" }}>
                "{existing.athleteNotes}"
              </p>
            )}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="row">
            <div className="field">
              <label>Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Type</label>
              <select value={type ?? "run"} onChange={(e) => handleTypeChange(e.target.value)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace("_", " ")}</option>
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
              No distance, duration, or pace needed for a rest day. Add a note
              below only if there's something specific (e.g. "light stretching").
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
                  <input
                    type="number"
                    step="0.1"
                    value={distanceKm}
                    onChange={(e) => setDistanceKm(e.target.value)}
                  />
                </div>
              )}
              {cfg.duration && (
                <div className="field">
                  <label>Duration (min)</label>
                  <input
                    type="number"
                    step="1"
                    value={durationMin}
                    onChange={(e) => setDurationMin(e.target.value)}
                  />
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
                  <select
                    value={intensity ?? "easy"}
                    onChange={(e) => setIntensity(e.target.value)}
                  >
                    {INTENSITIES.map((i) => (
                      <option key={i} value={i}>{i.replace("_", " ")}</option>
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
      </div>
    </div>
  );
}
