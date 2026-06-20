import { useState } from "react";
import type { Schema } from "../../amplify/data/resource";

type Workout = Schema["Workout"]["type"];

type Props = {
  workout: Workout;
  onSave: (data: { completed: boolean; athleteNotes?: string }) => void;
  onClose: () => void;
};

export default function WorkoutDetail({ workout, onSave, onClose }: Props) {
  const [completed, setCompleted] = useState(!!workout.completed);
  const [athleteNotes, setAthleteNotes] = useState(workout.athleteNotes ?? "");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <span className="pill" style={{ marginBottom: 10 }}>
          {(workout.type ?? "session").replace("_", " ")}
        </span>
        <h2 style={{ marginBottom: 4 }}>{workout.title}</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 16 }}>
          {workout.date}
        </p>

        {workout.description && (
          <p style={{ marginBottom: 14 }}>{workout.description}</p>
        )}

        <div className="row" style={{ marginBottom: 14 }}>
          {workout.distanceKm != null && (
            <div className="field">
              <label>Distance</label>
              <div>{workout.distanceKm} km</div>
            </div>
          )}
          {workout.durationMin != null && (
            <div className="field">
              <label>Duration</label>
              <div>{workout.durationMin} min</div>
            </div>
          )}
          {workout.targetPace && (
            <div className="field">
              <label>Target pace</label>
              <div>{workout.targetPace}</div>
            </div>
          )}
        </div>

        <div className="field">
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
