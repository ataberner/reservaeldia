import { emailBrand } from "./theme";
import type { WelcomeEmailData } from "./types";

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
