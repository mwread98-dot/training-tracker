import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

/**
 * Data model.
 *
 * Profile  - one row per athlete, created by the coach, used to populate
 *            the athlete picker in the coach dashboard.
 * Workout  - one row per planned session. Linked to an athlete by email
 *            (not Cognito sub) because the coach already knows athletes'
 *            emails, and email is a verified, stable claim in the login
 *            token - no extra lookup table needed.
 *
 * Authorization:
 * - Coaches group: full read/write on everything.
 * - Athletes: can read + update only the Workout rows where athleteEmail
 *   matches their own login email (ownerDefinedIn). This keeps each
 *   athlete's notes/training private from other athletes.
 *
 * NOTE: `identityClaim: "email"` tells Amplify to compare athleteEmail
 * against the email claim in the signed-in user's token rather than the
 * default Cognito sub. If your installed Amplify backend version errors
 * on this option, check the current syntax at
 * https://docs.amplify.aws/react/build-a-backend/data/customize-authz/per-user-per-owner-data-access/
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
    })
    .authorization((allow) => [
      allow.group("Coaches"),
      allow
        .ownerDefinedIn("athleteEmail")
		.identityClaim("email")
        .to(["read", "update"]),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
