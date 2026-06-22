import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { stravaCallback } from "../functions/strava-callback/resource";
// 1. Import your stravaSync function resource
import { stravaSync } from "../functions/strava-sync/resource"; 

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
      intensity: a.enum(["easy", "moderate", "hard", "all_out"]),
      title: a.string().required(),
      description: a.string(),
      distanceKm: a.float(),
      durationMin: a.float(),
      targetPace: a.string(),
      coachNotes: a.string(),
      athleteNotes: a.string(),
      completed: a.boolean().default(false),
      
      // Actual stats populated from Strava background sync
      actualDistanceKm: a.float(),
      actualDurationMin: a.float(),
      actualPace: a.string(),
      avgHeartRate: a.integer(),
      stravaActivityId: a.string(), 
    })
    .identifier(["athleteEmail", "date"])
    .authorization((allow) => [
      allow.group("Coaches"),
      allow
        .ownerDefinedIn("athleteEmail")
        .identityClaim("email")
        .to(["read", "update"]),
    ]),

  StravaToken: a
    .model({
      athleteEmail: a.string().required(),
      stravaAthleteId: a.string(),
      accessToken: a.string().required(),
      refreshToken: a.string().required(),
      expiresAt: a.integer().required(), 
      lastSyncAt: a.string(),            
    })
    .identifier(["athleteEmail"])
    .authorization((allow) => [
      allow.group("Coaches").to(["read"]),
      allow
        .ownerDefinedIn("athleteEmail")
        .identityClaim("email")
        .to(["read", "delete"]),
    ]),

  exchangeStravaCode: a
    .mutation()
    .arguments({
      code: a.string().required(),
      athleteEmail: a.string().required(),
    })
    .returns(a.customType({ success: a.boolean(), message: a.string() }))
    .authorization((allow) => [allow.group("Athletes")])
    .handler(a.handler.function(stravaCallback)),
})
// ─── GRANT FUNCTION ACCESS AT THE SCHEMA LEVEL ───
.authorization((allow) => [
  // "query" grants read access; "mutate" grants create/update/delete access via AppSync
  allow.resource(stravaSync).to(["query", "mutate"]),
]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
});