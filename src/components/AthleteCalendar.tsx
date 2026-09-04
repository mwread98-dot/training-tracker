import { useCallback, useEffect, useMemo, useState } from "react";
import { generateClient } from "aws-amplify/data";
import { fetchAuthSession, fetchUserAttributes } from "aws-amplify/auth";
import type { Schema } from "../../amplify/data/resource";
import CalendarGrid, { type CalendarWorkout, type DayAvailability } from "./CalendarGrid";
import WorkoutDetail from "./WorkoutDetail";
import AvailabilityForm from "./AvailabilityForm";
import GoalRacePanel from "./GoalRacePanel";

const client = generateClient<Schema>();
type Workout = Schema["Workout"]["type"];
type Availability = Schema["Availability"]["type"];
type Profile = Schema["Profile"]["type"];

const POLL_MS = 20000;
const STRAVA_CLIENT_ID = (import.meta as any).env?.VITE_STRAVA_CLIENT_ID ?? "";
const STRAVA_REDIRECT_URI = window.location.origin;

function buildStravaAuthUrl() {
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    redirect_uri: STRAVA_REDIRECT_URI,
    response_type: "code",
    approval_prompt: "auto",
    scope: "activity:read_all",
  });
  return `https://www.strava.com/oauth/authorize?${params}`;
}

function sortWorkouts(items: Workout[]) {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.title.localeCompare(b.title);
  });
}

export default function AthleteCalendar() {
  const [email, setEmail] = useState<string | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [availabilityRecords, setAvailabilityRecords] = useState<Availability[]>([]);
  const [editingAvailabilityDate, setEditingAvailabilityDate] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selected, setSelected] = useState<Workout | null>(null);
  const [stravaStatus, setStravaStatus] = useState<
    "unknown" | "connected" | "not_connected" | "connecting" | "error"
  >("unknown");
  const [stravaError, setStravaError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const attrs = await fetchUserAttributes();
      setEmail(attrs.email ?? null);
      const session = await fetchAuthSession();
      setIdToken(session.tokens?.idToken?.toString() ?? null);
    })();
  }, []);

  useEffect(() => {
    if (!email || !idToken) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");

    if (code || error) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (error) {
      setStravaStatus("error");
      setStravaError("Strava connection was cancelled.");
      return;
    }

    if (code) {
      setStravaStatus("connecting");
      (async () => {
        try {
          const result = await client.mutations.exchangeStravaCode(
            { code, athleteEmail: email },
            { authMode: "userPool", authToken: idToken }
          );
          if (result.data?.success) {
            setStravaStatus("connected");
          } else {
            setStravaStatus("error");
            setStravaError(result.data?.message ?? "Connection failed.");
          }
        } catch (err) {
          console.error("exchangeStravaCode error:", err);
          setStravaStatus("error");
          setStravaError("Could not connect to Strava. Please try again.");
        }
      })();
    }
  }, [email, idToken]);

  useEffect(() => {
    if (!email || !idToken || stravaStatus !== "unknown") return;
    (async () => {
      try {
        const result = await client.models.StravaToken.get(
          { athleteEmail: email },
          { authMode: "userPool", authToken: idToken }
        );
        setStravaStatus(result.data ? "connected" : "not_connected");
      } catch {
        setStravaStatus("not_connected");
      }
    })();
  }, [email, idToken, stravaStatus]);

  const loadProfile = useCallback(async () => {
    if (!email || !idToken) return;
    const { data, errors } = await client.models.Profile.get(
      { email },
      { authMode: "userPool", authToken: idToken }
    );
    if (errors?.length) {
      console.error("Failed to load profile", errors);
      return;
    }
    setProfile(data);
  }, [email, idToken]);

  useEffect(() => {
    loadProfile();
    const interval = setInterval(loadProfile, POLL_MS);
    return () => clearInterval(interval);
  }, [loadProfile]);

  const loadWorkouts = useCallback(async () => {
    if (!email || !idToken) return;
    const { data: items, errors } = await client.models.Workout.list({
      filter: { athleteEmail: { eq: email } },
      authMode: "userPool",
      authToken: idToken,
    });
    if (errors?.length) {
      console.error("Failed to load athlete workouts", errors);
      return;
    }
    setWorkouts(sortWorkouts(items));
  }, [email, idToken]);

  useEffect(() => {
    loadWorkouts();
    const interval = setInterval(loadWorkouts, POLL_MS);
    return () => clearInterval(interval);
  }, [loadWorkouts]);

  const loadAvailability = useCallback(async () => {
    if (!email || !idToken) return;
    const { data: items, errors } = await client.models.Availability.list({
      filter: { athleteEmail: { eq: email } },
      authMode: "userPool",
      authToken: idToken,
    });
    if (errors?.length) {
      console.error("Failed to load availability", errors);
      return;
    }
    setAvailabilityRecords(items);
  }, [email, idToken]);

  useEffect(() => {
    loadAvailability();
    const interval = setInterval(loadAvailability, POLL_MS);
    return () => clearInterval(interval);
  }, [loadAvailability]);

  async function handleSaveAvailability(status: DayAvailability, note: string) {
    if (!editingAvailabilityDate || !email || !idToken) return;
    const existing = availabilityRecords.find((a) => a.date === editingAvailabilityDate);
    const payload = {
      athleteEmail: email,
      date: editingAvailabilityDate,
      status,
      note: note || undefined,
    };
    const { errors } = existing
      ? await client.models.Availability.update(payload, { authMode: "userPool", authToken: idToken })
      : await client.models.Availability.create(payload, { authMode: "userPool", authToken: idToken });
    if (errors?.length) {
      console.error("Failed to save availability", errors);
      return;
    }
    setEditingAvailabilityDate(null);
    await loadAvailability();
  }

  async function handleClearAvailability() {
    if (!editingAvailabilityDate || !email || !idToken) return;
    const { errors } = await client.models.Availability.delete(
      { athleteEmail: email, date: editingAvailabilityDate },
      { authMode: "userPool", authToken: idToken }
    );
    if (errors?.length) {
      console.error("Failed to clear availability", errors);
      return;
    }
    setEditingAvailabilityDate(null);
    await loadAvailability();
  }

  async function handleSave(data: { completed: boolean; athleteNotes?: string }) {
    if (!selected || !idToken) return;
    const { errors } = await client.models.Workout.update(
      {
        entryId: selected.entryId,
        athleteEmail: selected.athleteEmail,
        date: selected.date,
        ...data,
      },
      { authMode: "userPool", authToken: idToken }
    );
    if (errors?.length) {
      console.error("Failed to update athlete workout", errors);
      return;
    }
    setSelected(null);
    await loadWorkouts();
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

  const editingAvailabilityRecord = useMemo(
    () => availabilityRecords.find((a) => a.date === editingAvailabilityDate) ?? null,
    [availabilityRecords, editingAvailabilityDate]
  );

  const completedActivitiesOnDate = useMemo(() => {
    if (!selected) return [];
    return workouts.filter(
      (w) =>
        w.date === selected.date &&
        (w.completed ||
          !!w.stravaActivityId ||
          !!w.actualDistanceKm ||
          !!w.actualDurationMin ||
          !!w.actualElapsedDurationMin ||
          !!w.actualPace ||
          !!w.avgHeartRate)
    );
  }, [workouts, selected]);

  const monthHasEntries = workouts.some((w) => w.date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`));

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        {stravaStatus === "not_connected" && STRAVA_CLIENT_ID && (
          <div className="strava-banner">
            <span>Connect Strava to automatically log your sessions.</span>
            <a href={buildStravaAuthUrl()} className="btn-strava">
              <StravaLogo /> Connect with Strava
            </a>
          </div>
        )}
        {stravaStatus === "connecting" && (
          <div className="strava-banner strava-banner--muted">Connecting your Strava account…</div>
        )}
        {stravaStatus === "connected" && (
          <div className="strava-banner strava-banner--success">
            ✓ Strava connected.
          </div>
        )}
        {stravaStatus === "error" && (
          <div className="strava-banner strava-banner--error">
            {stravaError ?? "Strava connection error."}{" "}
            <a href={buildStravaAuthUrl()} style={{ color: "inherit", fontWeight: 600 }}>
              Try again
            </a>
          </div>
        )}
        {!STRAVA_CLIENT_ID && (
          <div className="strava-banner strava-banner--muted">
            Strava integration is not yet configured — see README for setup steps.
          </div>
        )}
      </div>

      <div className="card">
        <GoalRacePanel goalRaceName={profile?.goalRaceName} goalRaceDate={profile?.goalRaceDate} />
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
          dayActionLabel="Set availability"
          onDayClick={(iso) => setEditingAvailabilityDate(iso)}
          onWorkoutClick={(w) => {
            const full = workouts.find((x) => x.entryId === w.id) ?? null;
            setSelected(full);
          }}
        />

        {!monthHasEntries && (
          <p style={{ color: "var(--text-muted)", marginTop: 16 }}>
            No sessions on your calendar yet — your coach can plan them here, and any synced Strava activities will show automatically.
          </p>
        )}

        {selected && (
          <WorkoutDetail
            workout={selected}
            completedActivitiesOnDate={completedActivitiesOnDate}
            onSave={handleSave}
            onClose={() => setSelected(null)}
          />
        )}

        {editingAvailabilityDate && (
          <AvailabilityForm
            date={editingAvailabilityDate}
            existingStatus={(editingAvailabilityRecord?.status as DayAvailability | null) ?? null}
            existingNote={editingAvailabilityRecord?.note}
            onSave={handleSaveAvailability}
            onClear={editingAvailabilityRecord ? handleClearAvailability : undefined}
            onClose={() => setEditingAvailabilityDate(null)}
          />
        )}
      </div>
    </div>
  );
}

function StravaLogo() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}
