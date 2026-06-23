import { useCallback, useEffect, useState } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";
import CalendarGrid, { type CalendarWorkout } from "./CalendarGrid";
import WorkoutForm from "./WorkoutForm";
const client = generateClient<Schema>();
type Profile = Schema["Profile"]["type"];
type Workout = Schema["Workout"]["type"];
// How often to silently re-check for changes made by athletes (e.g. marking
// a session complete) while the coach has the dashboard open.
const POLL_MS = 20000;

function getWorkoutKey(workout: Pick<Workout, "athleteEmail" | "date">) {
  return `${workout.athleteEmail}::${workout.date}`;
}

export default function CoachDashboard() {
  const [athletes, setAthletes] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [showAddAthlete, setShowAddAthlete] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [formState, setFormState] = useState<
    { open: false } | { open: true; date: string; existing: Workout | null }
  >({ open: false });
  const loadAthletes = useCallback(async () => {
    const { data } = await client.models.Profile.list();
    setAthletes(data);
    setSelected((prev) => prev ?? data[0] ?? null);
  }, []);
  const loadWorkouts = useCallback(async (athleteEmail: string) => {
    const { data } = await client.models.Workout.list({
      filter: { athleteEmail: { eq: athleteEmail } },
    });
    setWorkouts(data);
  }, []);
  useEffect(() => {
    loadAthletes();
  }, [loadAthletes]);
  useEffect(() => {
    if (!selected) {
      setWorkouts([]);
      return;
    }
    loadWorkouts(selected.email);
    const interval = setInterval(() => loadWorkouts(selected.email), POLL_MS);
    return () => clearInterval(interval);
  }, [selected, loadWorkouts]);
  async function addAthlete(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) return;
    await client.models.Profile.create({
      email: newEmail.trim().toLowerCase(),
      name: newName.trim(),
    });
    setNewName("");
    setNewEmail("");
    setShowAddAthlete(false);
    loadAthletes();
  }
  async function saveWorkout(data: Partial<Workout> & { date: string; title: string }) {
    if (formState.open && formState.existing) {
      const { date: _newDate, ...rest } = data;

      await client.models.Workout.update({
        athleteEmail: formState.existing.athleteEmail,
        date: formState.existing.date,
        ...rest,
      });
    } else {
      await client.models.Workout.create(data as any);
    }
    setFormState({ open: false });
    if (selected) loadWorkouts(selected.email);
  }
  async function deleteWorkout() {
    if (formState.open && formState.existing) {
      await client.models.Workout.delete({
        athleteEmail: formState.existing.athleteEmail,
        date: formState.existing.date,
      });
    }
    setFormState({ open: false });
    if (selected) loadWorkouts(selected.email);
  }
  const calendarWorkouts: CalendarWorkout[] = workouts.map((w) => ({
    id: getWorkoutKey(w),
    date: w.date,
    title: w.title,
    type: w.type,
    intensity: w.intensity,
    completed: w.completed,
    distanceKm: w.distanceKm,
    durationMin: w.durationMin,
  }));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24 }}>
      <div className="card" style={{ height: "fit-content" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ fontSize: 15 }}>Athletes</h3>
          <button className="btn-text" onClick={() => setShowAddAthlete(true)}>+ Add</button>
        </div>
        <div className="athlete-list">
          {athletes.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              No athletes yet — add your first one.
            </p>
          )}
          {athletes.map((a) => (
            <button
              key={a.email}
              className={selected?.email === a.email ? "active" : ""}
              onClick={() => setSelected(a)}
            >
              {a.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        {selected ? (
          <div className="card">
            <CalendarGrid
              year={year}
              month={month}
              workouts={calendarWorkouts}
              onPrevMonth={() => {
                const d = new Date(year, month - 1, 1);
                setYear(d.getFullYear());
                setMonth(d.getMonth());
              }}
              onNextMonth={() => {
                const d = new Date(year, month + 1, 1);
                setYear(d.getFullYear());
                setMonth(d.getMonth());
              }}
              onDayClick={(iso) => setFormState({ open: true, date: iso, existing: null })}
              onWorkoutClick={(w) => {
                const full = workouts.find((x) => getWorkoutKey(x) === w.id) ?? null;
                setFormState({ open: true, date: w.date, existing: full });
              }}
            />
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 12 }}>
              Click any day to add a session, or click an existing session to edit it.
            </p>
          </div>
        ) : (
          <div className="empty-state">Add an athlete to start planning their training.</div>
        )}
      </div>
      {showAddAthlete && (
        <div className="modal-backdrop" onClick={() => setShowAddAthlete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginBottom: 16 }}>Add an athlete</h2>
            <form onSubmit={addAthlete}>
              <div className="field">
                <label>Name</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} required />
              </div>
              <div className="field">
                <label>Email (must match their login email)</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
              </div>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                They'll need to sign up with this exact email, and you'll need to add
                them to the "Athletes" group in Cognito once.
              </p>
              <div className="modal-actions">
                <div />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn" onClick={() => setShowAddAthlete(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">Add</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {formState.open && selected && (
        <WorkoutForm
          athleteEmail={selected.email}
          athleteName={selected.name}
          defaultDate={formState.date}
          existing={formState.existing}
          onSave={saveWorkout}
          onDelete={formState.existing ? deleteWorkout : undefined}
          onClose={() => setFormState({ open: false })}
        />
      )}
    </div>
  );
}
