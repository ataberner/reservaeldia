import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { warn } from "firebase-functions/logger";
import { assertExternalEffectAllowed } from "../firebaseAdmin";
import { resolveEmailAwsCredentials } from "./awsCredentials";
import { sanitizeAwsError, type SafeAwsError } from "./awsDiagnostics";
import {
  EMAIL_FROM_NAME,
  EMAIL_FROM_ADDRESS,
  EMAIL_REGION,
  EMAIL_TIMEOUT_MS,
  SANDBOX_RECIPIENT,
} from "./config";
import { emailFailure } from "./types";
import type { EmailResult, EmailTransportRequest } from "./types";

// Credentials are resolved lazily. A future temporary-credentials provider can
// replace this callback without changing the transactional email contract.
export function createSesClient() {
  assertExternalEffectAllowed("correo SES");
  if (process.env.NODE_ENV === "test" || process.env.NODE_TEST_CONTEXT) {
    throw Object.assign(new Error("SES disabled in tests"), {
      name: "EmailExternalEffectBlocked",
    });
  }
  return new SESv2Client({
    region: EMAIL_REGION,
    maxAttempts: 1,
    requestHandler: {
      connectionTimeout: 2_000,
      requestTimeout: EMAIL_TIMEOUT_MS,
      throwOnRequestTimeout: true,
    },
    credentials: resolveEmailAwsCredentials,
  });
}

type SesClient = Pick<SESv2Client, "send">;

function normalizeSesError(error: unknown): EmailResult {
  const name = error instanceof Error ? error.name : "";
  switch (name) {
    case "EmailExternalEffectBlocked":
      return emailFailure("blocked", "EMAIL_EXTERNAL_EFFECT_BLOCKED");
    case "EmailSecretsMissing":
      return emailFailure("blocked", "EMAIL_SECRETS_MISSING");
    case "AccessDeniedException":
    case "ForbiddenException":
    case "UnrecognizedClientException":
    case "InvalidSignatureException":
      return emailFailure("failed", "SES_ACCESS_DENIED");
    case "MessageRejected":
      return emailFailure("failed", "SES_REJECTED");
    case "TooManyRequestsException":
    case "LimitExceededException":
      return emailFailure("failed", "SES_THROTTLED");
    case "BadRequestException":
    case "MailFromDomainNotVerifiedException":
    case "NotFoundException":
    case "AccountSuspendedException":
    case "SendingPausedException":
      return emailFailure("failed", "SES_CONFIGURATION_ERROR");
    case "AbortError":
    case "TimeoutError":
      // SES may have accepted the message before the connection timed out.
      return emailFailure("unknown", "SES_TIMEOUT");
    default:
      return emailFailure("unknown", "SES_UNKNOWN_OUTCOME");
  }
}

export function createSesTransport(
  clientFactory: () => SesClient = createSesClient,
  timeoutMs = EMAIL_TIMEOUT_MS,
  logAccessDenied: (details: SafeAwsError) => void = (details) => warn("transactional_email_aws_error", details)
) {
  let client: SesClient | undefined;
  return async (request: EmailTransportRequest): Promise<EmailResult> => {
    // Defense in depth: this adapter is sandbox-only during phase 1.
    if (request.to !== SANDBOX_RECIPIENT) {
      return emailFailure("blocked", "EMAIL_RECIPIENT_NOT_ALLOWED");
    }
    try {
      assertExternalEffectAllowed("correo SES");
    } catch {
      return emailFailure("blocked", "EMAIL_EXTERNAL_EFFECT_BLOCKED");
    }

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      client ??= clientFactory();
      const command = new SendEmailCommand({
        // RFC 2047 preserves "Día" while keeping the address header ASCII.
        FromEmailAddress: `=?UTF-8?B?${Buffer.from(EMAIL_FROM_NAME, "utf8").toString("base64")}?= <${EMAIL_FROM_ADDRESS}>`,
        Destination: { ToAddresses: [request.to] },
        Content: {
          Simple: {
            Subject: { Data: request.content.subject, Charset: "UTF-8" },
            Body: {
              Html: { Data: request.content.html, Charset: "UTF-8" },
              Text: { Data: request.content.text, Charset: "UTF-8" },
            },
          },
        },
      });
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(Object.assign(new Error("SES deadline exceeded"), { name: "TimeoutError" }));
          controller.abort();
        }, timeoutMs);
      });
      const response = await Promise.race([
        client.send(command, { abortSignal: controller.signal }),
        deadline,
      ]);
      const messageId = response.MessageId;
      if (typeof messageId !== "string" || /[\r\n]/.test(messageId) ||
        !/^[A-Za-z0-9_-]{1,256}$/.test(messageId)) {
        return emailFailure("unknown", "SES_INVALID_RESPONSE");
      }
      return { ok: true, state: "accepted", messageId, errorCode: null, retryable: false };
    } catch (error: unknown) {
      const result = normalizeSesError(error);
      if (result.errorCode === "SES_ACCESS_DENIED") {
        // Observability cannot change delivery state or trigger a retry.
        try { logAccessDenied(sanitizeAwsError(error)); } catch { /* omit diagnostic */ }
      }
      return result;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

export const sendViaSes = createSesTransport();
