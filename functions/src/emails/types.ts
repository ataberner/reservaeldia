export type EmailMode = "disabled" | "sandbox" | "production";

export type WelcomeEmailData = {
  name?: string;
  dashboardUrl: string;
};

export type NewUserNotificationEmailData = {
  name?: string;
  email?: string;
  registrationMethod: "password" | "google.com" | "unavailable";
  createdAt?: string;
};

export type EmailTemplateData = {
  test: Record<string, never>;
  welcome: WelcomeEmailData;
  newUserNotification: NewUserNotificationEmailData;
};

// Map first, then index: Pick over a union would lose template/data correlation.
export type EmailTemplateRequest = {
  [Template in keyof EmailTemplateData]: {
    template: Template;
    data: EmailTemplateData[Template];
  };
}[keyof EmailTemplateData];

export type TransactionalEmailRequest = {
  [Template in keyof EmailTemplateData]: {
    template: Template;
    data: EmailTemplateData[Template];
  } & (Template extends "newUserNotification" ? { to?: never } : { to: string });
}[keyof EmailTemplateData] & {
  metadata: { correlationId: string };
};

export type RenderedEmail = { subject: string; html: string; text: string };
export type EmailTransportRequest = { to: string; content: RenderedEmail };

export type EmailErrorCode =
  | "EMAIL_DISABLED" | "EMAIL_INVALID_MODE" | "EMAIL_SANDBOX_BUSINESS_BLOCKED"
  | "EMAIL_INVALID_REQUEST" | "EMAIL_RECIPIENT_NOT_ALLOWED"
  | "EMAIL_EXTERNAL_EFFECT_BLOCKED" | "EMAIL_SECRETS_MISSING" | "EMAIL_RENDER_FAILED"
  | "SES_ACCESS_DENIED" | "SES_REJECTED" | "SES_THROTTLED" | "SES_CONFIGURATION_ERROR"
  | "SES_TIMEOUT" | "SES_UNKNOWN_OUTCOME" | "SES_INVALID_RESPONSE";

// Acceptance is not delivery. No result in this phase schedules a retry.
export type EmailResult =
  | { ok: true; state: "accepted"; messageId: string; errorCode: null; retryable: false }
  | { ok: false; state: "blocked" | "failed" | "unknown"; messageId: null;
      errorCode: EmailErrorCode; retryable: false };

export function emailFailure(
  state: "blocked" | "failed" | "unknown",
  errorCode: EmailErrorCode
): EmailResult {
  return { ok: false, state, messageId: null, errorCode, retryable: false };
}
