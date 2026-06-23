import { useCallback, useEffect, useMemo, useState } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";
import CalendarGrid, { type CalendarWorkout } from "./CalendarGrid";
import WorkoutForm from "./WorkoutForm";

const client = generateClient<Schema>();
type Profile = Schema["Profile"]["type"];
type Workout = Schema["Workout"]["type"];

const POLL_MS = 20000;

function sortWorkouts(items: Workout[]) {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.title.localeCompare(b.title);
  });
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
    setWorkouts(sortWorkouts(data));
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
      await client.models.Workout.update({
        entryId: formState.existing.entryId,
        athleteEmail: formState.existing.athleteEmail,
        ...data,
      });
    } else {
      await client.models.Workout.create({
        entryId: crypto.randomUUID(),
        source: "coach",
        ...data,
      } as any);
    }
    setFormState({ open: false });
    if (selected) loadWorkouts(selected.email);
  }

  async function deleteWorkout() {
    if (formState.open && formState.existing) {
      await client.models.Workout.delete({ entryId: formState.existing.entryId });
    }
    setFormState({ open: false });
    if (selected) loadWorkouts(selected.email);
  }

  const calendarWorkouts: CalendarWorkout[] = useMemo(
    () =>
      workouts.map((w) => ({
        id: w.entryId,
        date: w.date,
        title: w.title,
        type: w.type,
        intensity: w.intensity,
        completed: w.completed,
        distanceKm: w.distanceKm,
        durationMin: w.durationMin,
        actualDistanceKm: w.actualDistanceKm,
        actualDurationMin: w.actualDurationMin,
        source: (w.source as string | null | undefined) ?? (w.stravaActivityId ? "strava" : "coach"),
        hasActualStats: !!(
          w.actualDistanceKm ||
          w.actualDurationMin ||
          w.actualElapsedDurationMin ||
          w.actualPace ||
          w.avgHeartRate
        ),
      })),
    [workouts]
  );

  const completedActivitiesOnDate = useMemo(() => {
    if (!formState.open) return [];
    return workouts.filter(
      (w) =>
        w.date === formState.date &&
        (w.completed ||
          !!w.stravaActivityId ||
          !!w.actualDistanceKm ||
          !!w.actualDurationMin ||
          !!w.actualElapsedDurationMin ||
          !!w.actualPace ||
          !!w.avgHeartRate)
    );
  }, [workouts, formState]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24 }}>
      <div className="card" style={{ height: "fit-content" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <h3 style={{ fontSize: 15 }}>Athletes</h3>
          <button className="btn-text" onClick={() => setShowAddAthlete(true)}>
            + Add
          </button>
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
                const full = workouts.find((x) => x.entryId === w.id) ?? null;
                setFormState({ open: true, date: w.date, existing: full });
              }}
            />
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 12 }}>
              Planned sessions and every synced Strava activity appear here. Open any date to switch between the planned view and the completed activities recorded that day.
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
                They'll need to sign up with this exact email, and you'll need to add them to the "Athletes" group in Cognito once.
              </p>
              <div className="modal-actions">
                <div />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn" onClick={() => setShowAddAthlete(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Add
                  </button>
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
          completedActivitiesOnDate={completedActivitiesOnDate}
          onSave={saveWorkout}
          onDelete={formState.existing ? deleteWorkout : undefined}
          onClose={() => setFormState({ open: false })}
        />
      )}
    </div>
  );
}
