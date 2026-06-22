import { defineBackend } from "@aws-amplify/backend";
import { Duration, Stack } from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { FunctionUrlAuthType } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { stravaCallback } from "./functions/strava-callback/resource";
import { stravaSync } from "./functions/strava-sync/resource";
import { stravaWebhook } from "./functions/strava-webhook/resource";

const backend = defineBackend({
  auth,
  data,
  stravaCallback,
  stravaSync,
  stravaWebhook,
});

// ─── 1. Setup Amazon SQS Queue Infrastructure ────────────────────────────────
const syncLambda = backend.stravaSync.resources.lambda;
const syncStack = Stack.of(syncLambda);

// FIX: Increased visibilityTimeout to 30 minutes (1800s) to be 6x the 5-minute (300s) Lambda timeout.
const queue = new sqs.Queue(syncStack, "StravaWebhookQueue", {
  visibilityTimeout: Duration.seconds(1800), 
});

// ─── 2. Connect Webhook Function to Queue ───────────────────────────────────
const webhookLambda = backend.stravaWebhook.resources.lambda;
queue.grantSendMessages(webhookLambda);
backend.stravaWebhook.addEnvironment("SQS_QUEUE_URL", queue.queueUrl);

// Expose public HTTPS endpoint for Strava to send webhook payloads to
const url = webhookLambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});

// Prints your URL during deployment logs
backend.addOutput({
  custom: {
    stravaWebhookUrl: url.url,
  },
});

// ─── 3. Connect SQS Queue to Ingestion Worker (stravaSync) ──────────────────
syncLambda.addEventSource(
  new SqsEventSource(queue, {
    batchSize: 1, // Processes runs 1-by-1 to isolate DB locks & avoid rate spikes
  })
);

// ─── 4. Give Lambdas DynamoDB Table Access ───────────────────────────────────
const workoutTable = backend.data.resources.tables["Workout"];
const tokenTable = backend.data.resources.tables["StravaToken"];

// strava-callback database wiring
tokenTable.grantReadWriteData(backend.stravaCallback.resources.lambda);
backend.stravaCallback.addEnvironment("STRAVA_TOKEN_TABLE", tokenTable.tableName);

// strava-sync database wiring
tokenTable.grantReadWriteData(backend.stravaSync.resources.lambda);
workoutTable.grantReadWriteData(backend.stravaSync.resources.lambda);
backend.stravaSync.addEnvironment("STRAVA_TOKEN_TABLE", tokenTable.tableName);
backend.stravaSync.addEnvironment("WORKOUT_TABLE", workoutTable.tableName);

// ─── 5. EventBridge Fallback Sweep (Every 6 Hours) ───────────────────────────
const rule = new events.Rule(syncStack, "StravaSyncSchedule", {
  schedule: events.Schedule.rate(Duration.hours(6)),
  description: "Trigger backup fallback full sync for all athletes via SQS",
});

rule.addTarget(
  new targets.SqsQueue(queue, {
    message: events.RuleTargetInput.fromObject({
      object_type: "activity",
      aspect_type: "fallback_sync_all",
    }),
  })
);