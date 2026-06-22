import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { stravaCallback } from "../functions/strava-callback/resource";
// 1. Import your sync function resource definition
import { stravaSync } from "../functions/strava-sync/resource";

/**
 * Data model.
 *
 * Profile     - one row per athlete.
 * Workout     - one planned session. Actual stats (from Strava) are written
 * back here by the strava-sync Lambda once an activity is found
 * that matches the athlete + date.
 * StravaToken - one row per athlete who has connected Strava. Stores OAuth
 * tokens. Written by strava-callback Lambda (IAM), readable by
 * the athlete (to check connection status) and by coaches.
 *
 * exchangeStravaCode - custom AppSync mutation backed by the strava-callback
 * Lambda. Athletes call this after the Strava OAuth redirect
 * to exchange the one-time code for stored tokens.
 */
const schema = a.schema({
  Profile: a
    .model({
      email: a.string().required(),
      name: a.string().required(),
      notes: a.string(),
    })
    .identifier(["email"])
    .authorization((allow) => [
      allow.group("Coaches"),
      allow.authenticated().to(["read"]),
    ]),

  Workout: a
    .model({
      athleteEmail: a.string().required(),
      athleteName: a.string(),
      date: a.date().required(),
      type: a.enum([
        "run", "bike", "swim", "strength", "cross_train", "rest", "race",
      ]),
      intensity: a.enum(["easy", "moderate", "hard", "race_pace"]),
      title: a.string().required(),
      description: a.string(),
      distanceKm: a.float(),
      durationMin: a.float(),
      targetPace: a.string(),
      coachNotes: a.string(),
      athleteNotes: a.string(),
      completed: a.boolean().default(false),
      // --- Actual stats synced from Strava ---
      actualDistanceKm: a.float(),
      actualDurationMin: a.float(),
      actualPace: a.string(),       // formatted e.g. "5:12/km"
      avgHeartRate: a.integer(),
      stravaActivityId: a.string(), // used to avoid duplicate updates
    })
    .authorization((allow) => [
      allow.group("Coaches"),
      allow
        .ownerDefinedIn("athleteEmail")
        .identityClaim("email")
        .to(["read", "update"]),
      // 2. Grant the stravaSync Lambda server-side rights to read and modify Workouts via GraphQL
      allow.resource(stravaSync).to(["read", "update"]),
    ]),

  StravaToken: a
    .model({
      athleteEmail: a.string().required(),
      stravaAthleteId: a.string(),
      accessToken: a.string().required(),
      refreshToken: a.string().required(),
      expiresAt: a.integer().required(), // Unix timestamp seconds
      lastSyncAt: a.string(),            // ISO timestamp of last successful sync
    })
    .identifier(["athleteEmail"])
    .authorization((allow) => [
      allow.group("Coaches").to(["read"]),
      allow
        .ownerDefinedIn("athleteEmail")
        .identityClaim("email")
        .to(["read", "delete"]),
    ]),

  // Custom mutation: athlete passes the Strava OAuth code + their email.
  // The Lambda exchanges it for tokens and stores them.
  exchangeStravaCode: a
    .mutation()
    .arguments({
      code: a.string().required(),
      athleteEmail: a.string().required(),
    })
    .returns(a.customType({ success: a.boolean(), message: a.string() }))
    .authorization((allow) => [allow.group("Athletes")])
    .handler(a.handler.function(stravaCallback)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});