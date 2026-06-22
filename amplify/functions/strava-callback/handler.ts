import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// AppSync resolver event shape for a custom mutation
type Event = {
  arguments: {
    code: string;
    athleteEmail: string;
  };
};

export const handler = async (event: Event) => {
  const { code, athleteEmail } = event.arguments;
  const clientId = process.env.STRAVA_CLIENT_ID!;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET!;
  const tableName = process.env.STRAVA_TOKEN_TABLE!;

  try {
    // Exchange the one-time OAuth code for access + refresh tokens
    const res = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Strava token exchange failed:", err);
      return { success: false, message: "Strava token exchange failed" };
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_at: number;
      athlete: { id: number };
      errors?: unknown;
    };

    if (data.errors) {
      return { success: false, message: "Strava returned an error" };
    }

    // Store tokens in DynamoDB (Lambda has IAM write access granted in backend.ts)
    await dynamo.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          athleteEmail: athleteEmail.toLowerCase(),
          stravaAthleteId: String(data.athlete.id),
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: data.expires_at,
          lastSyncAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      })
    );

    return { success: true, message: "Strava connected" };
  } catch (err) {
    console.error("Unexpected error in stravaCallback:", err);
    return { success: false, message: "Unexpected error" };
  }
};
