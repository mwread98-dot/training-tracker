import { defineBackend } from "@aws-amplify/backend";
import { Duration, Stack } from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { stravaCallback } from "./functions/strava-callback/resource";
import { stravaSync } from "./functions/strava-sync/resource";

const backend = defineBackend({
  auth,
  data,
  stravaCallback,
  stravaSync,
});

// ─── Give both Lambdas DynamoDB access ───────────────────────────────────────
// The table names aren't known at code-time, so we grab them from the deployed
// backend and pass them as environment variables. This means the Lambdas can
// use the AWS SDK directly without going through AppSync.

const workoutTable = backend.data.resources.tables["Workout"];
const tokenTable = backend.data.resources.tables["StravaToken"];

// strava-callback: needs to write StravaToken rows after a successful OAuth exchange
tokenTable.grantReadWriteData(backend.stravaCallback.resources.lambda);
backend.stravaCallback.addEnvironment(
  "STRAVA_TOKEN_TABLE",
  tokenTable.tableName
);

// strava-sync: needs to read all tokens and write actual stats back to Workouts
tokenTable.grantReadWriteData(backend.stravaSync.resources.lambda);
workoutTable.grantReadWriteData(backend.stravaSync.resources.lambda);
backend.stravaSync.addEnvironment(
  "STRAVA_TOKEN_TABLE",
  tokenTable.tableName
);
backend.stravaSync.addEnvironment(
  "WORKOUT_TABLE",
  workoutTable.tableName
);

// ─── Schedule the sync Lambda every 6 hours via EventBridge ──────────────────
const stack = Stack.of(backend.stravaSync.resources.lambda);

const rule = new events.Rule(stack, "StravaSyncSchedule", {
  schedule: events.Schedule.rate(Duration.hours(6)),
  description: "Trigger Strava activity sync for all connected athletes",
});

rule.addTarget(
  new targets.LambdaFunction(backend.stravaSync.resources.lambda)
);
