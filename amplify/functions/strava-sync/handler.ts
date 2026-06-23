import { SQSEvent } from "aws-lambda";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import type { Schema } from "../../data/resource";

const env = process.env;
let client: ReturnType<typeof generateClient<Schema>>;

const CLIENT_ID = process.env.STRAVA_CLIENT_ID!;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET!;

type StravaActivity = {
  id: number;
  name: string;
  sport_type: string;
  start_date: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  average_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
};

type Workout = Schema["Workout"]["type"];

function sportToType(sport: string): Workout["type"] {
  const s = sport.toLowerCase();
  if (s === "run" || s === "trailrun") return "run";
  if (s === "ride" || s === "virtualride" || s === "ebikeride") return "bike";
  if (s === "swim") return "swim";
  return "cross_train";
}

function speedToPace(mps: number): string | null {
  if (mps <= 0) return null;
  const secPerKm = 1000 / mps;
  const mins = Math.floor(secPerKm / 60);
  const secs = Math.round(secPerKm % 60);
  return `${mins}:${String(secs).padStart(2, "0")}/km`;
}

function toDateStr(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}

function toActualStats(activity: StravaActivity) {
  return {
    actualDistanceKm: Number((activity.distance / 1000).toFixed(2)),
    actualDurationMin: Number((activity.moving_time / 60).toFixed(1)),
    actualPace: speedToPace(activity.average_speed),
    avgHeartRate: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
  };
}

function buildStravaEntryId(activityId: string | number): string {
  return `strava-${activityId}`;
}

async function getFreshToken(token: Schema["StravaToken"]["type"]): Promise<string> {
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

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${await res.text()}`);
  }

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

async function fetchActivities(accessToken: string, afterTimestamp: number): Promise<StravaActivity[]> {
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

async function fetchSingleActivity(accessToken: string, activityId: string): Promise<StravaActivity> {
  const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Strava individual activity fetch failed: ${await res.text()}`);
  }

  return res.json() as Promise<StravaActivity>;
}

async function findTokenByStravaAthleteId(stravaAthleteId: string) {
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

async function findWorkoutByStravaActivityId(stravaActivityId: string) {
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

async function listWorkoutsOnDate(athleteEmail: string, dateStr: string) {
  const { data, errors } = await client.models.Workout.list({
    filter: {
      athleteEmail: { eq: athleteEmail },
      date: { eq: dateStr },
    },
  });

  if (errors) {
    console.error("Error listing workouts on date:", errors);
    return [];
  }

  return data;
}

async function getAthleteName(athleteEmail: string): Promise<string | undefined> {
  const { data, errors } = await client.models.Profile.get({ email: athleteEmail });
  if (errors) {
    console.error(`Error loading profile for ${athleteEmail}:`, errors);
    return undefined;
  }
  return data?.name ?? undefined;
}

async function applyActivityToWorkout(entryId: string, athleteEmail: string, activity: StravaActivity) {
  const date = toDateStr(activity.start_date);
  const stats = toActualStats(activity);

  const { errors } = await client.models.Workout.update({
    entryId,
    athleteEmail,
    date,
    completed: true,
    stravaActivityId: String(activity.id),
    ...stats,
  });

  if (errors) {
    console.error(`Failed to update workout ${entryId} for ${athleteEmail}:`, errors);
  } else {
    console.log(`Updated workout ${entryId} for ${athleteEmail} with Strava activity ${activity.id}.`);
  }
}

async function createWorkoutFromActivity(athleteEmail: string, activity: StravaActivity) {
  const date = toDateStr(activity.start_date);
  const stats = toActualStats(activity);
  const athleteName = await getAthleteName(athleteEmail);

  const { errors } = await client.models.Workout.create({
    entryId: buildStravaEntryId(activity.id),
    athleteEmail,
    athleteName,
    date,
    type: sportToType(activity.sport_type),
    title: activity.name || `${activity.sport_type} from Strava`,
    description: "Synced automatically from Strava.",
    completed: true,
    source: "strava",
    distanceKm: stats.actualDistanceKm,
    durationMin: stats.actualDurationMin,
    ...stats,
    stravaActivityId: String(activity.id),
  });

  if (errors) {
    console.error(`Failed to create Strava workout for ${athleteEmail} / ${activity.id}:`, errors);
  } else {
    console.log(`Created standalone Strava workout ${activity.id} for ${athleteEmail}.`);
  }
}

async function resetWorkout(entryId: string, athleteEmail: string, date: string) {
  const { errors } = await client.models.Workout.update({
    entryId,
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
    console.error(`Failed to clear workout ${entryId} for ${athleteEmail}:`, errors);
  } else {
    console.log(`Reset planned workout ${entryId} for ${athleteEmail}.`);
  }
}

async function deleteWorkout(entryId: string) {
  const { errors } = await client.models.Workout.delete({ entryId });
  if (errors) {
    console.error(`Failed to delete Strava workout ${entryId}:`, errors);
  } else {
    console.log(`Deleted Strava workout ${entryId}.`);
  }
}

async function syncActivityForAthlete(athleteEmail: string, activity: StravaActivity) {
  const sportLower = activity.sport_type.toLowerCase();
  if (!["run", "ride", "swim", "trailrun", "virtualride", "ebikeride"].includes(sportLower)) {
    console.log(`Activity ${activity.id} profile type (${activity.sport_type}) isn't synchronized. Skipping.`);
    return;
  }

  const existingByActivity = await findWorkoutByStravaActivityId(String(activity.id));
  if (existingByActivity) {
    await applyActivityToWorkout(existingByActivity.entryId, existingByActivity.athleteEmail, activity);
    return;
  }

  const dateStr = toDateStr(activity.start_date);
  const sameDayWorkouts = await listWorkoutsOnDate(athleteEmail, dateStr);
  const unsyncedPlanned = sameDayWorkouts.find(
    (workout) => workout.source !== "strava" && !workout.stravaActivityId
  );

  if (unsyncedPlanned) {
    await applyActivityToWorkout(unsyncedPlanned.entryId, unsyncedPlanned.athleteEmail, activity);
    return;
  }

  await createWorkoutFromActivity(athleteEmail, activity);
}

export const handler = async (event: SQSEvent) => {
  if (!client) {
    const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env as any);
    Amplify.configure(resourceConfig, libraryOptions);
    client = generateClient<Schema>({ authMode: "iam" });
  }

  console.log(`Strava pipeline processing started. Received ${event.Records.length} records.`);

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);

      if (body.object_type === "activity" && body.aspect_type === "fallback_sync_all") {
        console.log("[Pipeline Trigger] Executing scheduled backup fallback sweep.");
        await runFallbackSweep();
        continue;
      }

      if (body.object_type === "activity" && body.aspect_type === "delete") {
        const activityId = String(body.object_id);
        console.log(`[Pipeline Trigger] Real-time activity deletion detected. Activity: ${activityId}`);

        const workout = await findWorkoutByStravaActivityId(activityId);
        if (!workout) {
          console.log(`No local synchronized workout found for Strava Activity ID: ${activityId}.`);
          continue;
        }

        if (workout.source === "strava") {
          await deleteWorkout(workout.entryId);
        } else {
          await resetWorkout(workout.entryId, workout.athleteEmail, workout.date);
        }
        continue;
      }

      if (body.object_type === "activity" && body.aspect_type === "create") {
        const stravaAthleteId = String(body.owner_id);
        const activityId = String(body.object_id);
        console.log(
          `[Pipeline Trigger] Real-time activity upload detected. Activity: ${activityId}, Athlete: ${stravaAthleteId}`
        );

        const token = await findTokenByStravaAthleteId(stravaAthleteId);
        if (!token) {
          console.warn(
            `[Warning] Activity received but no local Athlete context exists for Strava Athlete ID: ${stravaAthleteId}.`
          );
          continue;
        }

        const accessToken = await getFreshToken(token);
        const activity = await fetchSingleActivity(accessToken, activityId);
        await syncActivityForAthlete(token.athleteEmail, activity);
        continue;
      }

      console.log("[Notice] Received unknown SQS message signature payload. Skipping evaluation.");
    } catch (err) {
      console.error(`Execution pipeline error handling SQS record ID ${record.messageId}:`, err);
      throw err;
    }
  }

  console.log("Strava pipeline block finalized cleanly.");
};

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

      for (const activity of activities) {
        await syncActivityForAthlete(token.athleteEmail, activity);
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
