import { defineSecret, defineString } from "firebase-functions/params";
import type { EmailMode } from "./types";

export const EMAIL_REGION = "us-east-1";
export const EMAIL_FROM_NAME = "Reserva el Día";
export const EMAIL_FROM_ADDRESS = "notificaciones@reservaeldia.com.ar";
export const SANDBOX_RECIPIENT = "reservaeldia.invitaciones@gmail.com";
export const EMAIL_TIMEOUT_MS = 8_000;

export const emailMode = defineString("EMAIL_MODE", { default: "disabled" });
export const awsSesAccessKeyId = defineSecret("AWS_SES_ACCESS_KEY_ID");
export const awsSesSecretAccessKey = defineSecret("AWS_SES_SECRET_ACCESS_KEY");

export function resolveEmailMode(value: unknown): EmailMode | "invalid" {
  if (value === undefined || value === "" || value === "disabled") return "disabled";
  if (value === "sandbox" || value === "production") return value;
  return "invalid";
}

export function isEmptyEmailData(value: unknown): value is Record<string, never> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === 0;
}
