import { info } from "firebase-functions/logger";
import { emailMode, isEmailCorrelationId, isEmailRecipient, resolveEmailMode,
  SANDBOX_RECIPIENT, NEW_USER_NOTIFICATION_RECIPIENT } from "./config";
import { renderEmail } from "./renderEmail";
import { isEmailTemplateRequest } from "./templateRegistry";
import { sendViaSes } from "./sesClient";
import { emailFailure } from "./types";
import type { EmailResult, EmailTransportRequest, TransactionalEmailRequest } from "./types";

type EmailLog = {
  template: TransactionalEmailRequest["template"] | "invalid";
  mode: ReturnType<typeof resolveEmailMode>;
  state: EmailResult["state"];
  messageId: string | null;
  correlationId: string | null;
  errorCode: EmailResult["errorCode"];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function validRequest(value: unknown): value is TransactionalEmailRequest {
  if (!isRecord(value)) return false;
  const internal = value.template === "newUserNotification";
  if (Object.keys(value).sort().join(",") !== (internal ? "data,metadata,template" : "data,metadata,template,to")) return false;
  return (internal || isEmailRecipient(value.to)) &&
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
    const mode = resolveEmailMode(dependencies.getMode());
    const valid = validRequest(request);
    const finish = (result: EmailResult) => {
      try { dependencies.log({
        template: valid ? request.template : "invalid",
        mode,
        state: result.state,
        messageId: result.messageId,
        correlationId: valid ? request.metadata.correlationId : null,
        errorCode: result.errorCode,
      }); } catch { /* logging cannot change an accepted result */ }
      return result;
    };

    if (!valid) return finish(emailFailure("blocked", "EMAIL_INVALID_REQUEST"));
    if (mode === "invalid") return finish(emailFailure("blocked", "EMAIL_INVALID_MODE"));
    if (mode === "disabled") return finish(emailFailure("blocked", "EMAIL_DISABLED"));
    if (mode === "sandbox" && request.template === "newUserNotification") {
      return finish(emailFailure("blocked", "EMAIL_SANDBOX_BUSINESS_BLOCKED"));
    }
    const to = request.template === "newUserNotification" ? NEW_USER_NOTIFICATION_RECIPIENT : request.to;
    if (mode === "sandbox" && to !== SANDBOX_RECIPIENT) {
      return finish(emailFailure("blocked", "EMAIL_RECIPIENT_NOT_ALLOWED"));
    }

    let content;
    try {
      content = await dependencies.render(request);
    } catch {
      return finish(emailFailure("failed", "EMAIL_RENDER_FAILED"));
    }
    return finish(await dependencies.transport({ to, content }));
  };
}

export const sendTransactionalEmail = createTransactionalEmailService({
  getMode: () => emailMode.value(),
  render: renderEmail,
  transport: sendViaSes,
  log: (entry) => info("transactional_email", entry),
});
