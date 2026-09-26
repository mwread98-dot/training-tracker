import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import type { Schema } from "../../data/resource";
import { listAllPages } from "../strava-sync/listAllPages";
import { buildCalendar } from "./ics";

const env = process.env;
let client: ReturnType<typeof generateClient<Schema>>;

type Workout = Schema["Workout"]["type"];
type CalendarFeed = Schema["CalendarFeed"]["type"];

// Past workouts stay visible for a while so the athlete can look back, without
// the feed growing forever.
const LOOKBACK_DAYS = 56;

// Tokens are 32 random bytes, base64url-encoded (43 chars). Reject anything
// that couldn't be one before touching the database.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

function notFound(): APIGatewayProxyResultV2 {
  return { statusCode: 404, headers: { "Content-Type": "text/plain" }, body: "Not Found" };
}

function tokenFromPath(rawPath: string): string | null {
  const match = rawPath.match(/^\/([^/]+?)(?:\.ics)?$/);
  if (!match || !TOKEN_PATTERN.test(match[1])) return null;
  return match[1];
}

function lookbackStartDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - LOOKBACK_DAYS);
  return d.toISOString().slice(0, 10);
}

async function findFeed(token: string): Promise<CalendarFeed | null> {
  const { data, errors } = await client.models.CalendarFeed.calendarFeedByToken({ token });
  if (errors?.length) {
    throw new Error(`Calendar feed lookup failed: ${JSON.stringify(errors)}`);
  }
  return data[0] ?? null;
}

async function loadPlannedWorkouts(athleteEmail: string): Promise<Workout[]> {
  const { data, errors } = await listAllPages<Workout>((options) =>
    client.models.Workout.workoutsByAthlete(
      { athleteEmail, date: { ge: lookbackStartDate() } },
      options
    )
  );
  if (errors?.length) {
    throw new Error(`Workout query failed: ${JSON.stringify(errors)}`);
  }
  // Planned sessions only: activities the Strava sync created on its own are a
  // record of what happened, not part of the plan. Rest days would just be clutter.
  return data.filter((w) => w.source !== "strava" && w.type !== "rest");
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext.http.method;
  if (method !== "GET" && method !== "HEAD") {
    return { statusCode: 405, headers: { Allow: "GET, HEAD" }, body: "Method Not Allowed" };
  }

  const token = tokenFromPath(event.rawPath);
  if (!token) return notFound();

  if (!client) {
    const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env as any);
    Amplify.configure(resourceConfig, libraryOptions);
    client = generateClient<Schema>({ authMode: "iam" });
  }

  try {
    const feed = await findFeed(token);
    if (!feed) return notFound();

    const workouts = await loadPlannedWorkouts(feed.athleteEmail);
    const body = buildCalendar(workouts, "Training Plan");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="training-plan.ics"',
        // The URL is a secret, so keep shared caches out of it.
        "Cache-Control": "private, max-age=900",
      },
      body: method === "HEAD" ? "" : body,
    };
  } catch (err) {
    console.error("Failed to build calendar feed:", err);
    return { statusCode: 500, headers: { "Content-Type": "text/plain" }, body: "Internal Error" };
  }
};
