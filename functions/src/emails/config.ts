import { defineSecret, defineString } from "firebase-functions/params";
import type { EmailMode } from "./types";
export { isEmptyEmailData } from "./templateData";

export const EMAIL_REGION = "us-east-1";
export const EMAIL_FROM_NAME = "Reserva el Día";
export const EMAIL_FROM_ADDRESS = "notificaciones@reservaeldia.com.ar";
export const EMAIL_REPLY_TO_NAME = "Agus de Reserva el Día";
export const EMAIL_REPLY_TO_ADDRESS = "hola@reservaeldia.com.ar";
export const SANDBOX_RECIPIENT = "reservaeldia.invitaciones@gmail.com";
// Operational recipient, never supplied by a caller or a template.
export const NEW_USER_NOTIFICATION_RECIPIENT = "reservaeldia.invitaciones@gmail.com";
export const EMAIL_TIMEOUT_MS = 8_000;
export const WELCOME_DASHBOARD_URL = "https://reservaeldia.com.ar/dashboard";
export const WELCOME_SERVICE_ACCOUNT = "welcome-email-sender@reservaeldia-7a440.iam.gserviceaccount.com";

export const emailMode = defineString("EMAIL_MODE", { default: "disabled" });
// Shared cutoff for both registration effects. Empty fails closed; UTC ISO with milliseconds.
export const welcomeEmailActivationAt = defineString("WELCOME_EMAIL_ACTIVATION_AT", { default: "" });
export const awsSesAccessKeyId = defineSecret("AWS_SES_ACCESS_KEY_ID");
export const awsSesSecretAccessKey = defineSecret("AWS_SES_SECRET_ACCESS_KEY");

export function resolveEmailMode(value: unknown): EmailMode | "invalid" {
  if (value === undefined || value === "" || value === "disabled") return "disabled";
  if (value === "sandbox" || value === "production") return value;
  return "invalid";
}

export function isEmailRecipient(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && !/[\r\n]/.test(value) &&
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value);
}

export function isEmailCorrelationId(value: unknown): value is string {
  return typeof value === "string" && !/[\r\n]/.test(value) &&
    /^(?:email-test|welcome|new-user-notification)-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

export function welcomeActivationSkipReason(activation: unknown, creationTime: unknown): string | undefined {
  if (activation === undefined || activation === "") return "WELCOME_ACTIVATION_NOT_CONFIGURED";
  if (typeof activation !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(activation)) {
    return "WELCOME_ACTIVATION_INVALID";
  }
  const activatedAt = Date.parse(activation);
  if (!Number.isFinite(activatedAt) || new Date(activatedAt).toISOString() !== activation) return "WELCOME_ACTIVATION_INVALID";
  const createdAt = typeof creationTime === "string" ? Date.parse(creationTime) : NaN;
  if (!Number.isFinite(createdAt)) return "WELCOME_CREATION_TIME_INVALID";
  if (createdAt < activatedAt) return "WELCOME_BEFORE_ACTIVATION";
  return undefined;
}
