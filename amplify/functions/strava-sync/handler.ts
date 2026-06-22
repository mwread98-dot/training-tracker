import { SQSEvent } from "aws-lambda";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import type { Schema } from "../../data/resource";

// ─── Runtime Environment (replaces $amplify/env virtual module) ─────────────
// process.env contains all secrets + env vars defined in defineFunction()
const env = process.env as Record<string, string | undefined>;

// Declare client globally to reuse across warm invocations, but leave uninitialized 
// at the top level to avoid esbuild/shim bundling errors.
let client: ReturnType<typeof generateClient<Schema>>;

const CLIENT_ID = env.STRAVA_CLIENT_ID!;
const CLIENT_SECRET = env.STRAVA_CLIENT_SECRET!;

// ─── Strava Incoming types ───────────────────────────────────────────────────

type StravaActivity = {
  id: number;
  name: string;
  sport_type: string; // "Run" | "Ride" | "Swim" | "Walk" | ...
  start_date: string; // ISO 8601, e.g. "2026-06-20T07:30:00Z"
  distance: number;        // metres
  moving_time: number;     // seconds
  elapsed_time: number;    // seconds
  average_speed: number;   // m/s
  average_heartrate?: number;
  max_heartrate?: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strava sport_type → our Workout type */
function sportToType(sport: string): string {
  const s = sport.toLowerCase();
  if (s === "run" || s === "trailrun") return "run";
  if (s === "ride" || s === "virtualride" || s === "ebikeride") return "bike";
  if (s === "swim") return "swim";
  return "cross_train";
}

/** Convert m/s average speed to formatted "M:SS/km" pace string */
function speedToPace(mps: number): string {
  if (mps <= 0) return "";
  const secPerKm = 1000 / mps;
  const mins = Math.floor(secPerKm / 60);
  const secs = Math.round(secPerKm % 60);
  return `${mins}:${String(secs).padStart(2, "0")}/km`;
}

/** Get just the YYYY-MM-DD date part in UTC */
function toDateStr(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}

/** Returns a fresh access token, refreshing via Strava if needed */
async function getFreshToken(token: any): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (token.expiresAt > nowSec + 300) {
    return token.accessToken;
  }

  console.log(`Refreshing Strava token for ${token.athleteEmail}`);
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
    }),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };

  const { errors } = await client.models.StravaToken.update({
    athleteEmail: token.athleteEmail,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  });

  if (errors) {
    throw new Error(`Failed to update refreshed token in data store: ${JSON.stringify(errors)}`);
  }

  return data.access_token;
}

/** Fetch recent activities from Strava for one athlete */
async function fetchActivities(
  accessToken: string,
  afterTimestamp: number
): Promise<StravaActivity[]> {
  const url = new URL("https://www.strava.com/api/v3/athlete/activities");
  url.searchParams.set("after", String(afterTimestamp));
  url.searchParams.set("per_page", "50");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Strava activities fetch failed: ${await res.text()}`);
  }

  return res.json() as Promise<StravaActivity[]>;
}

/** Fetch a distinct individual activity explicitly */
async function fetchSingleActivity(
  accessToken: string,
  activityId: string
): Promise<StravaActivity> {
  const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Strava individual activity fetch failed: ${await res.text()}`);
  }

  return res.json() as Promise<StravaActivity>;
}

/** Find an athlete mapping row by their unique numerical Strava Athlete ID */
async function findTokenByStravaAthleteId(stravaAthleteId: string): Promise<any | null> {
  const { data, errors } = await client.models.StravaToken.list({
    filter: {
      stravaAthleteId: { eq: String(stravaAthleteId) },
    },
  });

  if (errors) {
    console.error("Error finding token by Strava Athlete ID:", errors);
    return null;
  }
  return data[0] ?? null;
}

/** Find a Workout for this athlete on this date that hasn't been synced yet */
async function findMatchingWorkout(
  athleteEmail: string,
  dateStr: string
): Promise<any | null> {
  const { data, errors } = await client.models.Workout.list({
    filter: {
      athleteEmail: { eq: athleteEmail },
      date: { eq: dateStr },
      stravaActivityId: { attributeExists: false },
    },
  });

  if (errors) {
    console.error("Error finding matching workout profile:", errors);
    return null;
  }
  return data[0] ?? null;
}

/** Find a Workout row specifically linked to a distinct Strava Activity ID */
async function findWorkoutByStravaActivityId(stravaActivityId: string): Promise<any | null> {
  const { data, errors } = await client.models.Workout.list({
    filter: {
      stravaActivityId: { eq: String(stravaActivityId) },
    },
  });

  if (errors) {
    console.error("Error locating workout by Strava Activity ID:", errors);
    return null;
  }
  return data[0] ?? null;
}

/** Write actual stats from Strava back to the Workout row via AppSync Mutations */
async function updateWorkout(athleteEmail: string, date: string, activity: StravaActivity): Promise<void> {
  const distanceKm = activity.distance / 1000;
  const durationMin = activity.moving_time / 60;
  const pace = activity.average_speed > 0 ? speedToPace(activity.average_speed) : null;
  const heartRate = activity.average_heartrate ? Math.round(activity.average_heartrate) : null;

  const { data: updated, errors } = await client.models.Workout.update({
    athleteEmail,
    date,
    actualDistanceKm: parseFloat(distanceKm.toFixed(2)),
    actualDurationMin: parseFloat(durationMin.toFixed(1)),
    actualPace: pace,
    avgHeartRate: heartRate,
    stravaActivityId: String(activity.id),
    completed: true,
  });

  if (errors) {
    console.error(`Failed to push GraphQL workout updates for ${athleteEmail} on ${date}:`, errors);
  } else {
    console.log(`Updated workout for ${athleteEmail} on ${date} with Strava activity ${activity.id} via GraphQL Client.`);
  }
}

/** Reset a Workout row, removing its Strava data and un-completing it */
async function resetWorkout(athleteEmail: string, date: string): Promise<void> {
  const { errors } = await client.models.Workout.update({
    athleteEmail,
    date,
    completed: false,
    actualDistanceKm: null,
    actualDurationMin: null,
    actualPace: null,
    avgHeartRate: null,
    stravaActivityId: null,
  });

  if (errors) {
    console.error(`Failed to clear/decouple workout row for ${athleteEmail} on ${date}:`, errors);
  } else {
    console.log(`Successfully decoupled and reset workout for ${athleteEmail} on ${date} due to Strava deletion request.`);
  }
}

// ─── Main Pipeline Handler ───────────────────────────────────────────────────

export const handler = async (event: SQSEvent) => {
  // Lazily configure Amplify inside the runtime invocation block to bypass root esbuild bundling issues
  if (!client) {
    const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
    Amplify.configure(resourceConfig, libraryOptions);
    client = generateClient<Schema>({ authMode: "iam" });
  }

  console.log(`Strava pipeline processing started. Received ${event.Records.length} records.`);

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);

      // BRANCH A: BACKUP FALLBACK SWEEP
      if (body.object_type === "activity" && body.aspect_type === "fallback_sync_all") {
        console.log("[Pipeline Trigger] Executing scheduled backup fallback sweep.");
        await runFallbackSweep();
        continue;
      }

      // BRANCH B: NEAR REAL-TIME WEBHOOK ENGINE - HANDLING DELETIONS
      if (body.object_type === "activity" && body.aspect_type === "delete") {
        const activityId = String(body.object_id);
        console.log(`[Pipeline Trigger] Real-time activity deletion detected. Activity: ${activityId}`);

        const workout = await findWorkoutByStravaActivityId(activityId);
        
        if (!workout) {
          console.log(`No local synchronized workout found for Strava Activity ID: ${activityId}. Skipping removal lifecycle.`);
          continue;
        }

        await resetWorkout(workout.athleteEmail, workout.date);
        continue;
      }

      // BRANCH C: NEAR REAL-TIME WEBHOOK ENGINE - HANDLING CREATIONS
      if (body.object_type === "activity" && body.aspect_type === "create") {
        const stravaAthleteId = String(body.owner_id);
        const activityId = String(body.object_id);

        console.log(`[Pipeline Trigger] Real-time activity upload detected. Activity: ${activityId}, Athlete: ${stravaAthleteId}`);

        const token = await findTokenByStravaAthleteId(stravaAthleteId);
        if (!token) {
          console.warn(`[Warning] Activity received but no local Athlete context exists for Strava Athlete ID: ${stravaAthleteId}.`);
          continue;
        }

        const accessToken = await getFreshToken(token);
        const activity = await fetchSingleActivity(accessToken, activityId);

        const sportLower = activity.sport_type.toLowerCase();
        if (!["run", "ride", "swim", "trailrun", "virtualride"].includes(sportLower)) {
          console.log(`Activity ${activityId} profile type (${activity.sport_type}) isn't synchronized. Skipping.`);
          continue;
        }

        const dateStr = toDateStr(activity.start_date);
        const workout = await findMatchingWorkout(token.athleteEmail, dateStr);

        if (!workout) {
          console.log(`No matching scheduled template found for ${token.athleteEmail} on date ${dateStr}.`);
          continue;
        }

        await updateWorkout(workout.athleteEmail, workout.date, activity);
        continue;
      }

      console.log(`[Notice] Received unknown SQS message signature payload. Skipping evaluation.`);

    } catch (err) {
      console.error(`Execution pipeline error handling SQS record ID ${record.messageId}:`, err);
      throw err; 
    }
  }

  console.log("Strava pipeline block finalized cleanly.");
};

// ─── Fallback Sweep Routine ──────────────────────────────────────────────────

async function runFallbackSweep(): Promise<void> {
  const { data: tokens, errors: tokenErrors } = await client.models.StravaToken.list();

  if (tokenErrors) {
    console.error("Sweep concluded early: Failed to map registered tokens:", tokenErrors);
    return;
  }

  if (tokens.length === 0) {
    console.log("Sweep concluded early: No Strava tokens are registered yet.");
    return;
  }

  for (const token of tokens) {
    try {
      console.log(`Sweep auditing athlete profile: ${token.athleteEmail}`);

      const afterTimestamp = token.lastSyncAt
        ? Math.floor(new Date(token.lastSyncAt).getTime() / 1000) - 3600 
        : Math.floor(Date.now() / 1000) - 30 * 24 * 3600; 

      const accessToken = await getFreshToken(token);
      const activities = await fetchActivities(accessToken, afterTimestamp);

      console.log(`  Auditor collected ${activities.length} entries for ${token.athleteEmail}`);

      const relevant = activities.filter((a) =>
        ["run", "ride", "swim", "trailrun", "virtualride"].includes(
          a.sport_type.toLowerCase()
        )
      );

      for (const activity of relevant) {
        const dateStr = toDateStr(activity.start_date);
        const workout = await findMatchingWorkout(token.athleteEmail, dateStr);

        if (!workout) continue;
        await updateWorkout(workout.athleteEmail, workout.date, activity);
      }

      await client.models.StravaToken.update({
        athleteEmail: token.athleteEmail,
        lastSyncAt: new Date().toISOString(),
      });
      
    } catch (err) {
      console.error(`Sweep sequence failed internally on athlete context: ${token.athleteEmail}:`, err);
    }
  }
}