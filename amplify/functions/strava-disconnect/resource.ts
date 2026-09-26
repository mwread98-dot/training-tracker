import { defineFunction, secret } from "@aws-amplify/backend";

/**
 * Lambda behind the disconnectStrava mutation. Revokes the app's access on
 * Strava, then deletes the athlete's stored tokens, which stops syncing.
 * Needs the Strava app credentials (set via `npx ampx secret set ...`).
 */
export const stravaDisconnect = defineFunction({
  name: "stravaDisconnect",
  resourceGroupName: "data", // Keep it in the data stack to avoid circular loops
  environment: {
    STRAVA_CLIENT_ID: secret("STRAVA_CLIENT_ID"),
    STRAVA_CLIENT_SECRET: secret("STRAVA_CLIENT_SECRET"),
  },
  timeoutSeconds: 30,
});
