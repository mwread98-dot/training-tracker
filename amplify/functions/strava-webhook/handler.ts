import { APIGatewayProxyResultV2, APIGatewayProxyEventV2 } from "aws-lambda";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const sqsClient = new SQSClient({});

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext.http.method;

  // 1. Handle Strava Handshake/Validation Check (GET)
  if (method === "GET") {
    const queryParams = event.queryStringParameters || {};
    const mode = queryParams["hub.mode"];
    const token = queryParams["hub.verify_token"];
    const challenge = queryParams["hub.challenge"];

    if (mode === "subscribe" && token === "YOUR_CUSTOM_VERIFY_TOKEN") {
      return {
        statusCode: 200,
        body: JSON.stringify({ "hub.challenge": challenge }),
      };
    }
    return { statusCode: 403, body: "Forbidden" };
  }

  // 2. Ingest New Webhook Event (POST)
  if (method === "POST") {
    const queueUrl = process.env.SQS_QUEUE_URL;
    if (!queueUrl) {
      console.error("Configuration Error: SQS_QUEUE_URL is not set.");
      return { statusCode: 500, body: "Internal Configuration Error" };
    }

    try {
      // Offload payload immediately to SQS queue
      await sqsClient.send(new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: event.body || "{}",
      }));

      // Exit early and successfully before Strava's 2-second timeout window closes
      return { statusCode: 200, body: "EVENT_RECEIVED" };
    } catch (err) {
      console.error("Failed to deposit event payload into SQS:", err);
      return { statusCode: 500, body: "Failed to queue event" };
    }
  }

  return { statusCode: 404, body: "Not Found" };
};