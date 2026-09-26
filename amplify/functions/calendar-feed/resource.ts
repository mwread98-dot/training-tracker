import { defineFunction } from "@aws-amplify/backend";

/**
 * Public HTTPS endpoint (Lambda Function URL, configured in backend.ts) that
 * serves an athlete's planned workouts as an iCalendar feed. Phone calendar
 * apps subscribe to /<token>.ics and re-fetch it on their own schedule.
 */
export const calendarFeed = defineFunction({
  name: "calendarFeed",
  entry: "./handler.ts",
  resourceGroupName: "data", // Keep it in the data stack to avoid circular loops
  timeoutSeconds: 15,
});
