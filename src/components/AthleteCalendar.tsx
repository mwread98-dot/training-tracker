import { useCallback, useEffect, useState } from "react";
import { generateClient } from "aws-amplify/data";
import { fetchUserAttributes, fetchAuthSession } from "aws-amplify/auth";
import type { Schema } from "../../amplify/data/resource";
import CalendarGrid, { type CalendarWorkout } from "./CalendarGrid";
import WorkoutDetail from "./WorkoutDetail";

const client = generateClient<Schema>();

type Workout = Schema["Workout"]["type"];

const POLL_MS = 20000;

// Strava OAuth config. The redirect URI must match exactly what you register
// in your Strava API app settings at https://www.strava.com/settings/api
const STRAVA_CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID ?? "";
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

export default function AthleteCalendar() {
  const [email, setEmail] = useState<string | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selected, setSelected] = useState<Workout | null>(null);
  const [stravaStatus, setStravaStatus] = useState<
    "unknown" | "connected" | "not_connected" | "connecting" | "error"
  >("unknown");
  const [stravaError, setStravaError] = useState<string | null>(null);

  // ── Auth setup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const attrs = await fetchUserAttributes();
      setEmail(attrs.email ?? null);
      const session = await fetchAuthSession();
      setIdToken(session.tokens?.idToken?.toString() ?? null);
    })();
  }, []);

  // ── Strava OAuth redirect handler ──────────────────────────────────────────
  // After Strava redirects back to the app, the URL will contain ?code=...
  // (success) or ?error=access_denied (user cancelled).
  useEffect(() => {
    if (!email || !idToken) return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");

    // Clear the URL params regardless of outcome so it looks clean
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

  // ── Check existing Strava connection ───────────────────────────────────────
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

  // ── Workout data ───────────────────────────────────────────────────────────
  const loadWorkouts = useCallback(async () => {
    if (!email || !idToken) return;
    const { data: items } = await client.models.Workout.list({
      filter: { athleteEmail: { eq: email } },
      authMode: "userPool",
      authToken: idToken,
    });
    setWorkouts(items);
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
    distanceKm: w.distanceKm,
    durationMin: w.durationMin,
  }));

  return (
    <div>
      {/* ── Strava connection banner ── */}
      <div style={{ marginBottom: 16 }}>
        {stravaStatus === "not_connected" && STRAVA_CLIENT_ID && (
          <div className="strava-banner">
            <span>Connect Strava to automatically log your sessions.</span>
            <a
              href={buildStravaAuthUrl()}
              className="btn-strava"
            >
              <StravaLogo /> Connect with Strava
            </a>
          </div>
        )}
        {stravaStatus === "connecting" && (
          <div className="strava-banner strava-banner--muted">
            Connecting your Strava account…
          </div>
        )}
        {stravaStatus === "connected" && (
          <div className="strava-banner strava-banner--success">
            ✓ Strava connected — your activities will sync automatically every 6 hours.
          </div>
        )}
        {stravaStatus === "error" && (
          <div className="strava-banner strava-banner--error">
            {stravaError ?? "Strava connection error."}
            {" "}
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
    </div>
  );
}

// Official Strava logo mark (SVG, per their brand guidelines)
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
