import { emailBrand } from "./theme";
import type { WelcomeEmailData, NewUserNotificationEmailData } from "./types";

export function isEmailDataRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype;
}

export function isEmptyEmailData(value: unknown): value is Record<string, never> {
  return isEmailDataRecord(value) && Object.keys(value).length === 0;
}

export function isWelcomeEmailData(value: unknown): value is WelcomeEmailData {
  if (!isEmailDataRecord(value) || Object.keys(value).some(key => key !== "name" && key !== "dashboardUrl") ||
    (value.name !== undefined && typeof value.name !== "string") ||
    typeof value.dashboardUrl !== "string" || /[\s\\]/.test(value.dashboardUrl)) return false;
  try {
    const url = new URL(value.dashboardUrl);
    // The CTA points to our platform, never relative/local URLs or credentials.
    return url.origin === emailBrand.siteUrl && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isNewUserNotificationEmailData(value: unknown): value is NewUserNotificationEmailData {
  if (!isEmailDataRecord(value) || Object.keys(value).some(key =>
    !["name", "email", "registrationMethod", "createdAt"].includes(key))) return false;
  if ((value.name !== undefined && typeof value.name !== "string") ||
    (value.email !== undefined && typeof value.email !== "string") ||
    typeof value.registrationMethod !== "string" ||
    !["password", "google.com", "unavailable"].includes(value.registrationMethod)) return false;
  if (value.createdAt === undefined) return true;
  return typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt)) &&
    new Date(value.createdAt).toISOString() === value.createdAt;
}
