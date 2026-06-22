import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { SQSEvent } from "aws-lambda"; // ◄ Added SQS typing resource

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const CLIENT_ID = process.env.STRAVA_CLIENT_ID!;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET!;
const TOKEN_TABLE = process.env.STRAVA_TOKEN_TABLE!;
const WORKOUT_TABLE = process.env.WORKOUT_TABLE!;

// ─── Strava types ────────────────────────────────────────────────────────────

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

type StravaTokenRecord = {
  athleteEmail: string;
  stravaAthleteId?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  lastSyncAt?: string;
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
async function getFreshToken(token: StravaTokenRecord): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  // Refresh 5 minutes before expiry
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

  // Update stored token
  await dynamo.send(
    new PutCommand({
      TableName: TOKEN_TABLE,
      Item: {
        ...token,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at,
        updatedAt: new Date().toISOString(),
      },
    })
  );

  return data.access_token;
}

/** Fetch recent activities from Strava for one athlete (Used by Backup Fallback Sweep) */
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

/** Fetch a distinct individual activity explicitly (Used by Real-Time Webhook) */
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
async function findTokenByStravaAthleteId(
  stravaAthleteId: string
): Promise<StravaTokenRecord | null> {
  const result = await dynamo.send(
    new ScanCommand({
      TableName: TOKEN_TABLE,
      FilterExpression: "stravaAthleteId = :id",
      ExpressionAttributeValues: { ":id": String(stravaAthleteId) },
    })
  );
  return (result.Items?.[0] as StravaTokenRecord) ?? null;
}

/** Find a Workout for this athlete on this date that hasn't been synced yet */
async function findMatchingWorkout(
  athleteEmail: string,
  dateStr: string
): Promise<{ id: string; stravaActivityId?: string } | null> {
  const result = await dynamo.send(
    new ScanCommand({
      TableName: WORKOUT_TABLE,
      FilterExpression:
        "athleteEmail = :email AND #date = :date AND attribute_not_exists(stravaActivityId)",
      ExpressionAttributeNames: { "#date": "date" },
      ExpressionAttributeValues: {
        ":email": athleteEmail,
        ":date": dateStr,
      },
    })
  );

  const items = result.Items ?? [];
  if (items.length === 0) return null;
  return (items[0] as { id: string; stravaActivityId?: string }) ?? null;
}

/** Write actual stats from Strava back to the Workout row */
async function updateWorkout(
  workoutId: string,
  activity: StravaActivity
): Promise<void> {
  const distanceKm = activity.distance / 1000;
  const durationMin = activity.moving_time / 60;
  const pace =
    activity.average_speed > 0 ? speedToPace(activity.average_speed) : undefined;
  const heartRate = activity.average_heartrate
    ? Math.round(activity.average_heartrate)
    : undefined;

  await dynamo.send(
    new UpdateCommand({
      TableName: WORKOUT_TABLE,
      Key: { id: workoutId },
      UpdateExpression: `
        SET actualDistanceKm = :dist,
            actualDurationMin = :dur,
            actualPace = :pace,
            avgHeartRate = :hr,
            stravaActivityId = :sid,
            completed = :done,
            updatedAt = :ts
      `,
      ExpressionAttributeValues: {
        ":dist": parseFloat(distanceKm.toFixed(2)),
        ":dur": parseFloat(durationMin.toFixed(1)),
        ":pace": pace ?? null,
        ":hr": heartRate ?? null,
        ":sid": String(activity.id),
        ":done": true,
        ":ts": new Date().toISOString(),
      },
    })
  );

  console.log(`Updated workout ${workoutId} with Strava activity ${activity.id}`);
}

// ─── Main Pipeline Handler ───────────────────────────────────────────────────

export const handler = async (event: SQSEvent) => {
  console.log(`Strava pipeline processing started. Received ${event.Records.length} records.`);

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);

      // ───────────────────────────────────────────────────────────────────────
      // BRANCH A: BACKUP FALLBACK SWEEP (Every 6 Hours via EventBridge)
      // ───────────────────────────────────────────────────────────────────────
      if (body.object_type === "activity" && body.aspect_type === "fallback_sync_all") {
        console.log("[Pipeline Trigger] Executing scheduled backup fallback sweep.");
        await runFallbackSweep();
        continue;
      }

      // ───────────────────────────────────────────────────────────────────────
      // BRANCH B: NEAR REAL-TIME WEBHOOK ENGINE (Immediate Strava Actions)
      // ───────────────────────────────────────────────────────────────────────
      if (body.object_type === "activity" && body.aspect_type === "create") {
        const stravaAthleteId = String(body.owner_id);
        const activityId = String(body.object_id);

        console.log(`[Pipeline Trigger] Real-time activity upload detected. Activity: ${activityId}, Athlete: ${stravaAthleteId}`);

        // 1. Identify user mapping context
        const token = await findTokenByStravaAthleteId(stravaAthleteId);
        if (!token) {
          console.warn(`[Warning] Activity received but no local Athlete context exists for Strava Athlete ID: ${stravaAthleteId}.`);
          continue;
        }

        // 2. Fetch specific single activity context directly
        const accessToken = await getFreshToken(token);
        const activity = await fetchSingleActivity(accessToken, activityId);

        // 3. Confirm target activity sports profile type is tracked
        const sportLower = activity.sport_type.toLowerCase();
        if (!["run", "ride", "swim", "trailrun", "virtualride"].includes(sportLower)) {
          console.log(`Activity ${activityId} profile type (${activity.sport_type}) isn't synchronized. Skipping.`);
          continue;
        }

        // 4. Map and write updates to the database calendar entry
        const dateStr = toDateStr(activity.start_date);
        const workout = await findMatchingWorkout(token.athleteEmail, dateStr);

        if (!workout) {
          console.log(`No matching scheduled template found for ${token.athleteEmail} on date ${dateStr}.`);
          continue;
        }

        await updateWorkout(workout.id, activity);
        continue;
      }

      console.log(`[Notice] Received unknown SQS message signature payload. Skipping evaluation.`);

    } catch (err) {
      console.error(`Execution pipeline error handling SQS record ID ${record.messageId}:`, err);
      
      // Crucial: Throwing re-queues the message item to process again later 
      // protecting against connection timeouts, API spikes, or transient platform problems.
      throw err; 
    }
  }

  console.log("Strava pipeline block finalized cleanly.");
};

// ─── Fallback Sweep Routine ──────────────────────────────────────────────────

async function runFallbackSweep(): Promise<void> {
  const tokensResult = await dynamo.send(new ScanCommand({ TableName: TOKEN_TABLE }));
  const tokens = (tokensResult.Items ?? []) as StravaTokenRecord[];

  if (tokens.length === 0) {
    console.log("Sweep concluded early: No Strava tokens are registered yet.");
    return;
  }

  for (const token of tokens) {
    try {
      console.log(`Sweep auditing athlete profile: ${token.athleteEmail}`);

      const afterTimestamp = token.lastSyncAt
        ? Math.floor(new Date(token.lastSyncAt).getTime() / 1000) - 3600 // 1 hour safety net
        : Math.floor(Date.now() / 1000) - 30 * 24 * 3600; // 30 day history lookup

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
        await updateWorkout(workout.id, activity);
      }

      // Record final verification marker
      await dynamo.send(
        new PutCommand({
          TableName: TOKEN_TABLE,
          Item: {
            ...token,
            lastSyncAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        })
      );
    } catch (err) {
      console.error(`Sweep sequence failed internally on athlete context: ${token.athleteEmail}:`, err);
    }
  }
}