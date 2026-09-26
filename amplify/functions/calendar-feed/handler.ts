import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import type { Schema } from "../../data/resource";
import { listAllPages } from "../strava-sync/listAllPages";
import { buildCalendar } from "./ics";

const env = process.env;
let client: ReturnType<typeof generateClient<Schema>>;

// Direct table access for the one write this public endpoint makes, rather
// than giving it mutate rights across the whole data API.
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type Workout = Schema["Workout"]["type"];
type CalendarFeed = Schema["CalendarFeed"]["type"];

// Past workouts stay visible for a while so the athlete can look back, without
// the feed growing forever.
const LOOKBACK_DAYS = 56;

// Tokens are 32 random bytes, base64url-encoded (43 chars). Reject anything
// that couldn't be one before touching the database.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

// Calendar apps poll every few minutes to hours; the athlete page only needs
// to know a calendar is using the feed, so hourly stamps are plenty.
const FETCH_STAMP_INTERVAL_MS = 60 * 60 * 1000;

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

// Stamps lastFetchedAt, which is how the athlete page knows a calendar app is
// subscribed. Bookkeeping only: a failure here must never fail the feed.
async function recordFetch(feed: CalendarFeed): Promise<void> {
  const last = feed.lastFetchedAt ? Date.parse(feed.lastFetchedAt) : 0;
  if (Date.now() - last < FETCH_STAMP_INTERVAL_MS) return;

  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: env.CALENDAR_FEED_TABLE!,
        Key: { athleteEmail: feed.athleteEmail },
        UpdateExpression: "SET lastFetchedAt = :now",
        // Skip it if the athlete reset their link while this request was in
        // flight, so the new link isn't marked as in use by the old one's fetch.
        ConditionExpression: "#token = :token",
        ExpressionAttributeNames: { "#token": "token" },
        ExpressionAttributeValues: { ":now": new Date().toISOString(), ":token": feed.token },
      })
    );
  } catch (err) {
    console.warn("Could not record calendar feed fetch:", err);
  }
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

    const [workouts] = await Promise.all([loadPlannedWorkouts(feed.athleteEmail), recordFetch(feed)]);
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
