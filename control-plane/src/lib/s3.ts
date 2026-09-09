import { S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { Agent as HttpsAgent } from "https";

export const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ACCOUNT_ID
    ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : undefined,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  requestHandler: new NodeHttpHandler({
    requestTimeout: 60_000,
    connectionTimeout: 60_000,
    httpsAgent: new HttpsAgent({
      maxSockets: 200,
      keepAlive: true,
    }),
  }),
});
