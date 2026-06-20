import { useCallback, useEffect, useState } from "react";
import { generateClient } from "aws-amplify/data";
import { fetchUserAttributes, fetchAuthSession } from "aws-amplify/auth";
import type { Schema } from "../../amplify/data/resource";
import CalendarGrid, { type CalendarWorkout } from "./CalendarGrid";
import WorkoutDetail from "./WorkoutDetail";

const client = generateClient<Schema>();

type Workout = Schema["Workout"]["type"];

// How often to silently re-check for newly-assigned sessions while the
// athlete has the calendar open.
const POLL_MS = 20000;

export default function AthleteCalendar() {
  const [email, setEmail] = useState<string | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selected, setSelected] = useState<Workout | null>(null);

  useEffect(() => {
    (async () => {
      const attrs = await fetchUserAttributes();
      setEmail(attrs.email ?? null);
      const session = await fetchAuthSession();
      setIdToken(session.tokens?.idToken?.toString() ?? null);
    })();
  }, []);

  const loadWorkouts = useCallback(async () => {
    if (!email || !idToken) return;
    const { data } = await client.models.Workout.list({
      filter: { athleteEmail: { eq: email } },
      authMode: "userPool",
      authToken: idToken,
    });
    setWorkouts(data);
  }, [email, idToken]);

  useEffect(() => {
    loadWorkouts();
    const interval = setInterval(loadWorkouts, POLL_MS);
    return () => clearInterval(interval);
  }, [loadWorkouts]);

  async function handleSave(data: { completed: boolean; athleteNotes?: string }) {
    if (!selected || !idToken) return;
    await client.models.Workout.update(
      { id: selected.id, ...data },
      { authMode: "userPool", authToken: idToken }
    );
    setSelected(null);
    loadWorkouts();
  }

  const calendarWorkouts: CalendarWorkout[] = workouts.map((w) => ({
    id: w.id,
    date: w.date,
    title: w.title,
    type: w.type,
    intensity: w.intensity,
    completed: w.completed,
  }));

  return (
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
        onWorkoutClick={(w) => {
          const full = workouts.find((x) => x.id === w.id) ?? null;
          setSelected(full);
        }}
      />
      {workouts.length === 0 && (
        <p style={{ color: "var(--text-muted)", marginTop: 16 }}>
          No sessions on your calendar yet — your coach will add them here.
        </p>
      )}
      {selected && (
        <WorkoutDetail
          workout={selected}
          onSave={handleSave}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}