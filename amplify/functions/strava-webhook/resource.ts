import { defineFunction } from "@aws-amplify/backend";

export const stravaWebhook = defineFunction({
  name: "stravaWebhook",
  entry: "./handler.ts",
  resourceGroupName: "data", // Keep it in the data stack to avoid circular loops
});