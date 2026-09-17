import { SESClient } from "@aws-sdk/client-ses";
import { assertExternalEffectAllowed } from "../firebaseAdmin";

export function createSesClient() {
  assertExternalEffectAllowed("correo SES");
  return new SESClient({
    region: "us-east-1",

    credentials: {
      accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID!,
      secretAccessKey:
        process.env.AWS_SES_SECRET_ACCESS_KEY!,
    },
  });
}
