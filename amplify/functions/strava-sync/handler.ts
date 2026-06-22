import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  UpdateCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

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

/** Find a Workout for this athlete on this date that hasn't been synced yet */
async function findMatchingWorkout(
  athleteEmail: string,
  dateStr: string
): Promise<{ id: string; stravaActivityId?: string } | null> {
  // DynamoDB scan with filter — acceptable at this scale (<10 athletes,
  // <a few hundred workouts per table). A GSI on athleteEmail+date would
  // be the production optimisation when the dataset grows.
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

  // If there are multiple workouts on the same day (e.g. AM/PM), pick the
  // first one that matches the rough sport type (run, bike, swim). Fall back
  // to the first one if nothing matches.
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

  const update = await dynamo.send(
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

// ─── Main handler ─────────────────────────────────────────────────────────────

export const handler = async () => {
  console.log("Strava sync started");

  // Load all athlete Strava tokens
  const tokensResult = await dynamo.send(
    new ScanCommand({ TableName: TOKEN_TABLE })
  );
  const tokens = (tokensResult.Items ?? []) as StravaTokenRecord[];

  if (tokens.length === 0) {
    console.log("No Strava tokens found — nothing to sync");
    return;
  }

  for (const token of tokens) {
    try {
      console.log(`Syncing ${token.athleteEmail}`);

      // Determine how far back to look. First sync: 30 days. Subsequent: since last sync.
      const afterTimestamp = token.lastSyncAt
        ? Math.floor(new Date(token.lastSyncAt).getTime() / 1000) - 3600 // 1h buffer
        : Math.floor(Date.now() / 1000) - 30 * 24 * 3600; // 30 days

      const accessToken = await getFreshToken(token);
      const activities = await fetchActivities(accessToken, afterTimestamp);

      console.log(
        `  Found ${activities.length} activities for ${token.athleteEmail}`
      );

      // Only process running, cycling, and swimming activities
      const relevant = activities.filter((a) =>
        ["run", "ride", "swim", "trailrun", "virtualride"].includes(
          a.sport_type.toLowerCase()
        )
      );

      for (const activity of relevant) {
        const dateStr = toDateStr(activity.start_date);
        const workout = await findMatchingWorkout(token.athleteEmail, dateStr);

        if (!workout) {
          console.log(
            `  No unsynced workout found for ${token.athleteEmail} on ${dateStr}`
          );
          continue;
        }

        await updateWorkout(workout.id, activity);
      }

      // Record the sync time
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
      // Don't let one athlete's failure block the others
      console.error(`Error syncing ${token.athleteEmail}:`, err);
    }
  }

  console.log("Strava sync complete");
};
