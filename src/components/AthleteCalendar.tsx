import { useEffect, useState } from "react";
import { generateClient } from "aws-amplify/data";
import { fetchUserAttributes, fetchAuthSession } from "aws-amplify/auth";
import type { Schema } from "../../amplify/data/resource";
import CalendarGrid, { type CalendarWorkout } from "./CalendarGrid";
import WorkoutDetail from "./WorkoutDetail";

const client = generateClient<Schema>();

type Workout = Schema["Workout"]["type"];

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
      // The default access token has no email claim, which the Workout
      // owner rule needs. The ID token does carry it, so we fetch it
      // explicitly and pass it on every Workout request below.
      const session = await fetchAuthSession();
      setIdToken(session.tokens?.idToken?.toString() ?? null);
    })();
  }, []);

  useEffect(() => {
    if (!email || !idToken) return;
    const sub = client.models.Workout.observeQuery({
      filter: { athleteEmail: { eq: email } },
      authMode: "userPool",
      authToken: idToken,
    }).subscribe({
      next: ({ items }) => setWorkouts(items),
    });
    return () => sub.unsubscribe();
  }, [email, idToken]);

  async function handleSave(data: { completed: boolean; athleteNotes?: string }) {
    if (!selected || !idToken) return;
    await client.models.Workout.update(
      { id: selected.id, ...data },
      { authMode: "userPool", authToken: idToken }
    );
    setSelected(null);
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