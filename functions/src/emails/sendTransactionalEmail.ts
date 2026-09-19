import { info } from "firebase-functions/logger";
import { emailMode, isEmptyEmailData, resolveEmailMode, SANDBOX_RECIPIENT } from "./config";
import { renderEmail } from "./renderEmail";
import { sendViaSes } from "./sesClient";
import { emailFailure } from "./types";
import type { EmailResult, EmailTransportRequest, TransactionalEmailRequest } from "./types";

type EmailLog = {
  template: "test" | "invalid";
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
  return typeof value.to === "string" &&
    !/[\r\n]/.test(value.to) &&
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value.to) &&
    value.to.length <= 254 &&
    value.template === "test" && isEmptyEmailData(value.data) &&
    isRecord(value.metadata) && Object.keys(value.metadata).join(",") === "correlationId" &&
    typeof value.metadata.correlationId === "string" &&
    !/[\r\n]/.test(value.metadata.correlationId) &&
    /^email-test-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value.metadata.correlationId
    );
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
        template: valid ? "test" : "invalid",
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
      content = await dependencies.render({ template: request.template, data: request.data });
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
