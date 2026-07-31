import { useCallback, useEffect, useMemo, useState } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";
import CalendarGrid, { type CalendarWorkout, type DayAvailability } from "./CalendarGrid";
import WorkoutForm from "./WorkoutForm";

const client = generateClient<Schema>();
type Profile = Schema["Profile"]["type"];
type Workout = Schema["Workout"]["type"];
type Availability = Schema["Availability"]["type"];

const POLL_MS = 20000;

function sortWorkouts(items: Workout[]) {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.title.localeCompare(b.title);
  });
}

function generateEntryId() {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function CoachDashboard() {
  const [athletes, setAthletes] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [availabilityRecords, setAvailabilityRecords] = useState<Availability[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [showAddAthlete, setShowAddAthlete] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<
    { open: false } | { open: true; date: string; existing: Workout | null }
  >({ open: false });
  const [copiedWorkout, setCopiedWorkout] = useState<Workout | null>(null);

  const loadAthletes = useCallback(async () => {
    const { data, errors } = await client.models.Profile.list();
    if (errors?.length) {
      console.error("Failed to load athletes", errors);
      setError("Could not load athletes.");
      return;
    }
    setAthletes(data);
    setSelected((prev) => prev ?? data[0] ?? null);
  }, []);

  const loadWorkouts = useCallback(async (athleteEmail: string) => {
    const { data, errors } = await client.models.Workout.list({
      filter: { athleteEmail: { eq: athleteEmail } },
    });
    if (errors?.length) {
      console.error("Failed to load workouts", errors);
      setError("Could not load workouts.");
      return;
    }
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

  const loadAvailability = useCallback(async (athleteEmail: string) => {
    const { data, errors } = await client.models.Availability.list({
      filter: { athleteEmail: { eq: athleteEmail } },
    });
    if (errors?.length) {
      console.error("Failed to load availability", errors);
      return;
    }
    setAvailabilityRecords(data);
  }, []);

  useEffect(() => {
    if (!selected) {
      setAvailabilityRecords([]);
      return;
    }
    loadAvailability(selected.email);
    const interval = setInterval(() => loadAvailability(selected.email), POLL_MS);
    return () => clearInterval(interval);
  }, [selected, loadAvailability]);

  useEffect(() => {
    if (!showAddAthlete) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowAddAthlete(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [showAddAthlete]);

  async function addAthlete(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) return;
    setError(null);
    const { errors } = await client.models.Profile.create({
      email: newEmail.trim().toLowerCase(),
      name: newName.trim(),
    });
    if (errors?.length) {
      console.error("Failed to add athlete", errors);
      setError("Could not add athlete.");
      return;
    }
    setNewName("");
    setNewEmail("");
    setShowAddAthlete(false);
    await loadAthletes();
  }

  async function saveWorkout(data: Partial<Workout> & { date: string; title: string }) {
    setError(null);

    if (formState.open && formState.existing) {
      const { errors } = await client.models.Workout.update({
        entryId: formState.existing.entryId,
        athleteEmail: formState.existing.athleteEmail,
        date: data.date,
        athleteName: data.athleteName,
        source: data.source,
        type: data.type,
        intensity: data.intensity,
        title: data.title,
        description: data.description,
        distanceKm: data.distanceKm,
        durationMin: data.durationMin,
        targetPace: data.targetPace,
        coachNotes: data.coachNotes,
      });
      if (errors?.length) {
        console.error("Failed to update workout", errors);
        setError("Could not save this workout.");
        return;
      }
    } else {
      const createInput = {
        entryId: generateEntryId(),
        athleteEmail: data.athleteEmail!,
        athleteName: data.athleteName,
        date: data.date,
        source: data.source ?? "coach",
        type: data.type,
        intensity: data.intensity,
        title: data.title,
        description: data.description,
        distanceKm: data.distanceKm,
        durationMin: data.durationMin,
        targetPace: data.targetPace,
        coachNotes: data.coachNotes,
        completed: false,
      };
      const { errors } = await client.models.Workout.create(createInput as any);
      if (errors?.length) {
        console.error("Failed to create workout", errors);
        setError("Could not create this workout.");
        return;
      }
    }

    setFormState({ open: false });
    if (selected) {
      await loadWorkouts(selected.email);
    }
  }

  async function deleteWorkout() {
    if (!(formState.open && formState.existing)) return;
    setError(null);
    const { errors } = await client.models.Workout.delete({ entryId: formState.existing.entryId });
    if (errors?.length) {
      console.error("Failed to delete workout", errors);
      setError("Could not delete this workout.");
      return;
    }
    setFormState({ open: false });
    if (selected) {
      await loadWorkouts(selected.email);
    }
  }

  function copyWorkout() {
    if (formState.open && formState.existing) {
      setCopiedWorkout(formState.existing);
    }
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
        targetPace: w.targetPace,
        actualPace: w.actualPace,
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

  const availabilityMap = useMemo(() => {
    const map: Record<string, { status: DayAvailability; note?: string | null }> = {};
    for (const a of availabilityRecords) {
      if (a.status) map[a.date] = { status: a.status as DayAvailability, note: a.note };
    }
    return map;
  }, [availabilityRecords]);

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

  const availabilityForFormDate = useMemo(() => {
    if (!formState.open) return null;
    return availabilityMap[formState.date] ?? null;
  }, [availabilityMap, formState]);

  return (
    <div className="coach-layout">
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
          <button type="button" className="btn-text" onClick={() => setShowAddAthlete(true)}>
            + Add
          </button>
        </div>
        {error && (
          <p style={{ fontSize: 13, color: "#b42318", marginBottom: 12 }}>
            {error}
          </p>
        )}
        <div className="athlete-list">
          {athletes.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              No athletes yet â€” add your first one.
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
        {copiedWorkout && (
          <div
            className="card copied-workout-banner"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 16px",
              marginBottom: 12,
              fontSize: 13,
            }}
          >
            <span>
              ðŸ“‹ Copied <strong>{copiedWorkout.title}</strong> â€” open any empty day and choose "Paste copied workout" to reuse it.
            </span>
            <button className="btn-text" onClick={() => setCopiedWorkout(null)}>
              Clear
            </button>
          </div>
        )}
        {selected ? (
          <div className="card">
            <CalendarGrid
              year={year}
              month={month}
              workouts={calendarWorkouts}
              availability={availabilityMap}
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
              dayActionLabel="Add workout"
              onDayClick={(iso) => setFormState({ open: true, date: iso, existing: null })}
              onWorkoutClick={(w) => {
                const full = workouts.find((x) => x.entryId === w.id) ?? null;
                setFormState({ open: true, date: w.date, existing: full });
              }}
            />
          </div>
        ) : (
          <div className="empty-state">Add an athlete to start planning their training.</div>
        )}
      </div>

      {showAddAthlete && (
        <div className="modal-backdrop" onClick={() => setShowAddAthlete(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-athlete-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="add-athlete-title" style={{ marginBottom: 16 }}>Add an athlete</h2>
            <form onSubmit={addAthlete}>
              <div className="field">
                <label htmlFor="athlete-name">Name</label>
                <input id="athlete-name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="athlete-email">Email (must match their login email)</label>
                <input
                  id="athlete-email"
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
          athleteAvailability={availabilityForFormDate}
          copiedWorkout={copiedWorkout}
          onCopyWorkout={copyWorkout}
          onSave={saveWorkout}
          onDelete={formState.existing ? deleteWorkout : undefined}
          onClose={() => setFormState({ open: false })}
        />
      )}
    </div>
  );
}
