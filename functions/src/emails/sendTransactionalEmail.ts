import { info } from "firebase-functions/logger";
import { emailMode, isEmailCorrelationId, isEmailRecipient, resolveEmailMode, SANDBOX_RECIPIENT } from "./config";
import { renderEmail } from "./renderEmail";
import { isEmailTemplateRequest } from "./templateRegistry";
import { sendViaSes } from "./sesClient";
import { emailFailure } from "./types";
import type { EmailResult, EmailTransportRequest, TransactionalEmailRequest } from "./types";

type EmailLog = {
  template: TransactionalEmailRequest["template"] | "invalid";
  mode: ReturnType<typeof resolveEmailMode>;
  state: EmailResult["state"];
  durationMs: number;
  messageId: string | null;
  correlationId: string | null;
  errorCode: EmailResult["errorCode"];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function validRequest(value: unknown): value is TransactionalEmailRequest {
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== "data,metadata,template,to") {
    return false;
  }
  return isEmailRecipient(value.to) &&
    isRecord(value.metadata) && Object.keys(value.metadata).join(",") === "correlationId" &&
    isEmailCorrelationId(value.metadata.correlationId) && isEmailTemplateRequest(value);
}

// Dependencies make tests offline; production uses the single default service.
export function createTransactionalEmailService(dependencies: {
  getMode: () => unknown;
  render: typeof renderEmail;
  transport: (request: EmailTransportRequest) => Promise<EmailResult>;
  log: (entry: EmailLog) => void;
}) {
  return async (request: TransactionalEmailRequest): Promise<EmailResult> => {
    const startedAt = Date.now();
    const mode = resolveEmailMode(dependencies.getMode());
    const valid = validRequest(request);
    const finish = (result: EmailResult) => {
      dependencies.log({
        template: valid ? request.template : "invalid",
        mode,
        state: result.state,
        durationMs: Math.max(0, Date.now() - startedAt),
        messageId: result.messageId,
        correlationId: valid ? request.metadata.correlationId : null,
        errorCode: result.errorCode,
      });
      return result;
    };

    if (!valid) return finish(emailFailure("blocked", "EMAIL_INVALID_REQUEST"));
    if (mode === "invalid") return finish(emailFailure("blocked", "EMAIL_INVALID_MODE"));
    if (mode === "disabled") return finish(emailFailure("blocked", "EMAIL_DISABLED"));
    if (mode === "production") {
      return finish(emailFailure("blocked", "EMAIL_PRODUCTION_NOT_ENABLED"));
    }
    if (request.to !== SANDBOX_RECIPIENT) {
      return finish(emailFailure("blocked", "EMAIL_RECIPIENT_NOT_ALLOWED"));
    }

    let content;
    try {
      content = await dependencies.render(request);
    } catch {
      return finish(emailFailure("failed", "EMAIL_RENDER_FAILED"));
    }
    return finish(await dependencies.transport({ to: request.to, content }));
  };
}

export const sendTransactionalEmail = createTransactionalEmailService({
  getMode: () => emailMode.value(),
  render: renderEmail,
  transport: sendViaSes,
  log: (entry) => info("transactional_email", entry),
});
