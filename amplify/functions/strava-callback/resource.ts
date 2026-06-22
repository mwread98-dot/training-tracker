import { defineFunction, secret } from "@aws-amplify/backend";

/**
 * Lambda that handles the Strava OAuth code exchange.
 * Called via AppSync mutation after the athlete authorises in Strava.
 * Needs the Strava app credentials (set via `npx ampx secret set ...`).
 */
export const stravaCallback = defineFunction({
  name: "stravaCallback",
  resourceGroupName: "data", // ◄ Add this line to fix the circular dependency
  environment: {
    STRAVA_CLIENT_ID: secret("STRAVA_CLIENT_ID"),
    STRAVA_CLIENT_SECRET: secret("STRAVA_CLIENT_SECRET"),
  },
  timeoutSeconds: 30,
});
