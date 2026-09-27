import type { EmailTemplateRequest, EmailTransportRequest, RenderedEmail, TransactionalEmailRequest } from "../src/emails/types";
import { renderEmail } from "../src/emails/renderEmail";

// Compiled with noEmit by welcomeEmail.test.mjs; never invoked or deployed.
export function verifyEmailTypes(template: "test" | "welcome") {
  const url = "https://reservaeldia.com.ar/dashboard";
  const envelope = { to: "synthetic@example.invalid", metadata: { correlationId: "synthetic" } };
  const valid: EmailTemplateRequest[] = [
    { template: "test", data: {} },
    { template: "welcome", data: { dashboardUrl: url } },
    { template: "welcome", data: { name: "María", dashboardUrl: url } },
  ];
  valid.forEach(input => { void renderEmail(input); });
  const sendable: TransactionalEmailRequest = { ...envelope, template: "welcome", data: { dashboardUrl: url } };
  void renderEmail(sendable);
  // @ts-expect-error Welcome requires dashboardUrl.
  void renderEmail({ template: "welcome", data: {} });
  // @ts-expect-error Test does not accept welcome data.
  void renderEmail({ template: "test", data: { dashboardUrl: url } });
  // @ts-expect-error Name must be a string.
  void renderEmail({ template: "welcome", data: { name: 123, dashboardUrl: url } });
  // @ts-expect-error Unknown templates are rejected statically.
  void renderEmail({ template: "marketing", data: {} });
  // @ts-expect-error A union template cannot be paired with unrelated data.
  void renderEmail({ template, data: {} });
  // @ts-expect-error The sending boundary preserves the same discrimination.
  const invalid: TransactionalEmailRequest = { ...envelope, template: "test", data: { dashboardUrl: url } };
  return invalid;
}

// These contracts expose no caller/template-controlled sender or header fields.
type ForbiddenMailFields = "from" | "From" | "FromEmailAddress" | "replyTo" |
  "Reply-To" | "replyToAddresses" | "ReplyToAddresses" | "headers" | "Headers";
type AssertNever<T extends never> = T;
export type VerifyMailFields = AssertNever<Extract<ForbiddenMailFields,
  keyof TransactionalEmailRequest | keyof EmailTemplateRequest | keyof EmailTransportRequest | keyof RenderedEmail>>;
