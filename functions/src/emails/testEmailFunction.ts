import { randomUUID } from "crypto";
import { onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import { awsSesAccessKeyId, awsSesSecretAccessKey, isEmptyEmailData, SANDBOX_RECIPIENT } from "./config";
import type { TransactionalEmailRequest } from "./types";

async function sendTestEmail(request: TransactionalEmailRequest) {
  // Firebase discovery needs only the declaration. Load rendering/SES on the
  // first authorized invocation; Node caches the module for later invocations.
  const { sendTransactionalEmail } = await import("./sendTransactionalEmail");
  return sendTransactionalEmail(request);
}

export function createTestEmailHandler(
  send = sendTestEmail,
  now = Date.now
) {
  // Deliberately small per-instance guard, not a distributed quota. IAM remains
  // the access boundary. Cold starts/redeploys reset this operational limit.
  let attempts = 0;
  let lastAttemptAt: number | undefined;
  return async (req: Request, res: Response): Promise<void> => {
    res.set("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res.set("Allow", "POST").status(405).json({ errorCode: "METHOD_NOT_ALLOWED" });
      return;
    }
    const bodyIsEmpty = req.body === undefined || req.body === "" || isEmptyEmailData(req.body);
    if (!bodyIsEmpty || Object.keys(req.query).length !== 0) {
      res.status(400).json({ errorCode: "TEST_INPUT_NOT_ALLOWED" });
      return;
    }
    const timestamp = now();
    if (attempts >= 3 || (lastAttemptAt !== undefined && timestamp - lastAttemptAt < 60_000)) {
      res.status(429).json({ errorCode: "TEST_RATE_LIMITED" });
      return;
    }
    attempts += 1;
    lastAttemptAt = timestamp;
    const correlationId = `email-test-${randomUUID()}`;
    const result = await send({
      to: SANDBOX_RECIPIENT,
      template: "test",
      data: {},
      metadata: { correlationId },
    });
    const status = result.ok ? 200 : result.state === "blocked" ? 412 :
      result.state === "unknown" ? 504 : 502;
    res.status(status).json({ ...result, correlationId });
  };
}

export const testTransactionalEmail = onRequest({
  region: "us-central1",
  invoker: "private",
  serviceAccount: "email-sandbox-sender@reservaeldia-7a440.iam.gserviceaccount.com",
  cors: false,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  cpu: 1,
  memory: "256MiB",
  timeoutSeconds: 20,
  secrets: [awsSesAccessKeyId, awsSesSecretAccessKey],
}, createTestEmailHandler());
