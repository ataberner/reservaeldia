import { SESClient } from "@aws-sdk/client-ses";

export function createSesClient() {
  return new SESClient({
    region: "us-east-1",

    credentials: {
      accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID!,
      secretAccessKey:
        process.env.AWS_SES_SECRET_ACCESS_KEY!,
    },
  });
}