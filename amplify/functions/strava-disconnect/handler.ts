import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// AppSync resolver event shape for a custom mutation
type Event = {
  identity?: {
    claims?: Record<string, unknown>;
  };
};

const FAILURE_MESSAGE = "Couldn't disconnect Strava. Please try again.";

// Strava documents a 503 as safe to retry; anything else will fail the same way again.
const REVOKE_ATTEMPTS = 2;

// Revoking the refresh token also revokes its access tokens, which ends the
// app's access to the athlete's Strava data. Strava answers 200 even when the
// token is already gone, e.g. the athlete removed the app on Strava's side.
async function revokeStravaAccess(refreshToken: string): Promise<boolean> {
  const credentials = Buffer.from(
    `${process.env.STRAVA_CLIENT_ID}:${process.env.STRAVA_CLIENT_SECRET}`
  ).toString("base64");

  for (let attempt = 1; attempt <= REVOKE_ATTEMPTS; attempt++) {
    const res = await fetch("https://www.strava.com/oauth/revoke", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token" }).toString(),
    });
    if (res.ok) return true;
    console.error(`Strava revoke failed (attempt ${attempt}): ${res.status} ${await res.text()}`);
    if (res.status !== 503) break;
  }
  return false;
}

export const handler = async (event: Event) => {
  // Disconnect whoever is signed in; never an account named in the request.
  const identityEmail = event.identity?.claims?.email;
  const athleteEmail =
    typeof identityEmail === "string" ? identityEmail.trim().toLowerCase() : "";
  if (!athleteEmail) {
    return { success: false, message: FAILURE_MESSAGE };
  }

  const tableName = process.env.STRAVA_TOKEN_TABLE!;

  try {
    const { Item } = await dynamo.send(
      new GetCommand({ TableName: tableName, Key: { athleteEmail } })
    );
    if (!Item) {
      return { success: true, message: "Strava disconnected" };
    }

    // Keep the stored tokens unless Strava confirms the revoke, so a failed
    // attempt can be retried rather than leaving the app authorised on Strava
    // with no way to reach it.
    if (!(await revokeStravaAccess(Item.refreshToken as string))) {
      return { success: false, message: FAILURE_MESSAGE };
    }

    await dynamo.send(new DeleteCommand({ TableName: tableName, Key: { athleteEmail } }));
    return { success: true, message: "Strava disconnected" };
  } catch (err) {
    console.error("Unexpected error in stravaDisconnect:", err);
    return { success: false, message: FAILURE_MESSAGE };
  }
};
