import { defineFunction, secret } from "@aws-amplify/backend";

/**
 * Scheduled Lambda that syncs recent Strava activities back to planned
 * Workout rows. Triggered every 6 hours via EventBridge (configured in
 * backend.ts). Reads all StravaTokens, refreshes expired ones, fetches
 * activities from Strava, matches by date and athleteEmail, writes
 * actual stats (distance, duration, pace, heart rate) back to Workout.
 */
export const stravaSync = defineFunction({
  name: "stravaSync",
  environment: {
    STRAVA_CLIENT_ID: secret("STRAVA_CLIENT_ID"),
    STRAVA_CLIENT_SECRET: secret("STRAVA_CLIENT_SECRET"),
  },
  timeoutSeconds: 300, // allow time for multiple athletes
});
