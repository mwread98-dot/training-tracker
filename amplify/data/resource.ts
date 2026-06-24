import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { stravaCallback } from "../functions/strava-callback/resource";
import { stravaSync } from "../functions/strava-sync/resource";

const schema = a
  .schema({
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
        entryId: a.string().required(),
        athleteEmail: a.string().required(),
        athleteName: a.string(),
        date: a.date().required(),
        type: a.enum([
          "run",
          "bike",
          "swim",
          "strength",
          "cross_train",
          "rest",
          "race",
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
        source: a.string(),
        actualDistanceKm: a.float(),
        actualDurationMin: a.float(),
        actualElapsedDurationMin: a.float(),
        actualPace: a.string(),
        avgHeartRate: a.integer(),
        stravaActivityId: a.string(),
        stravaTitle: a.string(),
        stravaDescription: a.string(),
      })
      .identifier(["entryId"])
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
  .authorization((allow) => [allow.resource(stravaSync).to(["query", "mutate"])]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
});
