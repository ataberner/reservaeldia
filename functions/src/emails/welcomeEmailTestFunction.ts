import { randomUUID } from "crypto";
import { onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import {
  awsSesAccessKeyId, awsSesSecretAccessKey, emailMode,
  isEmptyEmailData, resolveEmailMode, SANDBOX_RECIPIENT,
} from "./config";
import { emailBrand } from "./theme";
import type { TransactionalEmailRequest } from "./types";

async function sendWelcomeEmailTest(request: TransactionalEmailRequest) {
  // Discovery only declares the private endpoint; the existing sender owns
  // rendering, mode/recipient checks, logging and the SES adapter.
  const { sendTransactionalEmail } = await import("./sendTransactionalEmail");
  return sendTransactionalEmail(request);
}

export function createWelcomeEmailTestHandler(
  send = sendWelcomeEmailTest,
  now = Date.now,
  getMode: () => unknown = () => emailMode.value()
) {
  // Temporary smoke test, separate from the unchanged technical TestEmail.
  // This per-instance guard resets on cold start; it is not a distributed quota.
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
    // Keep this endpoint sandbox-only even if the service later supports production.
    if (resolveEmailMode(getMode()) !== "sandbox") {
      res.status(412).json({ errorCode: "WELCOME_TEST_SANDBOX_REQUIRED" });
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
      template: "welcome",
      data: { name: "Agustín", dashboardUrl: `${emailBrand.siteUrl}/dashboard` },
      metadata: { correlationId },
    });
    const status = result.ok ? 200 : result.state === "blocked" ? 412 :
      result.state === "unknown" ? 504 : 502;
    res.status(status).json({ ...result, correlationId });
  };
}

// Remove this temporary export/handler after the operator records the real smoke.
export const testWelcomeEmail = onRequest({
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
}, createWelcomeEmailTestHandler());
